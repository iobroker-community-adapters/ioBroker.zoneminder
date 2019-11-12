'use strict';

const utils = require('@iobroker/adapter-core');

const Zoneminder = require(__dirname + '/lib/api');
let requestInterval;
let requestTimeout = null;


const FUNCSTATES = {
    0: 'None',
    1: 'Monitor',
    2: 'Modect',
    3: 'Record',
    4: 'Mocord',
    5: 'Nodect'
};

const ZMEVENTPLACEHOLDER = {
    "MonitorId": "0",
    "EventId": "000",
    "Name": "INIT",
    "Cause": "INIT",
    "VideoUrl": "",
    "SnapUrl" : "",
    "Date":null
}

let zm;
/**
 * The adapter instance
 * @type {ioBroker.Adapter}
 */
let adapter;
let zmEvent = false;

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
                clearTimeout(requestInterval);
                zm.websocketClose();

                adapter.log.info('cleaned everything up...');
                callback();
            } catch (e) {
                callback();
            }
        },

        /* is called if a subscribedobject changes
        objectChange: (id, obj) => {
            if (obj) {
                // The object was changend
                adapter.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
            } else {
                // The object was deleted
                adapter.log.info(`object ${id} deleted`);
            }
        },
        */

        // is called if a subscribed state changes
        stateChange: (id, state) => {
            if (state && !state.ack) {
                let command = id.split('.').pop();
                let camId = id.split('.')[2].split('_')[1];
                adapter.log.info(camId + '__' + command + '___' + state);

                if (command === 'Function') {
                    zm.functionCange(camId, state.val, function (err, data) {
                        adapter.log.debug('set State ' + JSON.stringify(data));
                        if (data.message && data.message === 'Saved') {
                            adapter.setState(id, state.val, true);
                        }
                    })
                }
                if (command === 'Enabled') {
                    let pState = 0;
                    if (state.val === true) pState = 1;

                    zm.activeCange(camId, pState, function (err, data) {
                        adapter.log.debug('set State ' + JSON.stringify(data));
                        if (data.message && data.message === 'Saved') {
                            adapter.setState(id, state.val, true);
                        }
                    })
                }


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

        let monitors = monitorsjson.monitors

        //Szm.saveVideo(594)

        monitors.forEach(function (monitor, index) {
            var _id = adapter.namespace + '.' + 'cam_' + monitor.Monitor.Id

            findState(_id + '.monitor', monitor.Monitor, (states) => {
                states.forEach(function (element) {
                    adapter.setStateChanged(element[0] + '.' + element[1], element[3], true);
                });
            });
            findState(_id + '.info', monitor.Monitor_Status, (states) => {
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

        requestInterval= setTimeout(set_monitors, adapter.config.pollingMon * 1000)
    })

}

function create_monitors(monitors, callback) {
    adapter.log.debug(JSON.stringify(monitors))

    let cam_ids = [];

    //create States for zmEvent
    adapter.createChannel('',"history");

    findState(adapter.namespace + '.history.LastzmEvent', ZMEVENTPLACEHOLDER, (states) => {
        states.forEach(function (element) {
            _createState(element[0], element[1], element[2], element[3]);
        });
    });

    adapter.getForeignObjects(adapter.namespace + ".*", 'device', function (err, list) {

        monitors.forEach(function (monitor, index) {
            var _id = adapter.namespace + '.' + 'cam_' + monitor.Monitor.Id
            cam_ids.push(_id);

            if (list[_id]) adapter.log.debug('monitor found in Objects')

            if (true) {
                // create monitors
                adapter.createDevice('cam_' + monitor.Monitor.Id, {
                    name: monitor.Monitor.Name
                }, {});

                adapter.createChannel('cam_' + monitor.Monitor.Id, "info");
                adapter.createChannel('cam_' + monitor.Monitor.Id, "monitor");
                if (zmEvent) {
                    adapter.createChannel('cam_' + monitor.Monitor.Id, "zmEvent");
                }


                for (var prop in monitor) {
                    adapter.log.debug('Monitor_' + index + " o." + prop + " = " + monitor[prop]);
                }
                //add control states for Monitor
                adapter.setObjectNotExists(_id + '.monitor' + '.Function', {
                    common: {
                        name: 'function',
                        role: 'state',
                        write: true,
                        read: true,
                        type: 'number',
                        desc: 'Select the function for the monitor',
                        states: FUNCSTATES
                    },
                    type: 'state',
                    native: {}
                });
                adapter.setObjectNotExists(_id + '.monitor' + '.Enabled', {
                    common: {
                        name: 'Enabled',
                        type: 'boolean',
                        role: 'switch',
                        read: true,
                        write: true,
                        desc: 'Enable or disable the monitor'
                    },
                    type: 'state',
                    native: {}
                });

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
            findState(_id + '.zmEvent', ZMEVENTPLACEHOLDER, (states) => {
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
        //adapter.log.debug("search state" + key + ": " + value);

        if (key === "ArchivedEventDiskSpace" || key === "MonthEventDiskSpace" || key === "WeekEventDiskSpace" || key === "DayEventDiskSpace" || key === "HourEventDiskSpace" || key === "TotalEventDiskSpace" || key === "used" || key === "total" || key === "avail") {
            result.push([sid, key, 'size', BtoMb(value)])
        } else if (key === "uptime") {
            result.push([sid, key, 'time', value])
        } else if (key === "netin" || key === "netout") {
            result.push([sid, key, 'sizeb', value]);
        } else if (key === "cpu") {
            result.push([sid, key, 'level', parseInt(value * 10000) / 100]);
        }else if (key === "Date") {
            result.push([sid, key, 'date', Date.now()]);
        } else if (key === "Sequence" || key === "CaptureFPS" || key === "AnalysisFPS" || key === "CaptureBandwidth" || key === "MonitorId" || key === "EventId" || key === "MaxFPS" || key === "AlarmMaxFPS" || key === "ZoneCount" || key === "TotalEvents" || key === "HourEvents" || key === "DayEvents" || key === "WeekEvents" || key === "MonthEvents" || key === "ArchivedEvents") {
            result.push([sid, key, 'default_num', value]);
        } else if (key === "Status" || key === 'camUrl' || key === 'Name' || key === 'Cause' || key === 'VideoUrl' || key === 'SnapUrl') {
            result.push([sid, key, 'text', value]);
        }

        // if Functionmode, change selectorstate
        if (key === "Function") {
            for (key in FUNCSTATES) {
                if (FUNCSTATES[key] === value) {
                    result.push([sid, "Function", null, key]);
                }
            }
        }

        if (key === "Enabled") {
            if (value === 1 || value === '1') {
                result.push([sid, "Enabled", null, true]); 
            } else {
                result.push([sid, "Enabled", null, false]);
            }
        }
    }
    adapter.log.debug('found states:_' + JSON.stringify(result))
    cb(result);
}

function main() {

    // Reset the connection indicator during startup
    adapter.setState('info.connection', false, true);
    //adapter.config.zmEvent = true;

    zmEvent = adapter.config.zmEvent;

    zm = new Zoneminder({
        user: adapter.config.user,
        password: adapter.config.password,
        host: adapter.config.host,
        zmEvent : adapter.config.zmEvent
    }, adapter);


    zm.on('connect', monitors => {
        adapter.log.debug('Connected to Api');
        adapter.setStateAsync('info.connection', {
            val: true,
            ack: true
        });
        zm.monitors(function (err, monitorsjson) {
            create_monitors(monitorsjson.monitors)
        })
    });
    zm.on('error', error => {
        adapter.setStateAsync('info.connection', {
            val: false,
            ack: true
        }); 
    });

    zm.on('alarm', data => {
        adapter.log.debug('ALARM_' + JSON.stringify(data));
        let event = data.events[0];
        let _eid = adapter.namespace + '.' + 'cam_' + event.MonitorId +'.zmEvent';
        let lastzm_id = adapter.namespace + '.history' +'.LastzmEvent'

        let vid = zm.getVideoLink(event.EventId);
        let snap = zm.getSnapLink(event.EventId);

        adapter.log.debug('recivevid_ '+ vid)
        adapter.setState(_eid +'.VideoUrl',vid, true);
        adapter.setState(_eid +'.SnapUrl',snap, true);
        adapter.setState(_eid +'.MonitorId',event.MonitorId, true);
        adapter.setState(_eid +'.EventId',event.EventId, true);
        adapter.setState(_eid +'.Name',event.Name, true);
        adapter.setState(_eid +'.Cause',event.Cause, true);
        adapter.setState(_eid +'.Date',Date.now(), true);

        adapter.setState(lastzm_id +'.VideoUrl',vid, true);
        adapter.setState(lastzm_id +'.SnapUrl',snap, true);
        adapter.setState(lastzm_id +'.MonitorId',event.MonitorId, true);
        adapter.setState(lastzm_id +'.EventId',event.EventId, true);
        adapter.setState(lastzm_id +'.Name',event.Name, true);
        adapter.setState(lastzm_id +'.Cause',event.Cause, true);
        adapter.setState(lastzm_id +'.Date',Date.now(), true);

    });

    requestInterval = setTimeout(set_monitors, adapter.config.pollingMon * 1000);

    // in this template all states changes inside the adapters namespace are subscribed
    adapter.subscribeStates('*');

}

function _createState(sid, name, type, val, callback) {
    //adapter.log.debug('create state: ' + name + ' val: ' + val);
    var state = type;
    if (state === null) {
        adapter.setState(sid + '.' + name, val, true);
        return
    }
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
            case 'date':
                adapter.setObjectNotExists(sid + '.' + name, {
                    common: {
                        name: name,
                        role: 'date',
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