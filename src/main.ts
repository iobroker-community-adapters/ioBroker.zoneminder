import * as utils from '@iobroker/adapter-core';

import { ZoneMinder } from './lib/api';
import type { AlarmMessage, ZmMonitorEntry, ZmRecord, ZmValue } from './lib/types';
import { bToMb, FUNCSTATES, ZM_EVENT_PLACEHOLDER } from './lib/utils';

/** How a value is created as state. `null` = the object exists already, only the value is written. */
type StateKind = 'time' | 'size' | 'sizeb' | 'level' | 'default_num' | 'text' | 'date';

interface FoundState {
    sid: string;
    name: string;
    kind: StateKind | null;
    val: ioBroker.StateValue;
}

const STATE_COMMONS: Record<StateKind, Pick<ioBroker.StateCommon, 'role' | 'type' | 'unit'>> = {
    time: { role: 'value', type: 'number', unit: 'sec.' },
    size: { role: 'value', type: 'number', unit: 'Mb' },
    sizeb: { role: 'value', type: 'number', unit: 'byte' },
    level: { role: 'value', type: 'number', unit: '%' },
    default_num: { role: 'value', type: 'number' },
    text: { role: 'value', type: 'string' },
    // type 'string' although the value is Date.now() - kept, existing objects have it like this
    date: { role: 'date', type: 'string' },
};

const SIZE_KEYS = [
    'ArchivedEventDiskSpace',
    'MonthEventDiskSpace',
    'WeekEventDiskSpace',
    'DayEventDiskSpace',
    'HourEventDiskSpace',
    'TotalEventDiskSpace',
    'used',
    'total',
    'avail',
];
const NUMBER_KEYS = [
    'Sequence',
    'CaptureFPS',
    'AnalysisFPS',
    'CaptureBandwidth',
    'MonitorId',
    'EventId',
    'MaxFPS',
    'AlarmMaxFPS',
    'ZoneCount',
    'TotalEvents',
    'HourEvents',
    'DayEvents',
    'WeekEvents',
    'MonthEvents',
    'ArchivedEvents',
];
const TEXT_KEYS = ['Status', 'camUrl', 'Name', 'Cause', 'VideoUrl', 'SnapUrl'];

class ZoneminderAdapter extends utils.Adapter {
    private requestInterval: ioBroker.Timeout | undefined;
    private zm: ZoneMinder | null = null;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({ ...options, name: 'zoneminder' });

