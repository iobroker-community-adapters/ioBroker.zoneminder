import { EventEmitter } from 'node:events';
import { Agent } from 'node:https';
import { stringify } from 'node:querystring';
import axios, { type AxiosRequestConfig } from 'axios';
import { client as WebSocketClient, type connection as WebSocketConnection } from 'websocket';

import type {
    AlarmMessage,
    EventServerMessage,
    LoginResponse,
    MonitorsResponse,
    SaveResponse,
    ZmErrorResponse,
    ZoneMinderOptions,
} from './types';
import { FUNCSTATES } from './utils';

const WEBSOCKET_RECONNECT_TIMER = 60_000; // 1 min
const APP_KEY_INTERVAL = 3_600_000; // 1 h

interface ZoneMinderEvents {
    connect: [LoginResponse];
    error: [unknown];
    alarm: [AlarmMessage];
}

interface MonitorDevice {
    id: number;
    name: string;
    sequence: number;
    image: string;
}

const seqSort = (a: MonitorDevice, b: MonitorDevice): number => {
    if (a.sequence > b.sequence) {
        return 1;
    }
    if (a.sequence < b.sequence) {
        return -1;
    }
    return 0;
};

export class ZoneMinder extends EventEmitter<ZoneMinderEvents> {
    private readonly adapter: ioBroker.Adapter;
    private readonly options: ZoneMinderOptions;

    // auth
    private authkey: string | null = null;
    private accessToken: string | null = null;
    private accessTokenExpires: number | null = null;
    private refreshToken: string | null = null;
    private refreshTokenExpires: number | null = null;
    private refreshTokenTimeout: ioBroker.Timeout | undefined;
    private authUrl = '';
    private isAuth = false;
    /** 0 = no re-auth tried yet, 1 = re-auth was already tried once. Never reset (was a module global before). */
    private tries = 0;

    // zmEventNotification server
    private client: WebSocketClient | null = null;
    private connection: WebSocketConnection | null = null;
    private closed = false;

    public constructor(options: ZoneMinderOptions, adapter: ioBroker.Adapter) {
        super();

        for (const key of ['user', 'password', 'host'] as const) {
            if (!options[key]) {
                throw new Error(`options.${key} must be supplied..`);
            }
        }

        this.adapter = adapter;
        this.options = { ...options, host: options.host.replace(/\/$/, '') };
        this.adapter.log.debug(`data: ${JSON.stringify(this.options)}`);

        void this.auth();
    }

    public websocketClose(): void {
        this.closed = true;
        this.connection?.close();
        this.client?.abort();
    }

    private webSocket(): void {
        if (this.closed) {
            return;
        }
        this.client = new WebSocketClient();

        // extract host from url e.g. http://zoneminder/zm ---> zoneminder
        const host = this.options.host.split('/')[2];

        this.client.on('connectFailed', error => {
            this.adapter.log.debug(`WEBSOCKET: Error: client: ${host} Message: ${error.toString()}`);
            this.adapter.setTimeout(() => this.webSocket(), WEBSOCKET_RECONNECT_TIMER);
        });

        this.client.on('connect', connection => {
            this.connection = connection;
            this.adapter.log.debug('WEBSOCKET Client Connected');
            connection.on('error', error => {
                this.adapter.log.debug(`WEBSOCKET: Error: client:${host} Message: ${error.toString()}`);
                this.adapter.setTimeout(() => this.webSocket(), WEBSOCKET_RECONNECT_TIMER);
            });
            connection.on('close', () => {
                this.adapter.log.debug('WEBSOCKET: closed');
                // reconnect
                this.adapter.setTimeout(() => this.webSocket(), WEBSOCKET_RECONNECT_TIMER);
            });
            connection.on('message', message => {
                if (message.type === 'utf8') {
                    this.adapter.log.debug(`WEBSOCKET: ${message.utf8Data}'`);

                    const data = JSON.parse(message.utf8Data) as EventServerMessage;
                    if (data.event === 'alarm') {
                        this.emit('alarm', data as AlarmMessage);
                    }
                }
            });

            connection.sendUTF(
                JSON.stringify({
                    event: 'auth',
                    data: {
                        user: this.options.user,
                        password: this.options.password,
                    },
                }),
            );
        });

        if (this.options.zmEvent) {
            this.client.connect(`wss://${host}:9000/`, undefined, undefined, undefined, {
                agent: new Agent({ rejectUnauthorized: false }),
            });
        } else {
            this.adapter.log.debug('zmEventServer disabled');
        }
    }

