const Database = require('better-sqlite3');
const ping = require('ping');
const dgram = require('dgram');
const snmp = require('snmp-native');
const net = require('net');
const http = require('http');
const nmap = require('node-nmap');

/**
 * Base class for network monitoring database operations.
 */
class IME_NetworkMonitor {
    Connect() { throw new Error('Connect method must be implemented by subclass'); }
    Disconnect() { throw new Error('Disconnect method must be implemented by subclass'); }
    discoverDevices(ipRange) { throw new Error('discoverDevices method must be implemented by subclass'); }
    getDevices() { throw new Error('getDevices method must be implemented by subclass'); }
    getSNMPMetrics(ip, community, version, credentials) { throw new Error('getSNMPMetrics method must be implemented by subclass'); }
    setupTrapReceiver() { throw new Error('setupTrapReceiver method must be implemented by subclass'); }
    configureTraps(enable) { throw new Error('configureTraps method must be implemented by subclass'); }
    PortScan(ip) { throw new Error('PortScan method must be implemented by subclass'); }
    OSFingerprinting(ip) { throw new Error('OSFingerprinting method must be implemented by subclass'); }
    EnumerateServices(ip) { throw new Error('EnumerateServices method must be implemented by subclass'); }
    Ping(ipOrHost) { throw new Error('Ping method must be implemented by subclass'); }
}

/**
 * SQLite implementation for network monitoring and SNMP data storage.
 */
class IME_NetworkMonitorSqlite3 extends IME_NetworkMonitor {
    #db;
    #trapServer;

    constructor(dbPath) {
        super();
        this.dbPath = dbPath;
        this.#trapServer = null;
    }

    Connect() {
        try {
            this.#db = new Database(this.dbPath);
            this.#createTables();
        } catch (err) {
            throw new Error(`Failed to connect to database: ${err.message}`);
        }
    }

