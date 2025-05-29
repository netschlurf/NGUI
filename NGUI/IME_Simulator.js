const IME_ServiceBase = require('./httpsrv/IME_ServiceBase');

/**
 * Archive module for handling time series data storage and retrieval.
 * Extends IME_ServiceBase to provide HTTP/WebSocket server and NGUI connectivity.
 * Manages a SQLite database for storing data points and supports DpGetPeriod queries.
 */
class IME_Simulator extends IME_ServiceBase {
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
            args: { commands: ['DpNoIdea'] },
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

        this.allDPs = dpNames;
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
    (async () => {
        const sim = new IME_Simulator();
        await sim.start(); // warte, bis alles initialisiert ist

        // Optional: Warte, bis allDPs und ws gesetzt sind
        while (!sim.allDPs || !sim.allDPs.names || !sim.nguiWs) {
            await new Promise(r => setTimeout(r, 100));
        }

        setInterval(async () => {
            console.log('Callback every 1s');
            for (var i = 0; i < sim.allDPs.names.length; i++) {
                var dp = sim.allDPs.names[i];
                if (dp.dpTypeId == 2) {
                    let val = Math.floor((Math.random() * 1000) % 100);
                    try
                    {
                        const rsp = await sim.requestNGUI(sim.nguiWs, {
                            cmd: 'DpSet',
                            args: { dpName: dp.DpName, value: val },
                            tok: i
                        });
                    }
                    catch(e)
                    {
                        console.log(e);
                    }
                }
            }
        }, 100);
    })();
}

module.exports = IME_Simulator;