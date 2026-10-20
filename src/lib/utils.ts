import type { ZmRecord } from './types';

/** Monitor function modes, the index is the state value of `cam_<id>.monitor.Function` */
export const FUNCSTATES: Record<number, string> = {
    0: 'None',
    1: 'Monitor',
    2: 'Modect',
    3: 'Record',
    4: 'Mocord',
    5: 'Nodect',
};

/** Template for the `zmEvent` / `history.LastzmEvent` states */
export const ZM_EVENT_PLACEHOLDER: ZmRecord = {
    MonitorId: '0',
    EventId: '000',
    Name: 'INIT',
    Cause: 'INIT',
    VideoUrl: '',
    SnapUrl: '',
    Date: null,
};

export function bToMb(val: unknown): number {
    return Math.round(Number(val) / 1048576);
}
