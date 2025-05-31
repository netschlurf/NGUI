const fs = require('fs');
const path = require('path');
const { IME_Sqlite3DB } = require('./IME_DB');

jest.spyOn(console, 'error').mockImplementation(() => {});

const TEST_DB_PATH = path.join(__dirname, 'test_ime_db.sqlite3');

function cleanupTestDb() {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
}

describe('IME_Sqlite3DB', () => {
  let db;

  beforeEach(() => {
    cleanupTestDb();
    db = new IME_Sqlite3DB(TEST_DB_PATH);
    db.Connect();
  });

  afterEach(() => {
    db.Disconnect();
    cleanupTestDb();
  });

  test('should create and retrieve a simple string DataPoint', () => {
    db.DpCreate('myString', 'string');
    expect(db.DpExists('myString')).toBe(true);

    db.DpSet('myString', 'hello');
    const result = db.DpGet('myString');
    expect(result.value).toBe('hello');
    expect(typeof result.tstamp).toBe('number');
  });

  test('should create and retrieve multiple string DataPoints', () => {
    db.DpCreate(['str1', 'str2'], ['string', 'string']);
    expect(db.DpExists('str1')).toBe(true);
    expect(db.DpExists('str2')).toBe(true);

    db.DpSet(['str1', 'str2'], ['hello', 'world']);
    const results = db.DpGet(['str1', 'str2']);
    expect(results[0].value).toBe('hello');
    expect(results[1].value).toBe('world');
    expect(typeof results[0].tstamp).toBe('number');
    expect(typeof results[1].tstamp).toBe('number');
  });

  test('should create and retrieve a number DataPoint', () => {
    db.DpCreate('myNumber', 'number');
    db.DpSet('myNumber', 42);
    const result = db.DpGet('myNumber');
    expect(result.value).toBe(42);
  });

  test('should create and retrieve multiple number DataPoints', () => {
    db.DpCreate(['num1', 'num2'], ['number', 'number']);
    db.DpSet(['num1', 'num2'], [42, 100]);
    const results = db.DpGet(['num1', 'num2']);
    expect(results[0].value).toBe(42);
    expect(results[1].value).toBe(100);
  });

  test('should create and retrieve a boolean DataPoint', () => {
    db.DpCreate('myBool', 'boolean');
    db.DpSet('myBool', true);
    let result = db.DpGet('myBool');
    expect(result.value).toBe(true);

    db.DpSet('myBool', false);
    result = db.DpGet('myBool');
    expect(result.value).toBe(false);
  });

  test('should create and retrieve multiple boolean DataPoints', () => {
    db.DpCreate(['bool1', 'bool2'], ['boolean', 'boolean']);
    db.DpSet(['bool1', 'bool2'], [true, false]);
    const results = db.DpGet(['bool1', 'bool2']);
    expect(results[0].value).toBe(true);
    expect(results[1].value).toBe(false);
  });

  test('should throw on type mismatch in DpSet', () => {
    db.DpCreate('myNum', 'number');
    expect(() => db.DpSet('myNum', 'notANumber')).toThrow(/Type mismatch/);
  });

  test('should throw on type mismatch in DpSet with array', () => {
    db.DpCreate(['num1', 'num2'], ['number', 'number']);
    expect(() => db.DpSet(['num1', 'num2'], [42, 'notANumber'])).toThrow(/Type mismatch/);
  });

  test('should throw when setting value for struct', () => {
    db.DpTypeCreate('MyStruct', {
      children: [
        { name: 'field1', type: 'string' }
      ]
    });
    db.DpCreate('struct1', 'MyStruct');
    expect(() => db.DpSet('struct1', {})).toThrow(/Cannot set value for struct/);
  });

  test('should create and retrieve a struct DataPoint', () => {
    db.DpTypeCreate('Person', {
      children: [
        { name: 'name', type: 'string' },
        { name: 'age', type: 'number' },
        { name: 'active', type: 'boolean' }
      ]
    });
    db.DpCreate('person1', 'Person');
    db.DpSet('person1.name', 'Alice');
    db.DpSet('person1.age', 30);
    db.DpSet('person1.active', true);

    const person = db.DpGet('person1');
    expect(person.name.value).toBe('Alice');
    expect(person.age.value).toBe(30);
    expect(person.active.value).toBe(true);
  });

  test('should delete DataPoint and its children', () => {
    db.DpTypeCreate('Group', {
      children: [
        { name: 'member', type: 'string' }
      ]
    });
    db.DpCreate('group1', 'Group');
    expect(db.DpExists('group1')).toBe(true);
    expect(db.DpExists('group1.member')).toBe(true);

    db.DpDelete('group1');
    expect(db.DpExists('group1')).toBe(false);
    expect(db.DpExists('group1.member')).toBe(false);
  });

  test('should delete multiple DataPoints', () => {
    db.DpTypeCreate('Group', {
      children: [
        { name: 'member', type: 'string' }
      ]
    });
    db.DpCreate(['group1', 'group2'], ['Group', 'Group']);
    expect(db.DpExists('group1')).toBe(true);
    expect(db.DpExists('group1.member')).toBe(true);
    expect(db.DpExists('group2')).toBe(true);
    expect(db.DpExists('group2.member')).toBe(true);

    db.DpDelete(['group1', 'group2']);
    expect(db.DpExists('group1')).toBe(false);
    expect(db.DpExists('group1.member')).toBe(false);
    expect(db.DpExists('group2')).toBe(false);
    expect(db.DpExists('group2.member')).toBe(false);
  });

  test('should rename a DataPoint', () => {
    db.DpCreate('oldName', 'string');
    db.DpSet('oldName', 'test');
    const res = db.DpRename('oldName', 'newName');
    expect(res.changes).toBe(1);
    expect(db.DpExists('oldName')).toBe(false);
    expect(db.DpExists('newName')).toBe(true);
    expect(db.DpGet('newName').value).toBe('test');
  });

  test('should list DataPoint types as tree', () => {
    db.DpTypeCreate('ParentType', {
      children: [
        { name: 'child1', type: 'string' },
        { name: 'child2', type: 'number' }
      ]
    });
    const types = db.DpTypes();
    const parent = types.find(t => t.name === 'ParentType');
    expect(parent).toBeDefined();
    expect(parent.children.length).toBe(2);
    expect(parent.children.map(c => c.name).sort()).toEqual(['child1', 'child2']);
  });

  test('should list DataPoints as tree', () => {
    db.DpTypeCreate('TreeType', {
      children: [
        { name: 'leaf', type: 'number' }
      ]
    });
    db.DpCreate('root', 'TreeType');
    db.DpSet('root.leaf', 99);

    const tree = db.DpNames();
    const root = tree.find(n => n.DpName === 'root');
    expect(root).toBeDefined();
    expect(root.children.length).toBe(1);
    expect(root.children[0].DpName).toBe('leaf');
    expect(root.children[0].DpType).toBe('leaf');
  });

  test('should filter DpNames by pattern', () => {
    db.DpCreate(['alpha', 'beta', 'gamma'], ['string', 'string', 'string']);
    const filtered = db.DpNames(null, 'b*');
    expect(filtered.length).toBe(1);
    expect(filtered[0].DpName).toBe('beta');
  });

  test('should throw when deleting type in use', () => {
    db.DpTypeCreate('ToDelete', { children: [] });
    db.DpCreate('dp1', 'ToDelete');
    expect(() => db.DpTypeDelete('ToDelete')).toThrow(/in use/);
  });

  test('should delete type and its children recursively', () => {
    db.DpTypeCreate('Parent', {
      children: [
        { name: 'Child', type: 'string' }
      ]
    });
    db.DpTypeDelete('Parent');
    expect(db.DpTypeExists('Parent')).toBe(false);
    expect(db.DpTypeExists('Child')).toBe(false);
  });

  test('should support DpConnect and DpDisconnect', () => {
    db.DpCreate('signal', 'number');
    let called = false;
    db.DpConnect('signal', (name, res) => {
      called = true;
      expect(name).toBe('signal');
      expect(res.value).toBe(123);
    });
    db.DpSet('signal', 123);
    expect(called).toBe(true);

    db.DpDisconnect('signal');
    called = false;
    db.DpSet('signal', 456);
    expect(called).toBe(false);
  });

  test('should support DpConnect and DpDisconnect with array', () => {
    db.DpCreate(['sig1', 'sig2'], ['number', 'number']);
    let calls = [];
    db.DpConnect(['sig1', 'sig2'], (name, res) => {
      calls.push({ name, value: res.value });
    });
    db.DpSet(['sig1', 'sig2'], [123, 456]);
    expect(calls.length).toBe(2);
    expect(calls).toContainEqual({ name: 'sig1', value: 123 });
    expect(calls).toContainEqual({ name: 'sig2', value: 456 });

    db.DpDisconnect(['sig1', 'sig2']);
    calls = [];
    db.DpSet(['sig1', 'sig2'], [789, 101]);
    expect(calls.length).toBe(0);
  });
});