    /**
     * Calls the ZoneMinder API. A non-empty `post` makes it a form-encoded POST.
     *
     * Returns `null` if the call failed (already logged and emitted as `error`) or was skipped because there is no
     * authentication.
     */
    private async request<T>(path: string, post?: Record<string, string> | string | null): Promise<T | null> {
        this.adapter.log.debug('GET_ ');
        if (!this.accessToken && !this.authkey && !this.isAuth) {
            if (this.tries === 0) {
                // API call failed...
                this.adapter.log.debug(`GET_ ${!this.accessToken} ${!this.accessToken} ${!this.isAuth}`);
                void this.auth();
                this.tries = 1;
                return null;
            }
            // API call failed...
            this.adapter.log.debug(`GET_ ins2 ${!this.accessToken} ${!this.accessToken} ${!this.isAuth}`);
            this.adapter.log.error('Cant connect!!');
            this.emit('error', 'Cant connect!!');
            return null;
        }

        const headers: Record<string, string> = { 'user-agent': '@nodeminder-api' };
        const options: AxiosRequestConfig<string> = {
            method: 'GET',
            url: this.options.host + path,
            headers,
            // the body is parsed below, like request-promise delivered it before
            responseType: 'text',
        };

        if (post) {
            options.data = typeof post === 'object' ? stringify(post) : post;
            options.method = 'POST';
            headers['content-type'] = 'application/x-www-form-urlencoded';
        }

        this.adapter.log.debug(`REQUEST: Options ${JSON.stringify(options)}`);
        try {
            const response = await axios.request<string>(options);
            this.adapter.log.debug(`REQUEST: Get data${JSON.stringify(response.data)}`);
            return JSON.parse(response.data) as T;
        } catch (e) {
            let errName: string | undefined;
            if (axios.isAxiosError<string>(e) && typeof e.response?.data === 'string') {
                try {
                    errName = (JSON.parse(e.response.data) as ZmErrorResponse).data?.name;
                } catch {
                    // body is not JSON
                }
            }
            const status = axios.isAxiosError(e) ? e.response?.status : undefined;
            this.adapter.log.error(`${status} ${(e as Error).name} ${errName}`);
            this.emit('error', e);
            return null;
        }
    }

    private reauth(): void {
        this.adapter.log.debug('REAUTH: Get new token');

        this.accessToken = null;
        this.accessTokenExpires = null;
        void this.auth();
    }

    private refresh(): void {
        this.adapter.log.debug('REFRESH: Get new refresh-token');

        this.refreshToken = null;
        this.refreshTokenExpires = null;
        void this.auth();
    }

    private async auth(): Promise<void> {
        this.isAuth = true;

        const authPath = this.refreshToken
            ? `/api/host/login.json?&token=${this.refreshToken}`
            : '/api/host/login.json';

        const json = await this.request<LoginResponse>(
            authPath,
            this.refreshToken ? '' : { user: this.options.user, pass: this.options.password },
        );
        if (!json) {
            this.isAuth = false;
            return;
        }
        this.adapter.log.debug(`AUTH: json Message ${JSON.stringify(json)}`);

        if (json.access_token) {
            this.adapter.log.debug(`AUTH: get access_token ${json.access_token}`);
            this.accessToken = json.access_token;
            if (json.access_token_expires) {
                this.accessTokenExpires = json.access_token_expires;
            }

            // time in Seconds
            if (json.refresh_token_expires && json.refresh_token) {
                this.refreshToken = json.refresh_token;
                this.refreshTokenExpires = json.refresh_token_expires;

                // set Timeout for refresh token
                this.adapter.clearTimeout(this.refreshTokenTimeout);
                this.refreshTokenTimeout = this.adapter.setTimeout(
                    () => this.refresh(),
                    (this.refreshTokenExpires - 60) * 1000,
                );
            }
            this.adapter.setTimeout(() => this.reauth(), (Number(this.accessTokenExpires) - 60) * 1000);
            this.authUrl = `token=${this.accessToken}`;
        } else if (json.credentials) {
            this.adapter.log.debug(`AUTH: get authkey ${json.credentials}`);
            this.authkey = json.credentials;
            this.authUrl = this.authkey;

            // refresh data ever XX Minutes
            this.adapter.setInterval(() => void this.auth(), APP_KEY_INTERVAL);
        }

        if (this.authkey !== null || this.accessToken !== null) {
            this.emit('connect', json);
            void this.monitors();
            this.webSocket();
        } else {
            this.adapter.log.debug('AUTH: No auth data try again? ');
        }

        this.isAuth = false;
    }

