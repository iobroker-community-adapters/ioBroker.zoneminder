// Augments the globally declared ioBroker types with everything this adapter adds.
// Keep in sync with `native` in io-package.json and with admin/jsonConfig.json.
declare global {
    namespace ioBroker {
        interface AdapterConfig {
            /** ZoneMinder base URL incl. path, e.g. http://zoneminder/zm */
            host: string;
            user: string;
            /** Stored unencrypted in native (was always like this, do not switch to encryptedNative) */
            password: string;
            /** Polling interval for the monitor list in seconds. Instances configured with the old HTML admin may hold a string here. */
            pollingMon: number;
            /** Monitor state interval in seconds. Only shown in the admin, not used by the backend. */
            pollingMonState: number;
            /** Connect to the zmEventNotification server (wss://<host>:9000) */
            zmEvent: boolean;
        }
    }
}

export {};
