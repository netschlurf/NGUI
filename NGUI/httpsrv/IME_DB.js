const Database = require('better-sqlite3');

const ValueType = {
  STRING: 1,
  NUMBER: 2,
  BOOLEAN: 3
};

const DpType = {
  STRING: 1,
  NUMBER: 2,
  BOOLEAN: 3,
  STRUCT: 4
};

class IME_DB {
  Connect() { throw new Error('Connect method must be implemented by subclass'); }
  Disconnect() { throw new Error('Disconnect method must be implemented by subclass'); }
  DpCreate(name, typeName) { throw new Error('DpCreate method must be implemented by subclass'); }
  DpDelete(name) { throw new Error('DpDelete method must be implemented by subclass'); }
  DpSet(name, value) { throw new Error('DpSet method must be implemented by subclass'); }
  DpGet(name) { throw new Error('DpGet method must be implemented by subclass'); }
  DpConnect(name, callback) { throw new Error('DpConnect method must be implemented by subclass'); }
  DpDisconnect(name, callback) { throw new Error('DpDisconnect method must be implemented by subclass'); }
  DpTypeCreate(name, description) { throw new Error('DpTypeCreate method must be implemented by subclass'); }
  DpTypeDelete(typeName) { throw new Error('DpTypeDelete method must be implemented by subclass'); }

isValidDpName(name) {
  if (!name || typeof name !== 'string') return false;
  // Nur Buchstaben, Zahlen, Unterstrich und Bindestrich sind erlaubt, KEIN Punkt!
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

sanitizeDpName(name) {
  if (!name || typeof name !== 'string') return 'default_dp';
  let sanitized = name
    .replace(/[^a-zA-Z0-9_]/g, '_')  // ersetzt alle Nicht-alphanumerischen Zeichen (außer _)
    .replace(/^_+|_+$/g, '');        // entfernt führende oder abschließende _
  return sanitized.length > 0 ? sanitized : 'default_dp';
}

  get _dpIdentificationTable() {
    return this._dpIdentificationTableInternal;
  }

  get _dpTypeIdentificationTable() {
    return this._dpTypeIdentificationTableInternal;
  }
}

class IME_Sqlite3DB extends IME_DB {
  #db;
  #callbacks = new Map();
  #dpIdentificationTable = new Map(); // path -> { id, type_id, value_type, dpType }
  #dpTypeIdentificationTable = new Map(); // typeName -> { id, dpType }
  #updateStmt; // Für Cached Prepared Statement

  constructor(dbPath) {
    super();
    this.dbPath = dbPath;
    this.#updateStmt = null;
  }

  get _dpIdentificationTableInternal() {
    return this.#dpIdentificationTable;
  }

