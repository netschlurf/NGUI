const NGUIHandlerBase = require('./NGUIHandlerBase');

/**
 * Handler for WebSocket messages related to network monitoring.
 */
class IME_NetworkMonitorHandler extends NGUIHandlerBase {
    /**
     * Constructor.
     * @param {IME_NetworkMonitorSqlite3} db - The database instance for network data.
     */
    constructor(db) {
        super();
        this.db = db;
        this.commandMap = {
            'DiscoverDevices': this.DiscoverDevices.bind(this),
            'GetSNMPMetrics': this.GetSNMPMetrics.bind(this),
            'ListDevices': this.ListDevices.bind(this),
            'ConfigureSNMPTraps': this.ConfigureSNMPTraps.bind(this),
        };
    }

    /**
     * Processes incoming WebSocket messages and dispatches to command handlers.
     * @param {WebSocket} ws - The WebSocket instance.
     * @param {Object} msg - The incoming message with command and arguments.
     */
    OnHandle(ws, msg) {
        if (this.commandMap[msg.cmd]) {
            this.commandMap[msg.cmd](msg, ws);
            return true;
        }
        return false;
    }

    /**
     * Triggers a device discovery scan.
     * @param {Object} msg - Message with ipRange in args (e.g., '192.168.1.0/24').
     * @param {WebSocket} ws - The WebSocket instance.
     */
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

    /**
     * Retrieves SNMP metrics for a device.
     * @param {Object} msg - Message with ip, community, version, and optional credentials in args.
     * @param {WebSocket} ws - The WebSocket instance.
     */
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

    /**
     * Lists all discovered devices.
     * @param {Object} msg - Message (no args required).
     * @param {WebSocket} ws - The WebSocket instance.
     */
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

    /**
     * Configures SNMP trap reception.
     * @param {Object} msg - Message with enable (boolean) in args.
     * @param {WebSocket} ws - The WebSocket instance.
     */
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
}

module.exports = IME_NetworkMonitorHandler;