const stringify = require('querystring').stringify;
const rp = require('request-promise');
const EventEmitter = require('events');

let trys = 0;

// just for testing 
//-----------------------------------
let adapter_helper = {
    //config: Config.getInstance().get("landroid-s"),
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
    }

    _get2(path, post, cb) {
        let that = this;

        if ((!this._cookies && !this.isAuth) && trys === 0) {
            this.auth(function (err, data) {
                if (err && typeof cb === 'function') {
                    cb(err);
                    return;
                }
            });
            trys = 1;
            return;
        } else if ((!this._cookies && !this.isAuth) && trys === 1) {
            this.adapter.log.error('Cant connect!!'); // API call failed...
            return;
        }

        if (typeof post === 'function') {
            cb = post;
            post = null;
        }

        const headers = {};
        const options = {
            method: 'GET',
            uri: this.options.host + path
        };
        if (post) {
            post = stringify(post);
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
        if (this._cookies) {
            const cookies = [];
            Object.keys(this._cookies).forEach((key) => {
                cookies.push(`${key}=${this._cookies[key]}`);
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

        this.isAuth = true;
        this._get2('/api/host/login.json', {
            user: this.options.user,
            pass: this.options.password
        }, (e, json, r) => {
            var cookies;
            if (!r) {
                this.emit('errror', e);
            }
            if(e){
                return;
            }

            if (r.headers['set-cookie']) {
                cookies = r.headers['set-cookie'];
            }
            if (json.credentials) {
                that.adapter.log.debug('AUTH: get authkey ' + json.credentials);
                that.authkey = json.credentials;
            }

            this._cookies = {};
            cookies.forEach((line) => {
                var cookie = line.split(';')[0].split('=');
                this._cookies[cookie[0]] = cookie[1];
            });
            that.adapter.log.debug('AUTH: get cookies ' + JSON.stringify(this._cookies));
            if (typeof callback === 'function') callback(null, cookies);
            this.monitors();
        });
    }

    set connKey(key) {
        this._connKey = key;
    }

    get connKey() {
        return this._connKey || (Math.floor((Math.random() * 999999) + 1)).toString();
    }

    _monitors(all, callback) {
        if (typeof all === 'function') {
            callback = all;
            all = false;
        }
        this._get2('/api/monitors.json', (e, json) => {
            const devices = [];
            json.monitors && json.monitors.forEach((item) => {
                if (!item || !item.Monitor || item.Monitor.Enabled !== '1') {
                    return;
                }
                if (all) {
                    //return devices.push(item.Monitor);
                }
                const imgHost = this.options.host;
                const imgBase = `${imgHost}/cgi-bin/nph-zms`;
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
                item.image += `&${this.authkey}&connkey=${this.connKey}`;
            });
            console.log('Devices' + JSON.stringify(devices));
            if (typeof callback === 'function') callback(null, devices);

            this.emit('connect', json);
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

    status(callback) {
        this._get2('/api/host/daemonCheck.json', callback);
    }

    restart(callback) {
        this._get2('/api/states/change/restart.json', callback);
    }
}

module.exports = ZoneMinder;