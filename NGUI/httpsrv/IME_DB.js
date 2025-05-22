const Database = require('better-sqlite3');

class IME_DB {
  Connect() { throw new Error('Connect method must be implemented by subclass'); }
  Disconnect() { throw new Error('Disconnect method must be implemented by subclass'); }
  DpCreate(name, typ) { throw new Error('DpCreate method must be implemented by subclass'); }
  DpDelete(name) { throw new Error('DpDelete method must be implemented by subclass'); }
  DpSet(name, value) { throw new Error('DpSet method must be implemented by subclass'); }
  DpGet(name) { throw new Error('DpGet method must be implemented by subclass'); }
  DpConnect(name, callback) { throw new Error('DpConnect method must be implemented by subclass'); }
  DpDisconnect(name, callback) { throw new Error('DpDisconnect method must be implemented by subclass'); }
  DpTypeCreate(jsonDescription) { throw new Error('DpTypeCreate method must be implemented by subclass'); }
  DpTypeDelete(typeName) { throw new Error('DpTypeDelete method must be implemented by subclass'); }
}

class IME_Sqlite3DB extends IME_DB {
  #db;
  #callbacks = new Map();

  constructor(dbPath) {
    super();
    this.dbPath = dbPath;
  }

  Connect() {
    try {
      this.#db = new Database(this.dbPath);
      this.#createTables();
    } catch (err) {
      throw new Error(`Failed to connect to database: ${err.message}`);
    }
  }

  Disconnect() {
    if (this.#db) {
      this.#db.close();
      this.#db = null;
      this.#callbacks.clear();
    }
  }

  #createTables() {
    const createTypesTable = `
      CREATE TABLE IF NOT EXISTS DataPointTypes (
        typeName TEXT PRIMARY KEY,
        typeDefinition TEXT NOT NULL
      )`;

    const createDataPointsTable = `
      CREATE TABLE IF NOT EXISTS DataPoints (
        name TEXT PRIMARY KEY,
        typeName TEXT NOT NULL,
        value TEXT,
        FOREIGN KEY (typeName) REFERENCES DataPointTypes(typeName)
      )`;

    this.#db.exec(createTypesTable);
    this.#db.exec(createDataPointsTable);
  }

  DpTypeCreate(jsonDescription) {
    const parsed = JSON.parse(jsonDescription);
  
    if (!parsed.dpTypeName || !parsed.dpType) {
      throw new Error('Missing required fields: dpTypeName or dpType');
    }
  
    // Existenz prüfen
    const exists = this.#db.prepare('SELECT 1 FROM DataPointTypes WHERE typeName = ?').get(parsed.dpTypeName);
    if (exists) {
      throw new Error(`Type '${parsed.dpTypeName}' already exists`);
    }
  
    const stmt = this.#db.prepare(`
      INSERT INTO DataPointTypes (typeName, typeDefinition)
      VALUES (?, ?)
    `);
    stmt.run(parsed.dpTypeName, jsonDescription);
  }

  DpTypeDelete(typeName) {
    const exists = this.#db.prepare('SELECT 1 FROM DataPointTypes WHERE typeName = ?').get(typeName);
    if (!exists) throw new Error(`Type ${typeName} does not exist`);

    const inUse = this.#db.prepare('SELECT 1 FROM DataPoints WHERE typeName = ?').get(typeName);
    if (inUse) throw new Error(`Type ${typeName} is still in use by some DataPoints`);

    this.#db.prepare('DELETE FROM DataPointTypes WHERE typeName = ?').run(typeName);
  }

  #generateDefaultValue(typeDef) {
    if (typeDef.dpType !== 'complex') {
      return typeDef.dpType === 'string' ? '' :
             typeDef.dpType === 'number' ? 0 :
             typeDef.dpType === 'boolean' ? false : null;
    }

    const result = {};
    for (const child of (typeDef.children || [])) {
      result[child.dpTypeName] = this.#generateDefaultValue(child);
    }
    return result;
  }

  DpCreate(dpName, dpTypeName) {
 
    if (!dpName || !dpTypeName) {
      throw new Error('Missing required fields: dpName or dpTypeName');
    }
  
    // Existenz prüfen
    const exists = this.#db.prepare('SELECT 1 FROM DataPoints WHERE name = ?').get(dpName);
    if (exists) {
      throw new Error(`DataPoint '${dpName}' already exists`);
    }
  
    // Typ-ID holen
    const typeDefinition = this.#db.prepare('SELECT typeDefinition FROM DataPointTypes WHERE typeName = ?').get(dpTypeName);
    if (!typeDefinition) {
      throw new Error(`DataPointType '${dpTypeName}' does not exist`);
    }
    const defaultValue = this.#buildDefaultFromType(JSON.parse(typeDefinition.typeDefinition));
    const stmt = this.#db.prepare(`
      INSERT INTO DataPoints (name, typeName, value)
      VALUES (?, ?, ?)
    `);
    stmt.run(dpName, dpTypeName, JSON.stringify(defaultValue));
    return defaultValue;
  }

  #buildDefaultFromType(typeDef) {
    const getDefault = (type) => {
      switch (type) {
        case 'string': return '';
        case 'number': return 0;
        case 'boolean': return false;
        case 'complex': return {};
        default: return null;
      }
    };
  
    if (typeDef.dpType === 'complex' && Array.isArray(typeDef.children)) {
      const obj = {};
      for (const child of typeDef.children) {
        obj[child.dpTypeName] = this.#buildDefaultFromType(child);
      }
      return obj;
    } else {
      return getDefault(typeDef.dpType);
    }
  }
  
  

  DpDelete(name) {
    this.#db.prepare('DELETE FROM DataPoints WHERE name = ?').run(name);
    this.#callbacks.delete(name);
  }

  DpSet(name, value) {
    const dp = this.#db.prepare('SELECT typeName FROM DataPoints WHERE name = ?').get(name);
    if (!dp) throw new Error(`DataPoint ${name} does not exist`);

    const typeRow = this.#db.prepare('SELECT typeDefinition FROM DataPointTypes WHERE typeName = ?').get(dp.typeName);
    const typeDef = JSON.parse(typeRow.typeDefinition);

    if (typeDef.dpType === 'complex') {
      if (typeof value !== 'object') throw new Error('Expected object for complex type');
      this.#validateComplexType(value, typeDef);
    } else if (typeof value !== typeDef.dpType) {
      throw new Error(`Type mismatch for ${name}: expected ${typeDef.dpType}, got ${typeof value}`);
    }

    const update = this.#db.prepare('UPDATE DataPoints SET value = ? WHERE name = ?');
    var success = update.run(JSON.stringify(value), name);
    if(success.changes == 1) {
      const callback = this.#callbacks.get(name);
      if (callback) {
        callback(name, value);
      }
    }
  }

  DpGet(name) {
    const row = this.#db.prepare('SELECT value FROM DataPoints WHERE name = ?').get(name);
    if (!row) throw new Error(`DataPoint ${name} not found`);
    return JSON.parse(row.value);
  }

  #validateComplexType(value, typeDef) {
    for (const child of typeDef.children || []) {
      const val = value[child.dpTypeName];
      if (child.dpType === 'complex') {
        this.#validateComplexType(val, child);
      } else {
        if (typeof val !== child.dpType) {
          throw new Error(`Invalid type for ${child.dpTypeName}, expected ${child.dpType}, got ${typeof val}`);
        }
      }
    }
  }

  DpConnect(name, callback) {
    this.#callbacks.set(name, callback);
  }

  DpDisconnect(name) {
    this.#callbacks.delete(name);
  }
}

module.exports = { IME_DB, IME_Sqlite3DB };
