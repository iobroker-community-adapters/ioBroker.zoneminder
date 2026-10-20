/** Raw value as delivered by the ZoneMinder API (mostly strings, even for numbers) */
export type ZmValue = string | number | boolean | null;

export type ZmRecord = Record<string, ZmValue>;

export interface ZoneMinderOptions {
    user: string;
    password: string;
    host: string;
    zmEvent: boolean;
}

/** `Monitor` part of /api/monitors.json */
export interface ZmMonitor extends ZmRecord {
    Id: string;
    Name: string;
    Function: string;
    Enabled: string;
    Sequence: string;
}

/** One entry of /api/monitors.json */
export interface ZmMonitorEntry {
    Monitor: ZmMonitor;
    Monitor_Status: ZmRecord;
}

export interface MonitorsResponse {
    monitors: ZmMonitorEntry[];
}

/** Answer of /api/host/login.json */
export interface LoginResponse {
    access_token?: string;
    /** seconds */
    access_token_expires?: number;
    refresh_token?: string;
    /** seconds */
    refresh_token_expires?: number;
    /** legacy auth (ZoneMinder < 1.34) */
    credentials?: string;
}

/** Answer of POST /api/monitors/<id>.json */
export interface SaveResponse {
    message?: string;
}

/** Error body of the ZoneMinder API */
export interface ZmErrorResponse {
    data?: { name?: string };
}

export interface ZmEvent {
    MonitorId: string | number;
    EventId: string | number;
    Name: string;
    Cause: string;
}

/** Message from zmEventNotification server */
export interface AlarmMessage {
    event: 'alarm';
    events: ZmEvent[];
}

export interface EventServerMessage {
    event: string;
}
