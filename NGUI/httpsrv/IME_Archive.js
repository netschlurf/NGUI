const http = require('http');
const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');
const { IME_ArchiveSqlite3 } = require('./IME_ArchiveSqlite3');
const IME_ArchiveHandler = require('./IME_ArchiveHandler');

/**
 * Archive server for HTTP and WebSocket communication on the same port.
 * Connects to NGUI to retrieve data points and store time series data.
 */
class IME_Archive {
    /**
     * Initializes the archive server with a database path and port.
     * @param {string} dbPath - Path to the SQLite database file.
     * @param {number} port - Port for HTTP and WebSocket (default: 2809).
     */
    constructor(dbPath, port = 2809) {
        this.dbPath = dbPath;
        this.port = port;
        this.server = null;
        this.wss = null;
        this.handlers = [];
        this.commandMap = {
            'LoadPage': this.serveResource.bind(this),
            'LoadResource': this.serveResource.bind(this),
            'DpGetPeriod': this.handleForwardedMessage.bind(this), // Handle forwarded DpGetPeriod
        };
        this.db = new IME_ArchiveSqlite3(dbPath);
        this.handler = new IME_ArchiveHandler(this.db);
        this.registerHandler(this.handler);
        this.nguiWs = null;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.maxReconnectDelay = 30000; // 30 seconds
    }

    /**
     * Registers a handler for incoming WebSocket messages.
     * @param {function} handler - Callback function for message processing.
     */
    registerHandler(handler) {
        this.handlers.push(handler);
    }

    /**
     * Starts the HTTP and WebSocket server and connects to NGUI for data points.
     */
    async start() {
        this.server = http.createServer(this.handleHttpRequest.bind(this));
        this.wss = new WebSocket.Server({ server: this.server });

        this.wss.on('connection', this.handleWebSocketConnection.bind(this));
        this.server.listen(this.port, () => {
            console.log(`Archive server running on port ${this.port}`);
        });

        // Connect to database
        this.db.Connect();

        // Connect to NGUI server
        await this.connectToNGUI();
    }

    /**
     * Connects to NGUI server to retrieve data point names, establish DpConnect,
     * and register supported commands.
     */
    async connectToNGUI() {
        if (this.isConnecting) return;
        try {
            this.isConnecting = true;
            const reconnectDelay = Math.min(
                5000 * Math.pow(2, this.reconnectAttempts), // Exponential backoff
                this.maxReconnectDelay
            );

            if (this.reconnectAttempts > 0) {
                console.log(`Attempting to reconnect to NGUI server in ${reconnectDelay / 1000} seconds (attempt ${this.reconnectAttempts + 1})`);
                await new Promise(resolve => setTimeout(resolve, reconnectDelay));
            }

            this.nguiWs = new WebSocket('ws://localhost:2808');
            this.isConnecting = false;

            this.nguiWs.on('open', async () => {
                console.log('Connected to NGUI server');
                this.reconnectAttempts = 0; // Reset attempts on successful connection
                // Register commands with NGUI
                try {
                    await this.requestNGUI(this.nguiWs, {
                        cmd: 'RegisterCommands',
                        args: { commands: ['DpGetPeriod'] },
                        tok: 'register-cmds'
                    });
                    console.log('Successfully registered commands with NGUI');

                    // Retrieve data point names
                    const dpNames = await this.requestNGUI(this.nguiWs, { cmd: 'DpNames', args: {}, tok: 'archive-init' });
                    console.log('Retrieved data point names:', dpNames);

                    // Ensure tables exist for all data points
                    await this.db.ensureTables(dpNames.names);

                    // Establish DpConnect for each data point
                    for (const dpName of dpNames.names) {
                        this.nguiWs.send(JSON.stringify({ cmd: 'DpConnect', args: { dpName }, tok: `connect-${dpName}` }));
                    }
                } catch (err) {
                    console.error('Error processing NGUI:', err);
                    this.handleNGUIReconnect();
                }
            });

            this.nguiWs.on('message', (message) => {
                try {
                    const msg = JSON.parse(message);
                    if (msg.data && msg.data.dpName && msg.data.value !== undefined) {
                        // Store received data point value in database
                        this.db.storeDataPoint(msg.data.dpName, msg.data.value);
                    }
                } catch (err) {
                    console.error('Error processing NGUI message:', err);
                }
            });

            this.nguiWs.on('error', (err) => {
                console.error('NGUI WebSocket error:', err);
                this.handleNGUIReconnect();
            });

            this.nguiWs.on('close', () => {
                console.log('Disconnected from NGUI server');
                this.handleNGUIReconnect();
            });

        } catch (err) {
            console.error('Failed to connect to NGUI:', err);
            this.isConnecting = false;
            this.handleNGUIReconnect();
        }
    }

    /**
     * Handles reconnection to NGUI server.
     */
    handleNGUIReconnect() {
        if (this.nguiWs) {
            this.nguiWs.removeAllListeners();
            this.nguiWs = null;
        }
        this.reconnectAttempts++;
        this.connectToNGUI();
    }

    /**
     * Handles messages forwarded by NGUI (e.g., DpGetPeriod).
     * @param {Object} msg - The forwarded message.
     * @param {WebSocket} ws - The WebSocket instance.
     */
    handleForwardedMessage(msg, ws) {
        // Delegate to handler for processing
        this.handler.OnHandle(ws, msg);
    }

