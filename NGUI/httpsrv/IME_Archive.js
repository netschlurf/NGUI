const IME_ServiceBase = require('./IME_ServiceBase');
const { IME_ArchiveSqlite3 } = require('./IME_ArchiveSqlite3');
const IME_ArchiveHandler = require('./IME_ArchiveHandler');

/**
 * Archive module for handling time series data storage and retrieval.
 * Extends IME_ServiceBase to provide HTTP/WebSocket server and NGUI connectivity.
 * Manages a SQLite database for storing data points and supports DpGetPeriod queries.
 */
class IME_Archive extends IME_ServiceBase {
    /**
     * Initializes the archive module.
     * @param {string} dbPath - Path to the SQLite database file.
     * @param {number} port - Port for HTTP and WebSocket (default: 2809).
     * @param {Object} config - Configuration object (e.g., NGUI URL).
     */
    constructor(dbPath, port = 2809, config = {}) {
        super(port, config);
        this.dbPath = dbPath;
        this.db = null;
        this.handler = null;
        // Extend commandMap with module-specific commands
        this.commandMap = {
            ...this.commandMap,
            'DpGetPeriod': this.handleForwardedMessage.bind(this),
        };
    }

    /**
     * Initializes module-specific resources (database and handler).
     * @override
     */
    async initializeModule() {
        this.db = new IME_ArchiveSqlite3(this.dbPath);
        this.db.Connect();
        this.handler = new IME_ArchiveHandler(this.db);
        this.registerHandler(this.handler);
    }

    /**
     * Sets up NGUI connection by registering commands and initializing data points.
     * @override
     * @param {WebSocket} ws - NGUI WebSocket instance.
     */
    async setupNGUIConnection(ws) {
        // Register commands with NGUI
        await this.requestNGUI(ws, {
            cmd: 'RegisterCommands',
            args: { commands: ['DpGetPeriod'] },
            tok: 'register-cmds'
        });
        console.log('Successfully registered commands with NGUI');

        // Retrieve data point names
        const dpNames = await this.requestNGUI(ws, {
            cmd: 'DpNames',
            args: {},
            tok: 'archive-init'
        });
        console.log('Retrieved data point names:', dpNames);

        // Ensure tables exist for all data points
        await this.db.ensureTables(dpNames.names);

        // Establish DpConnect for each data point
        for (const dpName of dpNames.names) {
            ws.send(JSON.stringify({
                cmd: 'DpConnect',
                args: { dpName },
                tok: `connect-${dpName}`
            }));
        }
    }

    /**
     * Handles incoming NGUI messages, including data points and forwarded commands.
     * @override
     * @param {Buffer} message - Incoming message.
     */
    handleNGUIMessage(message) {
        try {
            const msg = JSON.parse(message);
            if (msg.data && msg.data.data && msg.data.data.cmd === 'DpConnect' && msg.data.data.dpName && msg.data.data.value !== undefined) {
                // Store received data point value in database
                this.db.storeDataPoint(msg.data.data.dpName, msg.data.data.value);
            }
            if (msg.cmd && this.commandMap[msg.cmd]) {
                // Handle forwarded messages like DpGetPeriod
                this.commandMap[msg.cmd](msg, this.nguiWs);
            }
        } catch (err) {
            // Suppress logging for robustness
            // console.error('Error processing NGUI message:', err);
        }
    }

    /**
     * Handles forwarded messages from NGUI (e.g., DpGetPeriod).
     * @param {Object} msg - The forwarded message.
     * @param {WebSocket} ws - The WebSocket instance.
     */
    handleForwardedMessage(msg, ws) {
        this.handler.OnHandle(ws, msg);
    }

    /**
     * Cleans up module-specific resources (database connection).
     * @override
     */
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
    const archive = new IME_Archive(dbPath);
    archive.start();
}

module.exports = IME_Archive;