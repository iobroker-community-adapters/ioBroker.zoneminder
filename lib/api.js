const stringify = require('querystring').stringify;
const rp = require('request-promise');
const EventEmitter = require('events');
const Fs = require('fs');
const request = require('request');

//Used for Zmnotificationserver
const WebSocketClient = require('websocket').client;
const https = require('https');

const WEBSOCHETRECONTIMER = 60000 // 1min
const appKeyIntervall = 300000 // 5 Minuten

const FUNCSTATES = {
    0: 'None',
    1: 'Monitor',
    2: 'Modect',
    3: 'Record',
    4: 'Mocord',
    5: 'Nodect'
};

let trys = 0;

// just for testing 
//-----------------------------------
let adapter_helper = {

    log: {
        info: function (msg) {
            console.log('INFO: ' + msg);
        },
        error: function (msg) {
            console.log('ERROR: ' + msg);
        },
        debug: function (msg) {
            console.log('DEBUG: ' + msg);
        },
        warn: function (msg) {
            console.log('WARN: ' + msg);
        }
    },
    msg: {
        info: [],
        error: [],
        debug: [],
        warn: []
    }
};
//------------------------------------



const seqSort = (a, b) => {
    if (a.sequence > b.sequence) {
        return 1;
    }
    if (a.sequence < b.sequence) {
        return -1;
    }
    return 0;
};

class ZoneMinder extends EventEmitter {
    constructor(options, adapter) {
        super();

        if (!options) {
            throw Error('options must be provided..');
        }
        if (typeof (adapter) === 'undefined') adapter = adapter_helper;

        ['user', 'password', 'host'].forEach(key => {
            if (!options[key]) {
                throw Error(`options.${key} must be supplied..`);
            }
        });

        options.host = options.host.replace(/\/$/, '');

        this.adapter = adapter;
        this.options = options;
        this.adapter.log.debug('data: ' + JSON.stringify(this.options));
        this._cookies = null;
        this.authkey = null;
        this.auth();
        setInterval(this._appkey.bind(this), appKeyIntervall)
    }

    _webSocket() {
        let that = this;
        let client = new WebSocketClient();

        //extract host from url e.g. http://zoneminder/zm ---> zoneminder
        let host = that.options.host.split("/")[2];

        client.on('connectFailed', function (error) {
            that.adapter.log.error('WEBSOCKET: Error: ' + error.toString());

            setTimeout(that._webSocket.bind(that), WEBSOCHETRECONTIMER);
        });

        client.on('connect', function (connection) {
            that.adapter.log.debug('WEBSOCKET Client Connected');
            connection.on('error', function (error) {
                that.adapter.log.error("WEBSOCKET: Error: " + error.toString());
                setTimeout(that._webSocket.bind(that), WEBSOCHETRECONTIMER);
            });
            connection.on('close', function () {
                that.adapter.log.debug('WEBSOCKET: closed');

                //reconnect
                setTimeout(that._webSocket.bind(that), WEBSOCHETRECONTIMER);
            });
            connection.on('message', function (message) {
                if (message.type === 'utf8') {
                    that.adapter.log.debug('WEBSOCKET: ' + message.utf8Data + "'");

                    let data = JSON.parse(message.utf8Data);

                    if (data.event === 'alarm') {
                        that.emit('alarm', data);
                    }
                }
            });

            sendMessage("auth", {
                user: that.options.user,
                password: that.options.password
            });

            function sendMessage(type, obj) {
                var msg = {
                    'event': type,
                    'data': obj
                };

                var jmsg = JSON.stringify(msg);
                connection.sendUTF(jmsg);
            }

        });

        if(that.options.zmEvent){
            client.connect('wss://' + host + ':9000/', undefined, undefined, undefined, {
                agent: new https.Agent({
                    rejectUnauthorized: false
                })
            });
        }
        else{
            that.adapter.log.debug('zmEventServer disabled');
        }
    }

