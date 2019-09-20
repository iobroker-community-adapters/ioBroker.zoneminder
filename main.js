'use strict';

const utils = require('@iobroker/adapter-core');

const Zoneminder = require(__dirname + '/lib/api');

/**
 * The adapter instance
 * @type {ioBroker.Adapter}
 */
let adapter;

/**
 * Starts the adapter instance
 * @param {Partial<ioBroker.AdapterOptions>} [options]
 */
function startAdapter(options) {
    // Create the adapter and define its methods
    return adapter = utils.adapter(Object.assign({}, options, {
        name: 'zoneminder',

        // The ready callback is called when databases are connected and adapter received configuration.
        // start here!
        ready: main, // Main method defined below for readability

        // is called when adapter shuts down - callback has to be called under any circumstances!
        unload: (callback) => {
            try {
                adapter.log.info('cleaned everything up...');
                callback();
            } catch (e) {
                callback();
            }
        },

        // is called if a subscribedobject changes
        objectChange: (id, obj) => {
            if (obj) {
                // The object was changend
                adapter.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
            } else {
                // The object was deleted
                adapter.log.info(`object ${id} deleted`);
            }
        },

        // is called if a subscribed state changes
        stateChange: (id, state) => {
            if (state) {
                // The state was changed
                adapter.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
            } else {
                // The state was deleted
                adapter.log.info(`state ${id} deleted`);
            }
        },

        // Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
        // requires "common.message" property to be set to true in io-package.json
        // message: (obj) => {
        // 	if (typeof obj === 'object' && obj.message) {
        // 		if (obj.command === 'send') {
        // 			// e.g. send email or pushover or whatever
        // 			adapter.log.info('send command');

        // 			// Send response in callback if required
        // 			if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
        // 		}
        // 	}
        // },
    }));
}

function main() {

    // Reset the connection indicator during startup
    adapter.setState('info.connection', false, true);

    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // adapter.config:
    adapter.log.info('config option1: ' + adapter.config.option1);
    adapter.log.info('config option2: ' + adapter.config.option2);

    const zm = new Zoneminder({
        user: adapter.config.user,
        password: adapter.config.password,
        host: adapter.config.host
    },adapter);


    zm.on('connect', monitors => {
        adapter.log.debug('Connected');
        adapter.setStateAsync('info.connection', {
            val: true,
            ack: true
        });
    });

    adapter.setObject('testVariable', {
        type: 'state',
        common: {
            name: 'testVariable',
            type: 'boolean',
            role: 'indicator',
            read: true,
            write: true,
        },
        native: {},
    });

    // in this template all states changes inside the adapters namespace are subscribed
    adapter.subscribeStates('*');

    /*
        setState examples
        you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
    */
    // the variable testVariable is set to true as command (ack=false)
    adapter.setState('testVariable', true);

    // same thing, but the value is flagged "ack"
    // ack should be always set to true if the value is received from or acknowledged from the target system
    adapter.setState('testVariable', { val: true, ack: true });

    // same thing, but the state is deleted after 30s (getState will return null afterwards)
    adapter.setState('testVariable', { val: true, ack: true, expire: 30 });

    // examples for the checkPassword/checkGroup functions
    adapter.checkPassword('admin', 'iobroker', (res) => {
        adapter.log.info('check user admin pw ioboker: ' + res);
    });

    adapter.checkGroup('admin', 'admin', (res) => {
        adapter.log.info('check group user admin group admin: ' + res);
    });
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export startAdapter in compact mode
    module.exports = startAdapter;
} else {
    // otherwise start the instance directly
    startAdapter();
}