    /** Reads all monitors. Returns `null` if the list could not be read or no monitor is enabled. */
    public async monitors(): Promise<MonitorsResponse | null> {
        const json = await this.request<MonitorsResponse>(`/api/monitors.json?&${this.authUrl}`);
        if (!json?.monitors) {
            this.adapter.log.warn('No monitors found, please configure monitors in your zoneminder!');
            return null;
        }

        const devices: MonitorDevice[] = [];
        for (const item of json.monitors) {
            if (!item?.Monitor || item.Monitor.Enabled !== '1') {
                continue;
            }
            const imgBase = `${this.options.host}/cgi-bin/nph-zms`;
            item.Monitor.camUrl = `${imgBase}?mode=jpeg&scale=auto&maxfps=5&monitor=${item.Monitor.Id}&${this.authUrl}`;

            devices.push({
                id: Number(item.Monitor.Id),
                name: item.Monitor.Name,
                sequence: Number(item.Monitor.Sequence),
                image: `${imgBase}?mode=jpeg&scale=100&maxfps=5&monitor=${item.Monitor.Id}`,
            });
        }
        devices.sort(seqSort);
        if (!devices.length) {
            // The JS version called `callback(devices)` here, so the callers got no monitor list
            return null;
        }
        devices.forEach(item => (item.image += `&${this.authUrl}`));
        this.adapter.log.debug(`Devices${JSON.stringify(devices)}`);
        return json;
    }

    public alarm(id: number | string, cmd: string): Promise<unknown> {
        return this.request(`/api/monitors/alarm/id:${id}/command:${cmd}.json?&${this.authUrl}`);
    }

    public version(): Promise<unknown> {
        return this.request(`/api/host/getVersion.json?&${this.authUrl}`);
    }

    public appkey(): Promise<unknown> {
        return this.request(`/api/host/login.json?&${this.authUrl}`);
    }

    public status(): Promise<unknown> {
        return this.request(`/api/host/daemonCheck.json?&${this.authUrl}`);
    }

    public restart(): Promise<unknown> {
        return this.request(`/api/states/change/restart.json?&${this.authUrl}`);
    }

    /**
     * Sets the monitor function
     *
     * @param id Number of monitor e.g. 5
     * @param state 0=None, 1=Monitor, 2=Modect, 3=Record, 4=Mocord, 5=Nodect
     */
    public functionChange(id: number | string, state: number): Promise<SaveResponse | null> {
        return this.request<SaveResponse>(
            `/api/monitors/${id}.json?&${this.authUrl}`,
            `Monitor[Function]=${FUNCSTATES[state]}`,
        );
    }

    /**
     * Sets the monitor to active or not active
     *
     * @param id Number of monitor e.g. 5
     * @param state 0=off or 1=on
     */
    public activeChange(id: number | string, state: 0 | 1): Promise<SaveResponse | null> {
        return this.request<SaveResponse>(`/api/monitors/${id}.json?&${this.authUrl}`, `Monitor[Enabled]=${state}`);
    }

    /** Full URL of the event video */
    public getVideoLink(eventId: number | string): string {
        return `${this.options.host}/index.php?mode=mp4&eid=${eventId}&view=view_video&${this.authUrl}`;
    }

    /** Full URL of the alarm frame of the event */
    public getSnapLink(eventId: number | string): string {
        return `${this.options.host}/index.php?view=image&eid=${eventId}&fid=alarm&width=auto&${this.authUrl}`;
    }
}