        this.on('ready', () => this.onReady());
        this.on('stateChange', (id, state) => this.onStateChange(id, state));
        this.on('unload', callback => this.onUnload(callback));
    }

    private async onReady(): Promise<void> {
        // Reset the connection indicator during startup
        await this.setStateAsync('info.connection', false, true);

        const zm = new ZoneMinder(
            {
                user: this.config.user,
                password: this.config.password,
                host: this.config.host,
                zmEvent: this.config.zmEvent,
            },
            this,
        );
        this.zm = zm;

        zm.on('connect', () => {
            this.log.debug('Connected to Api');
            void this.setStateAsync('info.connection', true, true);
            void zm.monitors().then(json => (json ? this.createMonitors(json.monitors) : undefined));
        });
        zm.on('error', () => void this.setStateAsync('info.connection', false, true));
        zm.on('alarm', data => void this.onAlarm(data));

        this.startPolling();

        // all states changes inside the adapters namespace are subscribed
        await this.subscribeStatesAsync('*');
    }

    private startPolling(): void {
        // Number(): instances configured with the old HTML admin stored the interval as string
        this.requestInterval = this.setTimeout(() => void this.setMonitors(), Number(this.config.pollingMon) * 1000);
    }

    private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
        if (!state || state.ack || !this.zm) {
            return;
        }
        const command = id.split('.').pop();
        const camId = id.split('.')[2].split('_')[1];
        this.log.info(`${camId}__${command}___${JSON.stringify(state)}`);

        if (command === 'Function') {
            const data = await this.zm.functionChange(camId, Number(state.val));
            this.log.debug(`set State ${JSON.stringify(data)}`);
            if (data?.message === 'Saved') {
                await this.setStateAsync(id, state.val, true);
            }
        }
        if (command === 'Enabled') {
            const data = await this.zm.activeChange(camId, state.val === true ? 1 : 0);
            this.log.debug(`set State ${JSON.stringify(data)}`);
            if (data?.message === 'Saved') {
                await this.setStateAsync(id, state.val, true);
            }
        }
    }

    private onUnload(callback: () => void): void {
        try {
            this.clearTimeout(this.requestInterval);
            this.zm?.websocketClose();

            this.log.info('cleaned everything up...');
        } catch {
            // ignore
        }
        callback();
    }

    private async onAlarm(data: AlarmMessage): Promise<void> {
        if (!this.zm) {
            return;
        }
        this.log.debug(`ALARM_${JSON.stringify(data)}`);
        const event = data.events[0];
        const vid = this.zm.getVideoLink(event.EventId);
        const snap = this.zm.getSnapLink(event.EventId);
        this.log.debug(`recivevid_ ${vid}`);

        for (const base of [
            `${this.namespace}.cam_${event.MonitorId}.zmEvent`,
            `${this.namespace}.history.LastzmEvent`,
        ]) {
            await this.setStateAsync(`${base}.VideoUrl`, vid, true);
            await this.setStateAsync(`${base}.SnapUrl`, snap, true);
            await this.setStateAsync(`${base}.MonitorId`, event.MonitorId, true);
            await this.setStateAsync(`${base}.EventId`, event.EventId, true);
            await this.setStateAsync(`${base}.Name`, event.Name, true);
            await this.setStateAsync(`${base}.Cause`, event.Cause, true);
            await this.setStateAsync(`${base}.Date`, Date.now(), true);
        }
    }

    /** Polls the monitor list and updates the values */
    private async setMonitors(): Promise<void> {
        this.log.debug('SetStates');
        const json = await this.zm?.monitors();

        for (const monitor of json?.monitors ?? []) {
            const id = `${this.namespace}.cam_${monitor.Monitor.Id}`;

            for (const s of this.findState(`${id}.monitor`, monitor.Monitor)) {
                await this.setStateChangedAsync(`${s.sid}.${s.name}`, s.val, true);
            }
            for (const s of this.findState(`${id}.info`, monitor.Monitor_Status)) {
                await this.setStateAsync(`${s.sid}.${s.name}`, s.val, true);
            }
        }

        this.startPolling();
    }

    private async createMonitors(monitors: ZmMonitorEntry[]): Promise<void> {
        this.log.debug(JSON.stringify(monitors));

        const camIds: string[] = [];

        // create States for zmEvent
        await this.setObjectNotExistsAsync('history', { type: 'channel', common: { name: 'history' }, native: {} });
        for (const s of this.findState(`${this.namespace}.history.LastzmEvent`, ZM_EVENT_PLACEHOLDER)) {
            await this.createZmState(s.sid, s.name, s.kind);
        }

        const list = await this.getForeignObjectsAsync(`${this.namespace}.*`, 'device');

        for (const [index, monitor] of monitors.entries()) {
            const deviceName = `cam_${monitor.Monitor.Id}`;
            const id = `${this.namespace}.${deviceName}`;
            camIds.push(id);

            if (list[id]) {
                this.log.debug('monitor found in Objects');
            }

            // create monitors (same objects as the deprecated createDevice/createChannel produced)
            await this.setObjectNotExistsAsync(deviceName, {
                type: 'device',
                common: { name: monitor.Monitor.Name || deviceName },
                native: {},
            });
            await this.setObjectNotExistsAsync(`${deviceName}.info`, {
                type: 'channel',
                common: { name: 'info' },
                native: {},
            });
            await this.setObjectNotExistsAsync(`${deviceName}.monitor`, {
                type: 'channel',
                common: { name: 'monitor' },
                native: {},
            });
            if (this.config.zmEvent) {
                await this.setObjectNotExistsAsync(`${deviceName}.zmEvent`, {
                    type: 'channel',
                    common: { name: 'zmEvent' },
                    native: {},
                });
            }

            for (const [prop, value] of Object.entries(monitor)) {
                this.log.debug(`Monitor_${index} o.${prop} = ${JSON.stringify(value)}`);
            }

            // add control states for Monitor
            await this.setObjectNotExistsAsync(`${id}.monitor.Function`, {
                common: {
                    name: 'function',
                    role: 'state',
                    write: true,
                    read: true,
                    type: 'number',
                    desc: 'Select the function for the monitor',
                    states: FUNCSTATES,
                },
                type: 'state',
                native: {},
            });
            await this.setObjectNotExistsAsync(`${id}.monitor.Enabled`, {
                common: {
                    name: 'Enabled',
                    type: 'boolean',
                    role: 'switch',
                    read: true,
                    write: true,
                    desc: 'Enable or disable the monitor',
                },
                type: 'state',
                native: {},
            });

            for (const s of this.findState(`${id}.info`, monitor.Monitor_Status)) {
                await this.createZmState(s.sid, s.name, s.kind, s.val);
            }
            for (const s of this.findState(`${id}.monitor`, monitor.Monitor)) {
                await this.createZmState(s.sid, s.name, s.kind, s.val);
            }
            // created even if zmEvent is disabled (without the channel) - kept as it was
            for (const s of this.findState(`${id}.zmEvent`, ZM_EVENT_PLACEHOLDER)) {
                await this.createZmState(s.sid, s.name, s.kind);
            }
        }

        this.log.debug(`CAM_ids: ${JSON.stringify(camIds)}`);
        for (const prop of Object.keys(list)) {
            if (camIds.includes(prop)) {
                this.log.debug(`FOUND in list${prop}`);
            } else {
                await this.delDev(prop);
            }
        }
    }

    /** Deletes only the device object itself, not its channels and states (as before) */
    private async delDev(id: string): Promise<void> {
        this.log.warn(`DEL: ${id}`);
        try {
            await this.delForeignObjectAsync(id);
        } catch (e) {
            this.log.warn((e as Error).message);
        }
    }

    /** Maps the raw API values to the states this adapter writes */
    private findState(sid: string, states: ZmRecord): FoundState[] {
        const result: FoundState[] = [];

        for (const [key, value] of Object.entries(states)) {
            if (SIZE_KEYS.includes(key)) {
                result.push({ sid, name: key, kind: 'size', val: bToMb(value) });
            } else if (key === 'uptime') {
                result.push({ sid, name: key, kind: 'time', val: value });
            } else if (key === 'netin' || key === 'netout') {
                result.push({ sid, name: key, kind: 'sizeb', val: value });
            } else if (key === 'cpu') {
                result.push({ sid, name: key, kind: 'level', val: Math.trunc(Number(value) * 10000) / 100 });
            } else if (key === 'Date') {
                result.push({ sid, name: key, kind: 'date', val: Date.now() });
            } else if (NUMBER_KEYS.includes(key)) {
                // the API delivers numbers as strings
                result.push({
                    sid,
                    name: key,
                    kind: 'default_num',
                    val: value === null || value === '' ? null : Number(value),
                });
            } else if (TEXT_KEYS.includes(key)) {
                result.push({ sid, name: key, kind: 'text', val: value });
            }

            // if Functionmode, change selectorstate
            if (key === 'Function') {
                for (const [funcId, funcName] of Object.entries(FUNCSTATES)) {
                    if (funcName === value) {
                        result.push({ sid, name: 'Function', kind: null, val: Number(funcId) });
                    }
                }
            }

            if (key === 'Enabled') {
                result.push({ sid, name: 'Enabled', kind: null, val: value === 1 || value === '1' });
            }
        }
        this.log.debug(`found states:_${JSON.stringify(result)}`);
        return result;
    }

    private async createZmState(sid: string, name: string, kind: StateKind | null, val?: ZmValue): Promise<void> {
        const id = `${sid}.${name}`;
        if (kind === null) {
            await this.setStateAsync(id, val ?? null, true);
            return;
        }
        await this.setObjectNotExistsAsync(id, {
            common: {
                name,
                write: false,
                read: true,
                ...STATE_COMMONS[kind],
            },
            type: 'state',
            native: {},
        });
        // falsy values (0, '') are not written on creation - kept as it was
        if (val) {
            await this.setStateAsync(id, val, true);
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new ZoneminderAdapter(options);
} else {
    // otherwise start the instance directly
    (() => new ZoneminderAdapter())();
}
