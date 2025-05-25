const Database = require('better-sqlite3');
const ping = require('ping');
const dgram = require('dgram');
const snmp = require('snmp-native');

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
}

/**
 * SQLite implementation for network monitoring and SNMP data storage.
 */
class IME_NetworkMonitorSqlite3 extends IME_NetworkMonitor {
    #db;
    #trapServer;

    /**
     * Constructor.
     * @param {string} dbPath - Path to the SQLite database file.
     */
    constructor(dbPath) {
        super();
        this.dbPath = dbPath;
        this.#trapServer = null;
    }

    /**
     * Connects to the SQLite database and creates tables.
     */
    Connect() {
        try {
            this.#db = new Database(this.dbPath);
            this.#createTables();
        } catch (err) {
            throw new Error(`Failed to connect to database: ${err.message}`);
        }
    }

    /**
     * Creates database tables for devices and metrics.
     */
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

    /**
     * Disconnects from the SQLite database and stops trap receiver.
     */
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

    /**
     * Discovers devices using ping sweeps and UDP broadcast.
     * @param {string} ipRange - IP range (e.g., '192.168.1.0/24').
     * @returns {Promise<Array>} Discovered devices.
     */
    async discoverDevices(ipRange) {
        const devices = [];
        const subnet = this.#parseIpRange(ipRange);
        const community = 'public'; // Default SNMP community string

        // Ping sweep
        for (const ip of subnet) {
            try {
                const res = await ping.promise.probe(ip, { timeout: 1 });
                if (res.alive) {
                    const device = { ip, mac: null, hostname: res.host, snmp_enabled: 0, sys_name: null, sys_descr: null, last_seen: Date.now() };
                    // Try SNMP
                    const snmpData = await this.#probeSNMP(ip, community, 2);
                    if (snmpData) {
                        device.snmp_enabled = 1;
                        device.sys_name = snmpData.sysName || null;
                        device.sys_descr = snmpData.sysDescr || null;
                    }
                    devices.push(device);
                    this.#storeDevice(device);
                }
            } catch (err) {
                console.error(`Error probing ${ip}:`, err);
            }
        }

        // UDP broadcast for service discovery
        await this.#broadcastDiscovery(devices);

        return devices;
    }

    /**
     * Parses an IP range (e.g., '192.168.1.0/24') into individual IPs.
     * @param {string} ipRange - IP range in CIDR notation.
     * @returns {string[]} Array of IP addresses.
     */
    #parseIpRange(ipRange) {
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

    /**
     * Probes a device for SNMP data.
     * @param {string} ip - Device IP address.
     * @param {string} community - SNMP community string.
     * @param {number} version - SNMP version (1, 2, or 3).
     * @param {Object} credentials - SNMPv3 credentials (optional).
     * @returns {Promise<Object|null>} SNMP data or null if failed.
     */
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

            session.get({ oid: ['1.3.6.1.2.1.1.1.0'] }, (err, varbinds) => { // sysDescr
                if (err) {
                    session.close();
                    resolve(null);
                    return;
                }

                const result = {};
                if (varbinds[0]) result.sysDescr = varbinds[0].value.toString();

                session.get({ oid: ['1.3.6.1.2.1.1.5.0'] }, (err2, varbinds2) => { // sysName
                    session.close();
                    if (!err2 && varbinds2[0]) result.sysName = varbinds2[0].value.toString();
                    resolve(result);
                });
            });
        });
    }

    /**
     * Performs UDP broadcast for service discovery.
     * @param {Array} devices - List of devices to update.
     */
    #broadcastDiscovery(devices) {
        return new Promise((resolve) => {
            const server = dgram.createSocket('udp4');
            server.bind(() => {
                server.setBroadcast(true);
                const message = Buffer.from('DISCOVER_IME');
                server.send(message, 0, message.length, 1900, '255.255.255.255', () => {
                    server.close();
                    resolve();
                });
            });

            server.on('message', (msg, rinfo) => {
                const device = devices.find(d => d.ip === rinfo.address);
                if (device) {
                    device.mac = msg.toString().split(':')[1] || null;
                    this.#storeDevice(device);
                }
            });
        });
    }

    /**
     * Stores or updates a device in the database.
     * @param {Object} device - Device data.
     */
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

    /**
     * Retrieves all discovered devices.
     * @returns {Array} List of devices.
     */
    getDevices() {
        const stmt = this.#db.prepare('SELECT * FROM devices');
        return stmt.all();
    }

    /**
     * Retrieves SNMP metrics for a device.
     * @param {string} ip - Device IP address.
     * @param {string} community - SNMP community string.
     * @param {number} version - SNMP version (1, 2, or 3).
     * @param {Object} credentials - SNMPv3 credentials (optional).
     * @returns {Promise<Object>} Metrics data.
     */
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
            // System info
            const sysDescr = await this.#getSNMPValue(session, ['1.3.6.1.2.1.1.1.0']);
            if (sysDescr) metrics.sysDescr = sysDescr.toString();
            const sysName = await this.#getSNMPValue(session, ['1.3.6.1.2.1.1.5.0']);
            if (sysName) metrics.sysName = sysName.toString();

            // CPU usage (example OID, vendor-specific)
            const cpuLoad = await this.#getSNMPValue(session, ['1.3.6.1.4.1.2021.11.11.0']);
            if (cpuLoad) metrics.cpuLoad = parseInt(cpuLoad);

            // Interface traffic (ifInOctets, ifOutOctets for first interface)
            const ifInOctets = await this.#getSNMPValue(session, ['1.3.6.1.2.1.2.2.1.10.1']);
            if (ifInOctets) metrics.ifInOctets = parseInt(ifInOctets);
            const ifOutOctets = await this.#getSNMPValue(session, ['1.3.6.1.2.1.2.2.1.16.1']);
            if (ifOutOctets) metrics.ifOutOctets = parseInt(ifOutOctets);

            // Store metrics
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

    /**
     * Retrieves a single SNMP value.
     * @param {snmp.Session} session - SNMP session.
     * @param {number[]} oid - Object Identifier.
     * @returns {Promise<any>} Value or null.
     */
    #getSNMPValue(session, oid) {
        return new Promise((resolve) => {
            session.get({ oid }, (err, varbinds) => {
                resolve(err || !varbinds[0] ? null : varbinds[0].value);
            });
        });
    }

    /**
     * Sets up an SNMP trap receiver.
     */
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

    /**
     * Enables or disables SNMP trap reception.
     * @param {boolean} enable - True to enable, false to disable.
     */
    configureTraps(enable) {
        if (enable && !this.#trapServer) {
            this.setupTrapReceiver();
        } else if (!enable && this.#trapServer) {
            this.#trapServer.close();
            this.#trapServer = null;
        }
    }
}

module.exports = { IME_NetworkMonitor, IME_NetworkMonitorSqlite3 };