    #createTables() {
        this.#db.exec(`
            CREATE TABLE IF NOT EXISTS devices (
                ip TEXT PRIMARY KEY,
                mac TEXT,
                hostname TEXT,
                snmp_enabled INTEGER,
                sys_name TEXT,
                sys_descr TEXT,
                last_seen INTEGER
            );
            CREATE TABLE IF NOT EXISTS metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip TEXT,
                ts INTEGER,
                metric_name TEXT,
                metric_value TEXT,
                FOREIGN KEY(ip) REFERENCES devices(ip)
            );
            CREATE TABLE IF NOT EXISTS traps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip TEXT,
                ts INTEGER,
                oid TEXT,
                value TEXT
            );
        `);
    }

    Disconnect() {
        if (this.#trapServer) {
            this.#trapServer.close();
            this.#trapServer = null;
        }
        if (this.#db) {
            this.#db.close();
            this.#db = null;
        }
    }

    async discoverDevices(ipRange) {
        const devices = [];
        const subnet = this.#parseIpRange(ipRange);
        const community = 'public';

        for (const ip of subnet) {
            try {
                const res = await ping.promise.probe(ip, { timeout: 1 });
                if (res.alive) {
                    const device = { ip, mac: null, hostname: res.host, snmp_enabled: 0, sys_name: null, sys_descr: null, last_seen: Date.now() };
                    // // Try SNMP
                    // const snmpData = await this.#probeSNMP(ip, community, 2);
                    // if (snmpData) {
                    //     device.snmp_enabled = 1;
                    //     device.sys_name = snmpData.sysName || null;
                    //     device.sys_descr = snmpData.sysDescr || null;
                    // }
                    devices.push(device);
                    this.#storeDevice(device);
                }
            } catch (err) {
                console.error(`Error probing ${ip}:`, err);
            }
        }

        // // UDP broadcast for service discovery
        // await this.#broadcastDiscovery(devices);

        return devices;
    }

    #parseIpRange(ipRange) {
        if (ipRange.includes('-')) {
            const [startIp, endIp] = ipRange.split('-');
            const start = startIp.split('.').map(Number);
            const end = endIp.split('.').map(Number);

            const ips = [];
            const startNum = (start[0] << 24) + (start[1] << 16) + (start[2] << 8) + start[3];
            const endNum = (end[0] << 24) + (end[1] << 16) + (end[2] << 8) + end[3];

            for (let num = startNum; num <= endNum; num++) {
                const ip = [
                    (num >> 24) & 255,
                    (num >> 16) & 255,
                    (num >> 8) & 255,
                    num & 255
                ].join('.');
                ips.push(ip);
            }
            return ips;
        }

        const [baseIp, mask] = ipRange.split('/');
        const maskBits = parseInt(mask) || 24;
        const base = baseIp.split('.').map(Number);
        const ipCount = 2 ** (32 - maskBits);
        const ips = [];

        for (let i = 0; i < ipCount; i++) {
            const ip = [
                base[0] + ((i >> 24) & 255),
                base[1] + ((i >> 16) & 255),
                base[2] + ((i >> 8) & 255),
                base[3] + (i & 255)
            ].join('.');
            ips.push(ip);
        }
        return ips;
    }

    #probeSNMP(ip, community, version, credentials = {}) {
        return new Promise((resolve) => {
            const session = new snmp.Session({
                host: ip,
                port: 161,
                community: community || 'public',
                version: version === 3 ? snmp.Version3 : (version === 1 ? snmp.Version1 : snmp.Version2c),
                ...(version === 3 ? {
                    user: credentials.user || 'user',
                    authProtocol: credentials.authProtocol || snmp.AuthProtocols.sha256,
                    authKey: credentials.authKey || 'fakeKey',
                    privProtocol: credentials.privProtocol || snmp.PrivProtocols.aes256,
                    privKey: credentials.privKey || 'fakePrivKey'
                } : {})
            });

            session.get({ oid: ['1.3.6.1.2.1.1.1.0'] }, (err, varbinds) => {
                if (err) {
                    session.close();
                    resolve(null);
                    return;
                }

                const result = {};
                if (varbinds[0]) result.sysDescr = varbinds[0].value.toString();

                session.get({ oid: ['1.3.6.1.2.1.1.5.0'] }, (err2, varbinds2) => {
                    session.close();
                    if (!err2 && varbinds2[0]) result.sysName = varbinds2[0].value.toString();
                    resolve(result);
                });
            });
        });
    }

    #broadcastDiscovery(devices, port = 1900) {
        return new Promise((resolve) => {
            const server = dgram.createSocket('udp4');
            const newDevices = [...devices];
            let timeout;

            server.on('error', (err) => {
                console.error('UDP broadcast error:', err);
                server.close();
                resolve(newDevices);
            });

            server.on('message', (msg, rinfo) => {
                console.log(`Received broadcast response from ${rinfo.address}:${rinfo.port}: ${msg.toString()}`);
                let mac = null;
                try {
                    const msgStr = msg.toString();
                    if (msgStr.includes('MAC:')) {
                        mac = msgStr.split('MAC:')[1].split(/\s/)[0];
                    } else if (/([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/.test(msgStr)) {
                        mac = msgStr.match(/([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/)[0];
                    }
                } catch (err) {
                    console.warn(`Failed to parse MAC from ${rinfo.address}:`, err);
                }

                let device = newDevices.find(d => d.ip === rinfo.address);
                if (!device) {
                    device = {
                        ip: rinfo.address,
                        mac: null,
                        hostname: rinfo.address,
                        snmp_enabled: 0,
                        sys_name: null,
                        sys_descr: null,
                        last_seen: Date.now()
                    };
                    newDevices.push(device);
                }
                if (mac) {
                    device.mac = mac;
                    this.#storeDevice(device);
                }
            });

            server.bind(() => {
                server.setBroadcast(true);
                const message = Buffer.from(
                    'M-SEARCH * HTTP/1.1\r\n' +
                    'HOST: 255.255.255.255:1900\r\n' +
                    'MAN: "ssdp:discover"\r\n' +
                    'MX: 2\r\n' +
                    'ST: ssdp:all\r\n' +
                    '\r\n'
                );
                server.send(message, 0, message.length, port, '255.255.255.255', (err) => {
                    if (err) {
                        console.error('Error sending broadcast:', err);
                        server.close();
                        resolve(newDevices);
                        return;
                    }
                    console.log(`Broadcast sent to 255.255.255.255:${port}`);
                    timeout = setTimeout(() => {
                        server.close();
                        resolve(newDevices);
                    }, 5000);
                });
            });

            server.on('close', () => {
                clearTimeout(timeout);
            });
        });
    }

    #storeDevice(device) {
        const stmt = this.#db.prepare(`
            INSERT OR REPLACE INTO devices (ip, mac, hostname, snmp_enabled, sys_name, sys_descr, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            device.ip,
            device.mac,
            device.hostname,
            device.snmp_enabled,
            device.sys_name,
            device.sys_descr,
            device.last_seen
        );
    }

    getDevices() {
        const stmt = this.#db.prepare('SELECT * FROM devices');
        return stmt.all();
    }

    async getSNMPMetrics(ip, community, version, credentials = {}) {
        const session = new snmp.Session({
            host: ip,
            port: 161,
            community: community || 'public',
            version: version === 3 ? snmp.Version3 : (version === 1 ? snmp.Version1 : snmp.Version2c),
            ...(version === 3 ? {
                user: credentials.user || 'user',
                authProtocol: credentials.authProtocol || snmp.AuthProtocols.sha256,
                authKey: credentials.authKey || 'fakeKey',
                privProtocol: credentials.privProtocol || snmp.PrivProtocols.aes256,
                privKey: credentials.privKey || 'fakePrivKey'
            } : {})
        });

        const metrics = {};
        try {
            const sysDescr = await this.#getSNMPValue(session, ['1.3.6.1.2.1.1.1.0']);
            if (sysDescr) metrics.sysDescr = sysDescr.toString();
            const sysName = await this.#getSNMPValue(session, ['1.3.6.1.2.1.1.5.0']);
            if (sysName) metrics.sysName = sysName.toString();

            const cpuLoad = await this.#getSNMPValue(session, ['1.3.6.1.4.1.2021.11.11.0']);
            if (cpuLoad) metrics.cpuLoad = parseInt(cpuLoad);

            const ifInOctets = await this.#getSNMPValue(session, ['1.3.6.1.2.1.2.2.1.10.1']);
            if (ifInOctets) metrics.ifInOctets = parseInt(ifInOctets);
            const ifOutOctets = await this.#getSNMPValue(session, ['1.3.6.1.2.1.2.2.1.16.1']);
            if (ifOutOctets) metrics.ifOutOctets = parseInt(ifOutOctets);

            const ts = Date.now();
            for (const [name, value] of Object.entries(metrics)) {
                const stmt = this.#db.prepare(`
                    INSERT INTO metrics (ip, ts, metric_name, metric_value)
                    VALUES (?, ?, ?, ?)
                `);
                stmt.run(ip, ts, name, JSON.stringify(value));
            }
        } finally {
            session.close();
        }
        return metrics;
    }

    #getSNMPValue(session, oid) {
        return new Promise((resolve) => {
            session.get({ oid }, (err, varbinds) => {
                resolve(err || !varbinds[0] ? null : varbinds[0].value);
            });
        });
    }

    async setupTrapReceiver() {
        this.#trapServer = dgram.createSocket('udp4');
        this.#trapServer.bind(162, () => {
            console.log('SNMP trap receiver listening on port 162');
        });

        this.#trapServer.on('message', (msg) => {
            try {
                const session = new snmp.Session();
                const varbinds = session.parse(msg);
                for (const vb of varbinds) {
                    const stmt = this.#db.prepare(`
                        INSERT INTO traps (ip, ts, oid, value)
                        VALUES (?, ?, ?, ?)
                    `);
                    stmt.run(vb.sender.address, Date.now(), vb.oid.join('.'), JSON.stringify(vb.value));
                }
            } catch (err) {
                console.error('Error processing SNMP trap:', err);
            }
        });
    }

    configureTraps(enable) {
        if (enable && !this.#trapServer) {
            this.setupTrapReceiver();
        } else if (!enable && this.#trapServer) {
            this.#trapServer.close();
            this.#trapServer = null;
        }
    }

    async PortScan(ip) {
        const commonPorts = [22, 80, 443, 445, 21, 23, 3389, 631, 9100]; // SSH, HTTP, HTTPS, SMB, FTP, Telnet, RDP, IPP, JetDirect
        const openPorts = [];

        for (const port of commonPorts) {
            try {
                const isOpen = await new Promise((resolve) => {
                    const socket = new net.Socket();
                    socket.setTimeout(1000);
                    socket.on('connect', () => {
                        socket.destroy();
                        resolve(true);
                    });
                    socket.on('timeout', () => {
                        socket.destroy();
                        resolve(false);
                    });
                    socket.on('error', () => {
                        socket.destroy();
                        resolve(false);
                    });
                    socket.connect(port, ip);
                });
                if (isOpen) openPorts.push(port);
            } catch (err) {
                console.error(`Error scanning port ${port} on ${ip}:`, err);
            }
        }

        return { ip, openPorts };
    }
    
	async Ping(ipOrHost) {
        try {
            const res = await ping.promise.probe(ipOrHost, {
                timeout: 1, // Timeout in Sekunden
                extra: ['-c', '4'] // 4 Pings senden
            });
            return {
                host: ipOrHost,
                alive: res.alive,
                avgLatency: res.avg ? parseFloat(res.avg) : null, // Durchschnittliche Latenz in ms
                packetLoss: res.packetLoss ? parseFloat(res.packetLoss) : null, // Paketverlust in %
                error: res.alive ? null : res.output || 'No response'
            };
        } catch (err) {
            console.error(`Error pinging ${ipOrHost}:`, err);
            return {
                host: ipOrHost,
                alive: false,
                avgLatency: null,
                packetLoss: null,
                error: err.message
            };
        }
    }    

    async OSFingerprinting(ip) {
        try {
            const nmapScan = new nmap.OsAndPortScan(ip);
            const result = await new Promise((resolve, reject) => {
                nmapScan.on('complete', (data) => {
                    resolve(data[0] || {});
                });
                nmapScan.on('error', (err) => {
                    reject(err);
                });
                nmapScan.startScan();
            });

            return result;
        } catch (err) {
            console.error(`Error fingerprinting OS on ${ip}:`, err);
            return { ip, error: err.message };
        }
    }

    async EnumerateServices(ip) {
        const commonPorts = [80, 443, 22, 21, 23]; // Focus on services with banners
        const services = {};

        for (const port of commonPorts) {
            try {
                let banner = null;
                if (port === 80 || port === 443) {
                    banner = await new Promise((resolve) => {
                        const options = {
                            host: ip,
                            port,
                            path: '/',
                            method: 'GET',
                            timeout: 2000
                        };
                        const req = (port === 443 ? require('https') : http).request(options, (res) => {
                            let banner = res.headers['server'] || '';
                            if (res.headers['x-powered-by']) banner += `; ${res.headers['x-powered-by']}`;
                            resolve(banner || null);
                        });
                        req.on('error', () => resolve(null));
                        req.on('timeout', () => {
                            req.destroy();
                            resolve(null);
                        });
                        req.end();
                    });
                } else {
                    banner = await new Promise((resolve) => {
                        const socket = new net.Socket();
                        let data = '';
                        socket.setTimeout(2000);
                        socket.on('connect', () => {
                            socket.write('HEAD / HTTP/1.1\r\n\r\n'); // Generic probe
                        });
                        socket.on('data', (chunk) => {
                            data += chunk.toString();
                            if (data.length > 256) socket.destroy();
                        });
                        socket.on('end', () => {
                            resolve(data.trim() || null);
                        });
                        socket.on('timeout', () => {
                            socket.destroy();
                            resolve(null);
                        });
                        socket.on('error', () => {
                            socket.destroy();
                            resolve(null);
                        });
                        socket.connect(port, ip);
                    });
                }
                if (banner) {
                    services[port] = { port, banner };
                }
            } catch (err) {
                console.error(`Error enumerating service on ${ip}:${port}:`, err);
            }
        }

        return { ip, services };
    }
}

module.exports = { IME_NetworkMonitor, IME_NetworkMonitorSqlite3 };
