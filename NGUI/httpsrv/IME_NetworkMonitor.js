const IME_ServiceBase = require('./IME_ServiceBase');
const { IME_NetworkMonitorSqlite3 } = require('./IME_NetworkMonitorSqlite3');
const IME_NetworkMonitorHandler = require('./IME_NetworkMonitorHandler');

/**
 * Network monitoring module for device discovery and SNMP-based metric collection.
 * Extends IME_ServiceBase to provide HTTP/WebSocket server and NGUI connectivity.
 * Manages a SQLite database for storing device information and network metrics.
 */
class IME_NetworkMonitor extends IME_ServiceBase {
    constructor(dbPath, port = 2810, config = {}) {
        super(port, {
            nguiUrl: 'ws://localhost:2808',
            maxReconnectDelay: 30000,
            ...config
        });
        this.dbPath = dbPath;
        this.db = null;
        this.handler = null;
        this.commandMap = {
            ...this.commandMap,
            'DiscoverDevices': this.handleForwardedMessage.bind(this),
            'GetSNMPMetrics': this.handleForwardedMessage.bind(this),
            'ListDevices': this.handleForwardedMessage.bind(this),
            'ConfigureSNMPTraps': this.handleForwardedMessage.bind(this),
            'PortScan': this.handleForwardedMessage.bind(this),
            'OSFingerprint': this.handleForwardedMessage.bind(this),
            'EnumerateServices': this.handleForwardedMessage.bind(this),
        };
    }

    async initializeModule() {
        this.db = new IME_NetworkMonitorSqlite3(this.dbPath);
        this.db.Connect();
        this.handler = new IME_NetworkMonitorHandler(this.db);
        this.registerHandler(this.handler);
        // await this.db.setupTrapReceiver();
    }

    async setupNGUIConnection(ws) {
        await this.requestNGUI(ws, {
            cmd: 'RegisterCommands',
            args: { commands: ['DiscoverDevices', 'GetSNMPMetrics', 'ListDevices', 'ConfigureSNMPTraps', 'PortScan', 'OSFingerprint', 'EnumerateServices'] },
            tok: 'register-cmds'
        });
        console.log('Successfully registered commands with NGUI');
    }

    handleForwardedMessage(msg, ws) {
        this.handler.OnHandle(ws, msg);
    }

    cleanupModule() {
        if (this.db) {
            this.db.Disconnect();
            this.db = null;
        }
    }
}

if (require.main === module) {
    const dbPath = process.argv[2];
    if (!dbPath) {
        console.error('Database path is required as a command-line argument');
        process.exit(1);
    }
    const monitor = new IME_NetworkMonitor(dbPath);
    monitor.start();
}

module.exports = IME_NetworkMonitor;