    _get2(path, post, cb) {
        let that = this;

        if ((!that._cookies && !that.isAuth) && trys === 0) {
            that.auth(function (err, data) {
                if (err && typeof cb === 'function') {
                    cb(err);
                    return;
                }
            });
            trys = 1;
            return;
        } else if ((!that._cookies && !that.isAuth) && trys === 1) {
            that.adapter.log.error('Cant connect!!'); // API call failed...
            return;
        }

        if (typeof post === 'function') {
            cb = post;
            post = null;
        }

        const headers = {};
        const options = {
            method: 'GET',
            uri: that.options.host + path
        };
        that.adapter.log.debug('REQUEST: Post before ' + typeof post);
        if (post) {
            if (typeof post === 'object') post = stringify(post);
            options['body'] = post;
            options['method'] = 'POST';
            headers['content-type'] = 'application/x-www-form-urlencoded';
            headers['content-length'] = post.length;
            options['headers'] = headers;
        }
        headers['user-agent'] = '@nodeminder-api';
        options['headers'] = headers;
        options['resolveWithFullResponse'] = true;

        // add Cookies
        if (that._cookies) {
            const cookies = [];
            Object.keys(that._cookies).forEach((key) => {
                cookies.push(`${key}=${that._cookies[key]}`);
            });
            headers['Cookie'] = cookies.join('; ') + ';';
        }

        that.adapter.log.debug('REQUEST: Options ' + JSON.stringify(options));
        rp(options)
            .then(function (data) {
                that.adapter.log.debug('REQUEST: Get data');
                cb(null, JSON.parse(data.body), data);
            })
            .catch(function (err) {
                that.adapter.log.debug('reposerr' + err);
                if (typeof cb === 'function') cb(err, null, null);
                that.emit('error', err);
            });

    }

    _getVideo(path, vidId, cb) {
        let that = this;

        if ((!that._cookies && !that.isAuth) && trys === 0) {
            that.auth(function (err, data) {
                if (err && typeof cb === 'function') {
                    cb(err);
                    return;
                }
            });
            trys = 1;
            return;
        } else if ((!that._cookies && !that.isAuth) && trys === 1) {
            that.adapter.log.error('Cant connect!!'); // API call failed...
            return;
        }


        const headers = {};
        const options = {
            method: 'GET',
            uri: that.options.host + path
        };

        headers['user-agent'] = '@nodeminder-api';
        options['headers'] = headers;

        // add Cookies
        if (that._cookies) {
            const cookies = [];
            Object.keys(that._cookies).forEach((key) => {
                cookies.push(`${key}=${that._cookies[key]}`);
            });
            headers['Cookie'] = cookies.join('; ') + ';';
        }

        that.adapter.log.debug('REQUEST: Video_Options ' + JSON.stringify(options));
        request(options).pipe(Fs.createWriteStream('/opt/iobroker/test_ada_vid.mp4'))


    }

    reauth() {
        delete this._cookies;
    }

    servers(callback) {
        this.fetch('api/servers.json', (e, json) => {
            if (e) {
                this.reauth();
                this.servers(callback);
                return;
            }
            const servers = {};
            console.log('SERVER: ' + JSON.stringify(json));
            json.servers && json.servers.forEach(i => {
                servers[i.Server.Id] = i.Server;
            });
            callback(e, servers);
        });
    }

    auth(callback) {
        let that = this;

        that.isAuth = true;
        that._get2('/api/host/login.json', {
            user: that.options.user,
            pass: that.options.password
        }, (e, json, r) => {
            var cookies;
            if (!r) {
                that.emit('errror', e);
            }
            if (e) {
                return;
            }

            if (r.headers['set-cookie']) {
                cookies = r.headers['set-cookie'];
            }
            if (json.credentials) {
                that.adapter.log.debug('AUTH: get authkey ' + json.credentials);
                that.authkey = json.credentials;
            }

            that._cookies = {};
            cookies.forEach((line) => {
                var cookie = line.split(';')[0].split('=');
                that._cookies[cookie[0]] = cookie[1];
            });
            that.adapter.log.debug('AUTH: get cookies ' + JSON.stringify(that._cookies));
            if (typeof callback === 'function') callback(null, cookies);
            this.emit('connect', json);
            that.monitors();
            that._webSocket();
        });
    }

    set connKey(key) {
        this._connKey = key;
    }

    get connKey() {
        return this._connKey || (Math.floor((Math.random() * 999999) + 1)).toString();
    }

