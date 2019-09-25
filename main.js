'use strict';

const utils = require('@iobroker/adapter-core');

const Zoneminder = require(__dirname + '/lib/api');
let requestInterval;
let requestTimeout = null;

let zm;
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
                // adapter.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
            } else {
                // The state was deleted
                //adapter.log.info(`state ${id} deleted`);
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
function set_monitors() {
    adapter.log.debug('SetStates');
    zm.monitors(function (err, monitorsjson) {

        let monitors= monitorsjson.monitors

        monitors.forEach(function (monitor, index) {
            var _id = adapter.namespace + '.' + 'cam_' + monitor.Monitor.Id

            findState(_id + '.monitor', monitor.Monitor, (states) => {
                states.forEach(function (element) {
                    adapter.setState(element[0] + '.' + element[1], element[3], true);
                });
            });
            findState(_id + '.info', monitor.Monitor_Status, (states) => {
                states.forEach(function (element) {
                    adapter.setState(element[0] + '.' + element[1], element[3], true);
                });
            });
        })
    })

}

function create_monitors(monitors, callback) {
    adapter.log.debug(JSON.stringify(monitors))

    let cam_ids = [];

    adapter.getForeignObjects(adapter.namespace + ".*", 'device', function (err, list) {

        monitors.forEach(function (monitor, index) {
            var _id = adapter.namespace + '.' + 'cam_' + monitor.Monitor.Id
            cam_ids.push(_id);

            if (list[_id]) adapter.log.debug('monitor found in Objects')

            if (!list[_id]) {
                // create monitors
                adapter.createDevice('cam_' + monitor.Monitor.Id, {
                    name: monitor.Monitor.Name
                }, {});

                adapter.createChannel('cam_' + monitor.Monitor.Id, "info");
                adapter.createChannel('cam_' + monitor.Monitor.Id, "monitor");

                for (var prop in monitor) {
                    adapter.log.debug('Monitor_' + index + " o." + prop + " = " + monitor[prop]);
                }
            }

            findState(_id + '.info', monitor.Monitor_Status, (states) => {
                states.forEach(function (element) {
                    _createState(element[0], element[1], element[2], element[3]);
                });
            });
            findState(_id + '.monitor', monitor.Monitor, (states) => {
                states.forEach(function (element) {
                    _createState(element[0], element[1], element[2], element[3]);
                });
            });

        });
        adapter.log.debug('CAM_ids: ' + JSON.stringify(cam_ids))
        for (let prop in list) {
            let find_monitor = cam_ids.find(device => device === prop);

            if (find_monitor) adapter.log.debug('FOUND in list' + find_monitor)
            else delDev(prop)
        }


        //set_monitors();
    });
}



function delDev(_id) {
    adapter.log.warn('DEL: ' + _id)
    adapter.delObject(_id, function (err, dat) {
        if (err) adapter.log.warn(err);
        //adapter.log.debug(dat);
    });
}

function findState(sid, states, cb) {
    let result = [];

    for (let key in states) {
        let value = states[key];
        adapter.log.debug("search state" + key + ": " + value);

        if (key === "ArchivedEventDiskSpace" || key === "MonthEventDiskSpace" || key === "WeekEventDiskSpace" || key === "DayEventDiskSpace" || key === "HourEventDiskSpace" || key === "TotalEventDiskSpace" || key === "used" || key === "total" || key === "avail") {
            result.push([sid, key, 'size', BtoMb(value)])
        } else if (key === "uptime") {
            result.push([sid, key, 'time', value])
        } else if (key === "netin" || key === "netout") {
            result.push([sid, key, 'sizeb', value]);
        } else if (key === "cpu") {
            result.push([sid, key, 'level', parseInt(value * 10000) / 100]);
        } else if (key === "Sequence" || key === "CaptureFPS" || key === "AnalysisFPS" || key === "CaptureBandwidth" || key === "MonitorId" || key === "MaxFPS" || key === "AlarmMaxFPS" || key === "ZoneCount" || key === "TotalEvents" || key === "HourEvents" || key === "DayEvents" || key === "WeekEvents" || key === "MonthEvents" || key === "ArchivedEvents") {
            result.push([sid, key, 'default_num', value]);
        } else if (key === "Function" || key === "Status" || key === 'camUrl') {
            result.push([sid, key, 'text', value]);
        }
    }
    adapter.log.debug('found states:_' + JSON.stringify(result))
    cb(result);
}

function main() {

    // Reset the connection indicator during startup
    adapter.setState('info.connection', false, true);

    zm = new Zoneminder({
        user: adapter.config.user,
        password: adapter.config.password,
        host: adapter.config.host
    }, adapter);


    zm.on('connect', monitors => {
        adapter.log.debug('Connected');
        create_monitors(monitors.monitors)
        adapter.setStateAsync('info.connection', {
            val: true,
            ack: true
        });
    });

    requestInterval = setInterval(set_monitors, adapter.config.pollingMon * 1000)

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
    adapter.setState('testVariable', {
        val: true,
        ack: true
    });

    // same thing, but the state is deleted after 30s (getState will return null afterwards)
    adapter.setState('testVariable', {
        val: true,
        ack: true,
        expire: 30
    });

    // examples for the checkPassword/checkGroup functions
    adapter.checkPassword('admin', 'iobroker', (res) => {
        adapter.log.info('check user admin pw ioboker: ' + res);
    });

    adapter.checkGroup('admin', 'admin', (res) => {
        adapter.log.info('check group user admin group admin: ' + res);
    });
}

function sendRequest() {

    requestTimeout = setTimeout(function () {
        requestTimeout = null;
        if (connected) {
            connected = false;
            adapter.log.debug('Disconnect');
            adapter.setState('info.connection', false, true);
        }
    }, 3000);
    if (finish) {
        try {
            proxmox.status(function (data) {

                devices = data.data;
                _setNodes(data.data);
                adapter.log.debug("Devices: " + JSON.stringify(data));
            });


        } catch (e) {
            adapter.log.warn('Cannot send request: ' + e);
            clearTimeout(requestTimeout);
            requestTimeout = null;
            if (connected) {
                connected = false;
                adapter.log.debug('Disconnect');
                adapter.setState('info.connection', false, true);
            }
        }
    }
}

function _createState(sid, name, type, val, callback) {
    adapter.log.debug('create state: ' + name + ' val: ' + val);
    var state = type;
    switch (state) {
        case 'time':
            adapter.setObjectNotExists(sid + '.' + name, {
                common: {
                    name: name,
                    role: 'value',
                    write: false,
                    read: true,
                    type: 'number',
                    unit: 'sec.'
                },
                type: 'state',
                native: {}
            }, adapter.setState(sid + '.' + name, val, true));

            break;
        case 'size':
            adapter.setObjectNotExists(sid + '.' + name, {
                common: {
                    name: name,
                    role: 'value',
                    write: false,
                    read: true,
                    type: 'number',
                    unit: 'Mb'
                },
                type: 'state',
                native: {}
            }, adapter.setState(sid + '.' + name, val, true));

            break;
        case 'sizeb':
            adapter.setObjectNotExists(sid + '.' + name, {
                common: {
                    name: name,
                    role: 'value',
                    write: false,
                    read: true,
                    type: 'number',
                    unit: 'byte'
                },
                type: 'state',
                native: {}
            }, adapter.setState(sid + '.' + name, val, true));

            break;
        case 'level':
            adapter.setObjectNotExists(sid + '.' + name, {
                common: {
                    name: name,
                    role: 'value',
                    write: false,
                    read: true,
                    type: 'number',
                    unit: '%'
                },
                type: 'state',
                native: {}
            }, adapter.setState(sid + '.' + name, val, true));

            break;
        case 'default_num':
            adapter.setObjectNotExists(sid + '.' + name, {
                common: {
                    name: name,
                    role: 'value',
                    write: false,
                    read: true,
                    type: 'number'
                },
                type: 'state',
                native: {}
            }, adapter.setState(sid + '.' + name, val, true));

            break;
        case 'text':
            adapter.setObjectNotExists(sid + '.' + name, {
                common: {
                    name: name,
                    role: 'value',
                    write: false,
                    read: true,
                    type: 'string'
                },
                type: 'state',
                native: {}
            }, adapter.setState(sid + '.' + name, val, true));

            break;
        default:

    }

};

function BtoMb(val) {

    return Math.round(val / 1048576)
}

function p(vala, valb) {
    return Math.round(vala / valb * 10000) / 100
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export startAdapter in compact mode
    module.exports = startAdapter;
} else {
    // otherwise start the instance directly
    startAdapter();
}