const Database = require('better-sqlite3');
const WebSocket = require('ws');

/**
 * Base class for archive database operations.
 */
class IME_Archive {
    Connect() { throw new Error('Connect method must be implemented by subclass'); }
    Disconnect() { throw new Error('Disconnect method must be implemented by subclass'); }
    ensureTables(dpNames) { throw new Error('ensureTables method must be implemented by subclass'); }
    storeDataPoint(dpName, value) { throw new Error('storeDataPoint method must be implemented by subclass'); }
    getPeriod(dpName, startTs, endTs) { throw new Error('getPeriod method must be implemented by subclass'); }
}

/**
 * SQLite implementation for archiving time series data.
 */
class IME_ArchiveSqlite3 extends IME_Archive {
    #db;

    /**
     * Constructor.
     * @param {string} dbPath - Path to the SQLite database file.
     */
    constructor(dbPath) {
        super();
        this.dbPath = dbPath;
        this.nguiWs = null;
    }

    /**
     * Connects to the SQLite database.
     */
    Connect() {
        try {
            this.#db = new Database(this.dbPath);
        } catch (err) {
            throw new Error(`Failed to connect to database: ${err.message}`);
        }
    }

    /**
     * Disconnects from the SQLite database.
     */
    Disconnect() {
        if (this.#db) {
            this.#db.close();
            this.#db = null;
        }
    }

    /**
     * Ensures that tables exist for all data points.
     * @param {string[]} dpNames - Array of data point names.
     */
    async ensureTables(dpNames) {
        // Connect to NGUI to retrieve type information
        const ws = new WebSocket('ws://localhost:2808');
        await new Promise((resolve) => ws.on('open', resolve));

        for (const dpName of dpNames) {
            try {
                // Retrieve type information for the data point
                const dpInfo = await this.requestNGUI(ws, {
                    cmd: 'DpGet',
                    args: { dpName },
                    tok: `type-${dpName}`
                });
                const typeName = dpInfo.typeName || 'unknown';
                this.#createTable(dpName, typeName);
            } catch (err) {
                console.error(`Error retrieving type for ${dpName}:`, err);
                this.#createTable(dpName, 'unknown');
            }
        }

        ws.close();
    }

    /**
     * Creates a table for a data point if it does not exist.
     * @param {string} dpName - Data point name.
     * @param {string} typeName - Data point type.
     */
    #createTable(dpName, typeName) {
        const safeTableName = this.#sanitizeTableName(dpName);
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS "${safeTableName}" (
                ts INTEGER NOT NULL,
                value TEXT NOT NULL
            )`;
        this.#db.exec(createTableQuery);
        console.log(`Table created for dpName: ${dpName} (type: ${typeName})`);
    }

    /**
     * Sanitizes a data point name to be used as a table name.
     * @param {string} dpName - Data point name.
     * @returns {string} - Sanitized table name.
     */
    #sanitizeTableName(dpName) {
        return dpName.replace(/[^a-zA-Z0-9_]/g, '_');
    }

    /**
     * Stores a data point value with a timestamp.
     * @param {string} dpName - Data point name.
     * @param {*} value - Value to store.
     */
    storeDataPoint(dpName, value) {
        const safeTableName = this.#sanitizeTableName(dpName);
        const ts = Date.now();
        const stmt = this.#db.prepare(`
            INSERT INTO "${safeTableName}" (ts, value)
            VALUES (?, ?)
        `);
        stmt.run(ts, JSON.stringify(value));
    }

    /**
     * Retrieves historical values for a data point within a time period.
     * @param {string} dpName - Data point name.
     * @param {number} startTs - Start timestamp (Unix milliseconds).
     * @param {number} endTs - End timestamp (Unix milliseconds).
     * @returns {Array<{ts: number, value: any}>} - Array of time series data.
     */
    getPeriod(dpName, startTs, endTs) {
        const safeTableName = this.#sanitizeTableName(dpName);
        const stmt = this.#db.prepare(`
            SELECT ts, value FROM "${safeTableName}"
            WHERE ts >= ? AND ts <= ?
            ORDER BY ts ASC
        `);
        const rows = stmt.all(startTs, endTs);
        return rows.map(row => ({
            ts: row.ts,
            value: JSON.parse(row.value)
        }));
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
        });
    }
}

module.exports = { IME_Archive, IME_ArchiveSqlite3 };