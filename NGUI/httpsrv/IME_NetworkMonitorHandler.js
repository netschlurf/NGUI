const NGUIHandlerBase = require('./NGUIHandlerBase');

/**
 * Handler for WebSocket messages related to network monitoring.
 */
class IME_NetworkMonitorHandler extends NGUIHandlerBase {
    constructor(db) {
        super();
        this.db = db;
        this.commandMap = {
            'DiscoverDevices': this.DiscoverDevices.bind(this),
            'GetSNMPMetrics': this.GetSNMPMetrics.bind(this),
            'ListDevices': this.ListDevices.bind(this),
            'ConfigureSNMPTraps': this.ConfigureSNMPTraps.bind(this),
            'PortScan': this.PortScan.bind(this),
            'OSFingerprint': this.OSFingerprint.bind(this),
            'EnumerateServices': this.EnumerateServices.bind(this),
        };
    }

    OnHandle(ws, msg) {
        if (this.commandMap[msg.cmd]) {
            this.commandMap[msg.cmd](msg, ws);
            return true;
        }
        return false;
    }

    async DiscoverDevices(msg, ws) {
        if (!msg.args || !msg.args.ipRange) {
            const rsp = { cmd: msg.cmd, rc: 400, error: 'Missing ipRange' };
            this.sendResponse(ws, msg, null, rsp);
            return;
        }

        try {
            const devices = await this.db.discoverDevices(msg.args.ipRange);
            const rsp = { cmd: msg.cmd, devices, rc: 200 };
            this.sendResponse(ws, msg, rsp);
        } catch (err) {
            console.error('Error in DiscoverDevices:', err);
            const rsp = { cmd: msg.cmd, rc: 500, error: err.message };
            this.sendResponse(ws, msg, null, rsp);
        }
    }

    async GetSNMPMetrics(msg, ws) {
        if (!msg.args || !msg.args.ip || !msg.args.version) {
            const rsp = { cmd: msg.cmd, rc: 400, error: 'Missing ip or version' };
            this.sendResponse(ws, msg, null, rsp);
            return;
        }

        try {
            const metrics = await this.db.getSNMPMetrics(
                msg.args.ip,
                msg.args.community || 'public',
                msg.args.version,
                msg.args.credentials || {}
            );
            const rsp = { cmd: msg.cmd, metrics, rc: 200 };
            this.sendResponse(ws, msg, rsp);
        } catch (err) {
            console.error('Error in GetSNMPMetrics:', err);
            const rsp = { cmd: msg.cmd, rc: 500, error: err.message };
            this.sendResponse(ws, msg, null, rsp);
        }
    }

    ListDevices(msg, ws) {
        try {
            const devices = this.db.getDevices();
            const rsp = { cmd: msg.cmd, devices, rc: 200 };
            this.sendResponse(ws, msg, rsp);
        } catch (err) {
            console.error('Error in ListDevices:', err);
            const rsp = { cmd: msg.cmd, rc: 500, error: err.message };
            this.sendResponse(ws, msg, null, rsp);
        }
    }

    ConfigureSNMPTraps(msg, ws) {
        if (!msg.args || typeof msg.args.enable !== 'boolean') {
            const rsp = { cmd: msg.cmd, rc: 400, error: 'Missing or invalid enable flag' };
            this.sendResponse(ws, msg, null, rsp);
            return;
        }

        try {
            this.db.configureTraps(msg.args.enable);
            const rsp = { cmd: msg.cmd, rc: 200, status: msg.args.enable ? 'Traps enabled' : 'Traps disabled' };
            this.sendResponse(ws, msg, rsp);
        } catch (err) {
            console.error('Error in ConfigureSNMPTraps:', err);
            const rsp = { cmd: msg.cmd, rc: 500, error: err.message };
            this.sendResponse(ws, msg, null, rsp);
        }
    }

    async PortScan(msg, ws) {
        if (!msg.args || !msg.args.ip) {
            const rsp = { cmd: msg.cmd, rc: 400, error: 'Missing ip' };
            this.sendResponse(ws, msg, null, rsp);
            return;
        }

        try {
            const result = await this.db.PortScan(msg.args.ip);
            const rsp = { cmd: msg.cmd, result, rc: 200 };
            this.sendResponse(ws, msg, rsp);
        } catch (err) {
            console.error('Error in PortScan:', err);
            const rsp = { cmd: msg.cmd, rc: 500, error: err.message };
            this.sendResponse(ws, msg, null, rsp);
        }
    }

    async OSFingerprint(msg, ws) {
        if (!msg.args || !msg.args.ip) {
            const rsp = { cmd: msg.cmd, rc: 400, error: 'Missing ip' };
            this.sendResponse(ws, msg, null, rsp);
            return;
        }

        try {
            const result = await this.db.OSFingerprinting(msg.args.ip);
            const rsp = { cmd: msg.cmd, result, rc: 200 };
            this.sendResponse(ws, msg, rsp);
        } catch (err) {
            console.error('Error in OSFingerprint:', err);
            const rsp = { cmd: msg.cmd, rc: 500, error: err.message };
            this.sendResponse(ws, msg, null, rsp);
        }
    }

    async EnumerateServices(msg, ws) {
        if (!msg.args || !msg.args.ip) {
            const rsp = { cmd: msg.cmd, rc: 400, error: 'Missing ip' };
            this.sendResponse(ws, msg, null, rsp);
            return;
        }

        try {
            const result = await this.db.EnumerateServices(msg.args.ip);
            const rsp = { cmd: msg.cmd, result, rc: 200 };
            this.sendResponse(ws, msg, rsp);
        } catch (err) {
            console.error('Error in EnumerateServices:', err);
            const rsp = { cmd: msg.cmd, rc: 500, error: err.message };
            this.sendResponse(ws, msg, null, rsp);
        }
    }
}

module.exports = IME_NetworkMonitorHandler;