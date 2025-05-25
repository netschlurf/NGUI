//const NGUIHandlerBase = require('./NGUIHandlerBase');

/**
 * Handler for WebSocket messages related to time series data archiving.
 */
class IME_ArchiveHandler  {
    /**
     * Constructor.
     * @param {IME_ArchiveSqlite3} db - The database instance for time series storage.
     */
    constructor(db) {
        //super();
        this.db = db;
        this.commandMap = {
            'DpGetPeriod': this.DpGetPeriod.bind(this),
        };
    }

    /**
     * Processes incoming WebSocket messages and dispatches them to the appropriate command handler.
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
     * Retrieves historical values for a data point within a specified time period.
     * @param {Object} msg - The incoming message with dpName, startTs, and endTs in args.
     * @param {WebSocket} ws - The WebSocket instance.
     * @example
     * // Client sends: {cmd: "DpGetPeriod", args: {dpName: "myCounter", startTs: 1697059200000, endTs: 1697145600000}, tok: "123"}
     * // Response: {data: {cmd: "DpGetPeriod", dpName: "myCounter", values: [{ts: 1697059200000, value: 1}, ...], rc: 200}, ...}
     */
    DpGetPeriod(msg, ws) {
        if (!msg.args || !msg.args.dpName || !msg.args.startTs || !msg.args.endTs) {
            const rsp = {cmd: msg.cmd, dpName: msg.args?.dpName, rc: 300};
            this.sendResponse(ws, msg, null, rsp);
            return;
        }

        try {
            const values = this.db.getPeriod(msg.args.dpName, msg.args.startTs, msg.args.endTs);
            const rsp = {cmd: msg.cmd, dpName: msg.args.dpName, values, rc: 200};
            this.sendResponse(ws, msg, rsp);
        } catch (err) {
            console.error('Error in DpGetPeriod:', err);
            const rsp = {cmd: msg.cmd, dpName: msg.args.dpName, rc: 400};
            this.sendResponse(ws, msg, null, rsp);
        }
    }
}

module.exports = IME_ArchiveHandler;