  get _dpTypeIdentificationTableInternal() {
    return this.#dpTypeIdentificationTable;
  }

Connect() {
    try {
      this.#db = new Database(this.dbPath);
      this.#db.exec('PRAGMA journal_mode=WAL'); // WAL aktivieren
      this.#db.exec('PRAGMA synchronous=NORMAL'); // Synchronisation optimieren      
      this.#createTables();
      this.#loadCaches();
      this.#updateStmt = this.#db.prepare(`
        UPDATE DataPoints
        SET value = ?, value_type = ?, tstamp = ?
        WHERE id = ?
      `);
    } catch (err) {
      throw new Error(`Failed to connect to database: ${err.message}`);
    }
  }

  Disconnect() {
    if (this.#db) {
      this.#db.close();
      this.#db = null;
      this.#updateStmt = null;
      this.#callbacks.clear();
      this.#dpIdentificationTable.clear();
      this.#dpTypeIdentificationTable.clear();
    }
  }

  #createTables() {
    const createTypesTable = `
      CREATE TABLE IF NOT EXISTS DataPointTypes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        parent_id INTEGER,
        type INTEGER NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES DataPointTypes(id)
      )`;

    const createDataPointsTable = `
      CREATE TABLE IF NOT EXISTS DataPoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        parent_id INTEGER,
        type_id INTEGER NOT NULL,
        value ANY,
        value_type INTEGER,
        tstamp INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (parent_id) REFERENCES DataPoints(id),
        FOREIGN KEY (type_id) REFERENCES DataPointTypes(id)
      )`;

    this.#db.exec(createTypesTable);
    this.#db.exec(createDataPointsTable);

    this.#db.exec('CREATE INDEX IF NOT EXISTS idx_dp_id ON DataPoints(id)');
    this.#db.exec('CREATE INDEX IF NOT EXISTS idx_dp_name ON DataPoints(name)');
    this.#db.exec('CREATE INDEX IF NOT EXISTS idx_dp_type_id ON DataPoints(type_id)');
    this.#db.exec('CREATE INDEX IF NOT EXISTS idx_type_id ON DataPointTypes(id)');
    this.#db.exec('CREATE INDEX IF NOT EXISTS idx_type_name ON DataPointTypes(name)');

    const initTypes = this.#db.transaction(() => {
      const stmt = this.#db.prepare('INSERT OR IGNORE INTO DataPointTypes (name, parent_id, type) VALUES (?, ?, ?)');
      stmt.run('string', null, DpType.STRING);
      stmt.run('number', null, DpType.NUMBER);
      stmt.run('boolean', null, DpType.BOOLEAN);
    });
    initTypes();
  }

  #loadCaches() {
    const typeRows = this.#db.prepare('SELECT id, name, type FROM DataPointTypes').all();
    for (const row of typeRows) {
      this.#dpTypeIdentificationTable.set(row.name, {
        id: row.id,
        dpType: row.type
      });
    }

    const dpRows = this.#db.prepare(`
      WITH RECURSIVE pathCTE AS (
        SELECT dp.id, dp.name, dp.parent_id, dp.type_id, dp.value_type, dpt.type AS dpType, CAST(dp.name AS TEXT) AS path
        FROM DataPoints dp
        JOIN DataPointTypes dpt ON dp.type_id = dpt.id
        WHERE dp.parent_id IS NULL
        UNION ALL
        SELECT dp.id, dp.name, dp.parent_id, dp.type_id, dp.value_type, dpt.type, p.path || '.' || dp.name
        FROM DataPoints dp
        JOIN DataPointTypes dpt ON dp.type_id = dpt.id
        JOIN pathCTE p ON dp.parent_id = p.id
      )
      SELECT id, type_id, value_type, dpType, path FROM pathCTE
    `).all();
    for (const row of dpRows) {
      this.#dpIdentificationTable.set(row.path, {
        id: row.id,
        type_id: row.type_id,
        value_type: row.value_type,
        dpType: row.dpType
      });
    }
  }

DpRename(dpName, newName) {
    if (!this.isValidDpName(newName)) {
      throw new Error(`Invalid typeName '${newName}': Only letters, numbers, '-', and '_' are allowed`);
    }
    // Prüfen ob der neue Name schon existiert (nur auf Root-Ebene!)
    if (this.#dpIdentificationTable.has(newName)) {
      throw new Error(`DataPoint '${newName}' already exists`);
    }
    // Hole das Entry
    const entry = this.#dpIdentificationTable.get(dpName);
    if (!entry) return { oldName: dpName, newName, changes: 0 };

    // Nur Root-DPs erlauben
    if (dpName.includes('.')) {
        throw new Error('Nur Root-Datenpunkte dürfen umbenannt werden!');
    }

    // Hole alle Children rekursiv (alte Pfade)
    const oldPaths = [];
    for (const path of this.#dpIdentificationTable.keys()) {
        if (path === dpName || path.startsWith(dpName + '.')) {
            oldPaths.push(path);
        }
    }

    // Benenne Root in DB um
    const stmt = this.#db.prepare('UPDATE DataPoints SET name = ? WHERE name = ? AND parent_id IS NULL');
    const result = stmt.run(newName, dpName);

    // Cache: Alle alten Pfade entfernen und mit neuen Namen wieder eintragen
    const updates = [];
    for (const oldPath of oldPaths) {
        const relPath = oldPath === dpName ? '' : oldPath.substring(dpName.length + 1);
        const newPath = relPath ? (newName + '.' + relPath) : newName;
        const entry = this.#dpIdentificationTable.get(oldPath);
        this.#dpIdentificationTable.delete(oldPath);
        this.#dpIdentificationTable.set(newPath, entry);
        updates.push({ oldPath, newPath });
    }

    return { oldName: dpName, newName, changes: result.changes, updates };
}

  DpTypeCreate(name, description) {
    if (!this.isValidDpName(name)) {
      throw new Error(`Invalid typeName '${name}': Only letters, numbers, '-', and '_' are allowed`);
    }
    if (this.DpTypeExists(name)) {
      throw new Error(`Type '${name}' already exists`);
    }

    const transaction = this.#db.transaction(() => {
      const typeStmt = this.#db.prepare(`
        INSERT INTO DataPointTypes (name, parent_id, type)
        VALUES (?, ?, ?)
      `);
      const typeInfo = typeStmt.run(name, null, DpType.STRUCT);
      const typeId = typeInfo.lastInsertRowid;
      this.#dpTypeIdentificationTable.set(name, { id: typeId, dpType: DpType.STRUCT });

      this.#createTypeChildren(typeId, description.children || [], name);
    });
    transaction();
  }

  #createTypeChildren(parentTypeId, children, parentTypeName, parentPath = '') {
    for (const child of children) {
      if (!child.name || !child.type) {
        throw new Error('Missing required fields: name or type');
      }

      let childType = null;
      let childTypeName = child.type;

      if (child.type === 'struct') {
        childType = DpType.STRUCT;
        childTypeName = parentTypeName;
      } else {
        childType = child.type === 'string' ? DpType.STRING :
                   child.type === 'number' ? DpType.NUMBER :
                   child.type === 'boolean' ? DpType.BOOLEAN :
                   null;
        if (!childType) {
          throw new Error(`Invalid type '${child.type}'`);
        }
      }

      const typeStmt = this.#db.prepare(`
        INSERT INTO DataPointTypes (name, parent_id, type)
        VALUES (?, ?, ?)
      `);
      const typeInfo = typeStmt.run(child.name, parentTypeId, childType);
      const childTypeId = typeInfo.lastInsertRowid;
      this.#dpTypeIdentificationTable.set(child.name, { id: childTypeId, dpType: childType });

      if (child.type === 'struct' && child.children) {
        const childPath = parentPath ? `${parentPath}.${child.name}` : child.name;
        this.#createTypeChildren(childTypeId, child.children, parentTypeName, childPath);
      }
    }
  }

DpCreate(dpName, dpTypeName) {
    if (!this.isValidDpName(dpName)) {
      throw new Error(`Invalid dpName '${dpName}'`);
    }
    // Prüfen ob der Name schon existiert
    if (this.DpExists(dpName)) {
      throw new Error(`DataPoint '${dpName}' already exists`);
    }
    if (!this.DpTypeExists(dpTypeName)) {
      throw new Error(`DataPointType '${dpTypeName}' does not exist`);
    }

    let result = null;
    const transaction = this.#db.transaction(() => {
      result = this.#createDataPoint(dpName, dpTypeName, dpName, null, true);
    });
    transaction();
    return result;
}

  #createDataPoint(dpName, dpTypeName, pathPrefix, parentId = null, isTopLevel = false) {
    const typeEntry = this.#dpTypeIdentificationTable.get(dpTypeName);
    if (!typeEntry) {
      throw new Error(`DataPointType '${dpTypeName}' does not exist`);
    }

    const dpType = typeEntry.dpType;
    const typeId = typeEntry.id;

    let value = null;
    let value_type = null;

    if (dpType === DpType.STRING) {
      value = '';
      value_type = ValueType.STRING;
    } else if (dpType === DpType.NUMBER) {
      value = 0;
      value_type = ValueType.NUMBER;
    } else if (dpType === DpType.BOOLEAN) {
      value = 0;
      value_type = ValueType.BOOLEAN;
    }

    const dpStmt = this.#db.prepare(`
      INSERT INTO DataPoints (name, parent_id, type_id, value, value_type, tstamp)
      VALUES (?, ?, ?, ?, ?, CAST(ROUND((julianday('now') - 2440587.5) * 86400000) AS INTEGER))
    `);
    const dpInfo = dpStmt.run(dpName, parentId, typeId, value, value_type);
    const dpId = dpInfo.lastInsertRowid;
    this.#dpIdentificationTable.set(pathPrefix, {
      id: dpId,
      type_id: typeId,
      value_type,
      dpType
    });

    let result = value;

    if (dpType === DpType.STRUCT) {
      result = {};

      const children = this.#db.prepare(`
        SELECT id, name, type
        FROM DataPointTypes
        WHERE parent_id = ?
      `).all(typeId);

      for (const child of children) {
        const childPath = `${pathPrefix}.${child.name}`;
        const childResult = this.#createDataPoint(child.name, child.name, childPath, dpId, false);
        result[child.name] = childResult;
      }
    }

    return dpType === DpType.BOOLEAN ? Boolean(result) : result;
  }

  DpExists(name) {
    return this.#dpIdentificationTable.has(name);
  }

  DpTypeExists(typeName) {
    return this.#dpTypeIdentificationTable.has(typeName);
  }

DpSet(name, value) {
    const entry = this.#dpIdentificationTable.get(name);
    if (!entry) {
      throw new Error(`DataPoint '${name}' does not exist`);
    }
    if (entry.dpType === DpType.STRUCT) {
      throw new Error(`Cannot set value for struct type '${name}'`);
    }
    const expectedType = this.#valueTypeToJsType(entry.value_type);
    if (expectedType && typeof value !== expectedType) {
      throw new Error(`Type mismatch for '${name}': expected ${expectedType}, got ${typeof value}`);
    }

    const value_type = entry.value_type || this.#jsTypeToValueType(typeof value);
    const dbValue = value_type === ValueType.BOOLEAN ? (value ? 1 : 0) : value;
    const tstamp = Date.now();
    const success = this.#updateStmt.run(dbValue, value_type, tstamp, entry.id);

    if (success.changes === 1) {
      this.#dpIdentificationTable.set(name, { ...entry, value_type });

      if (success.changes === 1) {
        this.#dpIdentificationTable.set(name, { ...entry, value_type });
        for (const [key, callback] of this.#callbacks.entries()) {
          if (name.includes(key)) {
            var res = {value, tstamp};
            callback(name, res);
          }
        }
      }
    }
  }

  DpGet(name) {
    const entry = this.#dpIdentificationTable.get(name);
    if (!entry) {
      throw new Error(`DataPoint '${name}' not found`);
    }

    if (entry.dpType === DpType.STRUCT) {
      const children = this.#db.prepare('SELECT id, name FROM DataPoints WHERE parent_id = ?').all(entry.id);
      const result = {};
      for (const child of children) {
        const childPath = `${name}.${child.name}`;
        result[child.name] = this.DpGet(childPath);
      }
      return result;
    }

    const row = this.#db.prepare('SELECT value, value_type, tstamp FROM DataPoints WHERE id = ?').get(entry.id);
    var res = {};
    res.value = this.#convertValue(row.value, row.value_type);
    res.tstamp = row.tstamp;
    return res;
  }

  #resolvePath(path) {
    const entry = this.#dpIdentificationTable.get(path);
    if (entry) {
      return entry.id;
    }

    const parts = path.split('.');
    let query = 'WITH RECURSIVE pathCTE AS (';
    for (let i = 0; i < parts.length; i++) {
      query += `SELECT dp.id, dp.parent_id, dp.type_id, dp.value_type, dpt.type AS dpType
                FROM DataPoints dp
                JOIN DataPointTypes dpt ON dp.type_id = dpt.id
                WHERE dp.name = '${parts[i]}'`;
      if (i > 0) {
        query += ' AND parent_id = (SELECT id FROM pathCTE LIMIT 1)';
      }
      if (i < parts.length - 1) {
        query += ' UNION ALL ';
      }
    }
    query += ') SELECT id, type_id, value_type, dpType FROM pathCTE LIMIT 1';
    const row = this.#db.prepare(query).get();
    if (row) {
      this.#dpIdentificationTable.set(path, {
        id: row.id,
        type_id: row.type_id,
        value_type: row.value_type,
        dpType: row.dpType
      });
      return row.id;
    }
    return null;
  }

  #valueTypeToJsType(valueType) {
    switch (valueType) {
      case ValueType.STRING: return 'string';
      case ValueType.NUMBER: return 'number';
      case ValueType.BOOLEAN: return 'boolean';
      default: return null;
    }
  }

  #jsTypeToValueType(jsType) {
    switch (jsType) {
      case 'string': return ValueType.STRING;
      case 'number': return ValueType.NUMBER;
      case 'boolean': return ValueType.BOOLEAN;
      default: throw new Error(`Unsupported JavaScript type: ${jsType}`);
    }
  }

  #convertValue(value, value_type) {
    if (value === null) return null;
    switch (value_type) {
      case ValueType.STRING: return value;
      case ValueType.NUMBER: return Number(value);
      case ValueType.BOOLEAN: return Boolean(value);
      default: return value;
    }
  }

  DpConnect(name, callback) {
    this.#callbacks.set(name, callback);
    return true;
  }

  DpDisconnect(name) {
    this.#callbacks.delete(name);
    return true;
  }

  DpDelete(name) {
    const entry = this.#dpIdentificationTable.get(name);
    if (!entry) return;

    const transaction = this.#db.transaction(() => {
      const children = this.#db.prepare('SELECT id, name FROM DataPoints WHERE parent_id = ?').all(entry.id);
      for (const child of children) {
        const childPath = `${name}.${child.name}`;
        this.DpDelete(childPath);
      }

      this.#db.prepare('DELETE FROM DataPoints WHERE id = ?').run(entry.id);
      this.#dpIdentificationTable.delete(name);
      this.#callbacks.delete(name);
    });
    transaction();
    return true;
  }

DpTypes(pattern = null) {
    // Alle Typen laden
    const allTypes = this.#db.prepare('SELECT id, name, parent_id, type FROM DataPointTypes').all();

    // Map: id -> typeObj
    const idMap = new Map();
    allTypes.forEach(row => {
        idMap.set(row.id, {
            name: row.name,
            type: this.#dpTypeToString(row.type),
            parent: null, // wird gleich gesetzt
            children: []
        });
    });

    // Parent-Relationen aufbauen
    allTypes.forEach(row => {
        const typeObj = idMap.get(row.id);
        if (row.parent_id && idMap.has(row.parent_id)) {
            typeObj.parent = idMap.get(row.parent_id).name;
            idMap.get(row.parent_id).children.push(typeObj);
        }
    });

    // Nur Wurzeltypen (parent_id == null)
    let roots = [];
    allTypes.forEach(row => {
        if (!row.parent_id) {
            roots.push(idMap.get(row.id));
        }
    });

    // Optional: Pattern-Filter auf Name anwenden (wie bei DpNames)
    function matchesPattern(name, pattern) {
        if (!pattern) return true;
        let regexPattern = pattern
            .replace(/([.+^${}()|\\])/g, '\\$1')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.')
            .replace(/\[([^\]]*)\]/g, '[$1]');
        const regex = new RegExp('^' + regexPattern + '$');
        return regex.test(name);
    }
    function filterTree(node) {
        const keepSelf = matchesPattern(node.name, pattern);
        node.children = node.children.map(filterTree).filter(Boolean);
        return keepSelf || node.children.length > 0 ? node : null;
    }
    roots = roots.map(filterTree).filter(Boolean);

    return roots;
}

// Hilfsfunktion für Typ-String
#dpTypeToString(typeInt) {
    switch (typeInt) {
        case 1: return "string";
        case 2: return "number";
        case 3: return "boolean";
        case 4: return "struct";
        default: return "unknown";
    }
}

  /**
   * Gibt alle DataPoints als Baumstruktur zurück.
   * @param {string|null} typeName - Optional: Nur DataPoints dieses Typs.
   * @param {string|null} pattern - Optional: Filter für Namen (mit *, ? erlaubt).
   * @returns {Array|Object} Baumstruktur der DataPoints.
   */
DpNames(typeName = null, pattern = null) {
  // Pattern-Matching Hilfsfunktion
  function matchesPattern(name, pattern) {
    if (!pattern) return true;
    let regexPattern = pattern
      .replace(/([.+^${}()|\\])/g, '\\$1')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
      .replace(/\[([^\]]*)\]/g, '[$1]');
    const regex = new RegExp('^' + regexPattern + '$');
    return regex.test(name);
  }

  // Typ-ID zu Name Mapping
  const typeIdToName = {};
  for (const [name, entry] of this._dpTypeIdentificationTable) {
    typeIdToName[entry.id] = name;
  }

  // Alle DataPoints laden
  const allDPs = [];
  for (const [path, entry] of this._dpIdentificationTable) {
    allDPs.push({
      path,
      ...entry,
      typeName: typeIdToName[entry.type_id] || null,
      children: []
    });
  }

  // Map: path -> node
  const pathMap = new Map();
  for (const dp of allDPs) {
    pathMap.set(dp.path, dp);
  }

  // Baum aufbauen anhand des Pfads
  let roots = [];
  for (const dp of allDPs) {
    // Filter nach Typ falls gewünscht
    if (typeName && dp.typeName !== typeName) continue;
    // Parent-Pfad bestimmen
    const lastDot = dp.path.lastIndexOf('.');
    if (lastDot !== -1) {
      const parentPath = dp.path.substring(0, lastDot);
      const parent = pathMap.get(parentPath);
      if (parent) {
        parent.children.push(dp);
        continue;
      }
    }
    // Wenn kein Parent gefunden, ist es ein Root
    roots.push(dp);
  }

  // Optional: Pattern-Filter auf allen Ebenen anwenden
  function filterTree(node) {
    const keepSelf = matchesPattern(node.path, pattern);
    node.children = node.children.map(filterTree).filter(Boolean);
    return keepSelf || node.children.length > 0 ? node : null;
  }
  roots = roots.map(filterTree).filter(Boolean);
  // Nur relevante Felder zurückgeben
  function clean(node) {
    // Kinder zuerst rekursiv bereinigen und sortieren
    const cleanedChildren = node.children.map(clean).sort((a, b) => a.DpName.localeCompare(b.DpName));
    return {
      DpName: node.path.split('.').pop(),
      DpType: node.typeName,
      dpTypeId: node.type_id,
      valueType: node.value_type,
      children: cleanedChildren
    };
  }
  // Auch die Wurzelknoten sortieren
  return roots.map(clean).sort((a, b) => a.DpName.localeCompare(b.DpName));
}

  DpTypeDelete(typeName) {
    const typeEntry = this.#dpTypeIdentificationTable.get(typeName);
    if (!typeEntry) return;

    const transaction = this.#db.transaction(() => {
      // Prüfen, ob der Typ in Verwendung ist
      const used = this.#db.prepare('SELECT 1 FROM DataPoints WHERE type_id = ?').get(typeEntry.id);
      if (used) {
        throw new Error(`Cannot delete type '${typeName}' as it is in use`);
      }

      // Rekursiv alle Kinder löschen
      const children = this.#db.prepare('SELECT id, name FROM DataPointTypes WHERE parent_id = ?').all(typeEntry.id);
      for (const child of children) {
        // Rekursiver Aufruf für Kind-Typen
        this.DpTypeDelete(child.name);
      }

      // Den Typ selbst löschen
      this.#db.prepare('DELETE FROM DataPointTypes WHERE id = ?').run(typeEntry.id);
      this.#dpTypeIdentificationTable.delete(typeName);
    });
    transaction();
    return true;
  }
}

module.exports = { IME_DB, IME_Sqlite3DB };