    /**
     * Sends a request to NGUI server and awaits response.
     * @param {WebSocket} ws - WebSocket instance.
     * @param {Object} msg - Message to send.
     * @returns {Promise<Object>} - Response data.
     */
    requestNGUI(ws, msg) {
        return new Promise((resolve, reject) => {
            ws.send(JSON.stringify(msg));
            const handler = (message) => {
                try {
                    const response = JSON.parse(message);
                    if (response.tok === msg.tok) {
                        ws.off('message', handler);
                        if (response.err) {
                            reject(new Error(response.err));
                        } else {
                            resolve(response.data);
                        }
                    }
                } catch (err) {
                    reject(err);
                }
            };
            ws.on('message', handler);
            setTimeout(() => {
                ws.off('message', handler);
                reject(new Error('Request to NGUI timed out'));
            }, 5000); // 5-second timeout
        });
    }

    /**
     * Handles incoming HTTP requests, serving index.html for root or empty URLs.
     * @param {http.IncomingMessage} req - HTTP request.
     * @param {http.ServerResponse} res - HTTP response.
     */
    handleHttpRequest(req, res) {
        const baseUrl = req.url.split('?')[0];
        const filePath = (baseUrl === '/' || baseUrl === '') ? 'index.html' : baseUrl;
        this.serveFile(filePath, res);
    }

    /**
     * Handles new WebSocket connections.
     * @param {WebSocket} ws - WebSocket instance.
     */
    handleWebSocketConnection(ws) {
        console.log('WebSocket connected');
        ws.on('message', this.handleWebSocketMessage.bind(this, ws));
        ws.on('close', () => this.handleWebSocketClose(ws));
    }

    /**
     * Processes incoming WebSocket messages.
     * @param {WebSocket} ws - WebSocket instance.
     * @param {Buffer} message - Incoming message.
     */
    handleWebSocketMessage(ws, message) {
        let msg;
        try {
            msg = JSON.parse(message);
        } catch (err) {
            console.error('Invalid JSON:', err);
            return;
        }

        if (!msg || !msg.cmd) {
            return;
        }

        if (this.commandMap[msg.cmd]) {
            this.commandMap[msg.cmd](msg, ws);
            return;
        } else {
            this.invokeCustomHandlers(ws, msg);
        }
    }

    /**
     * Handles WebSocket close event.
     * @param {WebSocket} ws - The WebSocket instance.
     */
    handleWebSocketClose(ws) {
        console.log('WebSocket closed');
        for (const handler of this.handlers) {
            handler.OnWebsocketClosed(ws);
        }
    }

    /**
     * Closes the HTTP and WebSocket server.
     */
    close() {
        if (this.wss) {
            this.wss.close(() => console.log('WebSocket server closed'));
        }
        if (this.server) {
            this.server.close(() => console.log('HTTP server closed'));
        }
        if (this.nguiWs) {
            this.nguiWs.close();
            this.nguiWs = null;
        }
        this.db.Disconnect();
    }

    /**
     * Sends a response over WebSocket.
     * @param {WebSocket} ws - WebSocket instance.
     * @param {Object} msg - The original message.
     * @param {any} data - The response data.
     * @param {string} [err] - Error message, if any.
     */
    sendResponse(ws, msg, data, err = null) {
        const response = {
            data,
            args: msg.args || null,
            tok: msg.tok
        };
        if (err) {
            response.err = err;
        }
        ws.send(JSON.stringify(response));
    }

    /**
     * Serves a file from the filesystem for HTTP requests.
     * @param {string} filePath - Relative file path.
     * @param {WebSocket} res - The response object.
     */
    async serveFile(filePath, res) {
        const fullPath = await this.resolveFilePath(filePath);
        if (!fullPath) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'File not found' }));
            return;
        }

        try {
            const data = await fs.readFile(fullPath);
            const contentType = this.getContentType(fullPath);
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        } catch (err) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: err.message }));
        }
    }

    /**
     * Serves a resource for WebSocket requests.
     * @param {Object} msg - The incoming message.
     * @param {WebSocket} ws - The WebSocket instance.
     */
    async serveResource(msg, ws) {
        if (!msg.args || !msg.args.fileName) {
            this.sendResponse(ws, msg, '', '400');
            return;
        }

        const fullPath = await this.resolveFilePath(msg.args.fileName);
        if (!fullPath) {
            this.sendResponse(ws, msg, '', '404');
            return;
        }

        try {
            const data = await fs.readFile(fullPath, 'utf8');
            this.sendResponse(ws, msg, data);
        } catch (err) {
            this.sendResponse(ws, msg, '', '404');
        }
    }

    /**
     * Resolves a file path for serving resources.
     * @param {string} filePath - Relative file path.
     * @returns {string|null} - Resolved full path or null if not found.
     */
    async resolveFilePath(filePath) {
        const paths = [];
        const myRoot = __dirname.replace("httpsrv", "htdocs");
        paths.push(path.join(myRoot, filePath));

        for (const handler of this.handlers) {
            const customPath = await handler.GetHtdocsRoot();
            if (customPath) {
                paths.push(path.join(customPath, filePath));
            }
        }

        for (const fullPath of paths) {
            try {
                await fs.access(fullPath);
                return fullPath;
            } catch (err) {
                continue;
            }
        }
        return null;
    }

    /**
     * Determines the Content-Type based on file extension.
     * @param {string} filePath - File path.
     * @returns {string} - Content-Type.
     */
    getContentType(filePath) {
        if (filePath.endsWith('.js')) {
            return 'application/javascript';
        }
        if (filePath.endsWith('.html')) {
            return 'text/html';
        }
        if (filePath.endsWith('.css')) {
            return 'text/css';
        }
        return 'text/plain';
    }

    /**
     * Invokes custom handlers for WebSocket messages.
     * @param {WebSocket} ws - WebSocket instance.
     * @param {Object} msg - Incoming message.
     */
    invokeCustomHandlers(ws, msg) {
        for (const handler of this.handlers) {
            if (handler.OnHandle(ws, msg)) {
                return;
            }
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