    saveVideo(id) {
        let that = this;

        // EXAMPLE: http://zoneminder/zm/index.php?mode=mp4&eid=594&view=view_video&auth=6de6dde98b17e09ddc21ac652e77020a

        let url = `/index.php?mode=mp4&eid=${id}&view=view_video&${that.authkey}`
        this._getVideo(url, id)

    }

    _monitors(all, callback) {
        let that = this;
        if (typeof all === 'function') {
            callback = all;
            all = false;
        }
        this._get2('/api/monitors.json', (e, json) => {
            const devices = [];

            if (!json || !json.monitors) {
                that.adapter.log.warn('No monitors found, please configure monitors in your zoneminder!')
                return
            }


            json.monitors && json.monitors.forEach((item) => {
                if (!item || !item.Monitor || item.Monitor.Enabled !== '1') {
                    return;
                }
                if (all) {
                    //return devices.push(item.Monitor);
                }
                const imgHost = this.options.host;
                const imgBase = `${imgHost}/cgi-bin/nph-zms`;
                const camUrl = `${imgBase}?mode=jpeg&scale=auto&maxfps=5&monitor=${item.Monitor.Id}&${this.authkey}`;
                item.Monitor['camUrl'] = camUrl;

                devices.push({
                    id: Number(item.Monitor.Id),
                    name: item.Monitor.Name,
                    sequence: Number(item.Monitor.Sequence),
                    image: `${imgBase}?mode=jpeg&scale=100&maxfps=5&monitor=${item.Monitor.Id}`
                });
            });
            //console.log ('Devices'+ JSON.stringify(devices));
            //if (all) {
            //    return callback(null, devices);
            //}
            devices.sort(seqSort);
            if (!devices.length) {
                return callback(devices);
            }
            devices.forEach((item) => {

                item.image += `&${this.authkey}`;
            });
            console.log('Devices' + JSON.stringify(devices));
            if (typeof callback === 'function') callback(null, json);
        });
    }
    monitors(callback) {
        this._monitors(true, callback);
    }

    cameras(callback) {
        this._monitors(callback);
    }

    alarm(id, cmd, callback) {
        const url = `/api/monitors/alarm/id:${id}/command:${cmd}.json`;
        this._get2(url, callback);
    }

    version(callback) {
        this._get2('/api/host/getVersion.json', callback);
    }
    appkey(callback) {
        this._get2('/api/host/login.json', callback);
    }
    _appkey() {
        let that = this;
        that._get2('/api/host/login.json', function (err, data, all) {
            if (data.credentials) {
                that.authkey = data.credentials;
            }

        });
    }

    status(callback) {
        this._get2('/api/host/daemonCheck.json', callback);
    }

    restart(callback) {
        this._get2('/api/states/change/restart.json', callback);
    }

    /**
     * This Function set Monitorfunction
     * @param {number} id           Number of Montitor e.g 5
     * @param {number} state        Number of 0-5 0=none;1=Monitor;2=Modect;3=Record;4=Mocord;5=Nodect;
     * @callback callback           Callbackfunction retuns (err, dataJSON, rawDataRequest)
     */
    functionCange(id, state, callback) {
        this._get2(`/api/monitors/${id}.json`,`Monitor[Function]=${FUNCSTATES[state]}`, callback);
    }

    /**
     * This Function set Monitor to active or not active
     * @param {number} id           Number of Montitor e.g 5
     * @param {number} state        Number of 0=off or 1=on 
     * @param {function} callback    optional Callbackfunction retuns (err, dataJSON, rawDataRequest)
     */
    activeCange(id, state, callback) {
        this._get2(`/api/monitors/${id}.json`,`Monitor[Enabled]=${state}`, callback  );
    }
    /**
     * Return string with full url
     * @param {number} eventId           Number of Event e.g 222
     */
    getVideoLink(eventId) {
        return this.options.host + `/index.php?mode=mp4&eid=${eventId}&view=view_video&${this.authkey}`
    }

        
    /**
     * Return string with full url
     * @param {number} eventId           Number of Event e.g 222
     */
    getSnapLink(eventId) {
        return this.options.host + `/index.php?view=image&eid=${eventId}&fid=alarm&width=auto&${this.authkey}`
    }
}

module.exports = ZoneMinder;