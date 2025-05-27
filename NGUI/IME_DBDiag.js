const assert = require('assert').strict;
const { IME_Sqlite3DB } = require('./httpsrv/IME_DB');

function runTests() {
  console.log('Starting IME_Sqlite3DB tests...');

  // Initialisiere Datenbank (In-Memory)
  const db = new IME_Sqlite3DB('memory.db');

  // Test-Daten für DeviceType
  const deviceStructure = {
    name: "Device",
    type: "struct",
    children: [
      { name: "DeviceID", type: "string" },
      {
        name: "Status",
        type: "struct",
        children: [
          { name: "Online", type: "boolean" },
          { name: "BatteryLevel", type: "number" }
        ]
      },
      {
        name: "Configuration",
        type: "struct",
        children: [
          { name: "FirmwareVersion", type: "string" },
          { name: "WiFiEnabled", type: "boolean" },
          {
            name: "Thresholds",
            type: "struct",
            children: [
              { name: "Temperature", type: "number" },
              { name: "Humidity", type: "number" }
            ]
          }
        ]
      }
    ]
  };

  // Test 1: Connect
  console.log('Test 1: Connect');
  db.Connect();
  assert(db.DpTypeExists('string'), 'string type should exist');
  assert(!db.DpTypeExists('DeviceType'), 'DeviceType should not exist initially');

  // Test 2: DpTypeCreate
  console.log('Test 2: DpTypeCreate');
  db.DpTypeCreate('DeviceType', deviceStructure);
  assert(db.DpTypeExists('DeviceType'), 'DeviceType should exist');
  assert(!db.DpTypeExists('DeviceType.Status'), 'DeviceType.Status should not exist');
  assert(!db.DpTypeExists('DeviceType.Configuration.Thresholds'), 'DeviceType.Configuration.Thresholds should not exist');
  assert.throws(() => db.DpTypeCreate('DeviceType', deviceStructure), /already exists/, 'Should throw on duplicate type');
  assert.throws(() => db.DpTypeCreate('invalid-name!', deviceStructure), /Invalid typeName/, 'Should throw on invalid type name');

  // Test 3: DpTypes
  console.log('Test 3: DpTypes');
  let types = db.DpTypes();
  assert(types.includes('DeviceType'), 'DeviceType should be in types');
  assert(!types.includes('DeviceType.Status'), 'DeviceType.Status should not be in types');
  types = db.DpTypes('Device*');
  assert(types.includes('DeviceType'), 'Pattern Device* should include DeviceType');
  assert(!types.includes('string'), 'Pattern Device* should not include string');

  // Test 4: DpCreate
  console.log('Test 4: DpCreate');
  let myDevice = db.DpCreate('MyDevice', 'DeviceType');
  assert(db.DpExists('MyDevice'), 'MyDevice should exist');
  assert(db.DpExists('MyDevice.DeviceID'), 'MyDevice.DeviceID should exist');
  assert(db.DpExists('MyDevice.Configuration.Thresholds.Temperature'), 'MyDevice.Configuration.Thresholds.Temperature should exist');
  assert.deepStrictEqual(
    myDevice,
    {
      DeviceID: '',
      Status: { Online: false, BatteryLevel: 0 },
      Configuration: { FirmwareVersion: '', WiFiEnabled: false, Thresholds: { Temperature: 0, Humidity: 0 } }
    },
    'DpCreate should return correct object structure'
  );
  assert.throws(() => db.DpCreate('MyDevice', 'DeviceType'), /already exists/, 'Should throw on duplicate data point');
  assert.throws(() => db.DpCreate('invalid-name!', 'DeviceType'), /Invalid dpName/, 'Should throw on invalid data point name');
  assert.throws(() => db.DpCreate('Test', 'NonExistentType'), /does not exist/, 'Should throw on non-existent type');

  // Test 5: DpCreate (primitive)
  console.log('Test 5: DpCreate (primitive)');
  let myCounter = db.DpCreate('myCounter', 'number');
  assert.strictEqual(myCounter, 0, 'Primitive number data point should return 0');
  assert(db.DpExists('myCounter'), 'myCounter should exist');

  // Test 6: DpSet
  for(var i=0;i<1000;i++)
  {
    console.log('Test 6: DpSet');
    db.DpSet('MyDevice.DeviceID', 'Device123');
    assert.strictEqual(db.DpGet('MyDevice.DeviceID'), 'Device123', 'DpSet should update DeviceID');
    db.DpSet('MyDevice.Status.Online', true);
    assert.strictEqual(db.DpGet('MyDevice.Status.Online'), true, 'DpSet should update Online');
    db.DpSet('MyDevice.Configuration.Thresholds.Temperature', 25.5);
    assert.strictEqual(db.DpGet('MyDevice.Configuration.Thresholds.Temperature'), 25.5, 'DpSet should update Temperature');
    db.DpSet('myCounter', 69);
  }




  assert.strictEqual(db.DpGet('myCounter'), 69, 'DpSet should update primitive number');
  assert.throws(() => db.DpSet('MyDevice.Status', {}), /struct type/, 'Should throw on setting struct');
  assert.throws(() => db.DpSet('MyDevice.DeviceID', 123), /Type mismatch/, 'Should throw on type mismatch');
  assert.throws(() => db.DpSet('NonExistent', 'test'), /does not exist/, 'Should throw on non-existent data point');

  // Test 7: DpGet
  console.log('Test 7: DpGet');
  let device = db.DpGet('MyDevice');
  assert.deepStrictEqual(
    device,
    {
      DeviceID: 'Device123',
      Status: { Online: true, BatteryLevel: 0 },
      Configuration: { FirmwareVersion: '', WiFiEnabled: false, Thresholds: { Temperature: 25.5, Humidity: 0 } }
    },
    'DpGet should return correct object structure'
  );
  assert.strictEqual(db.DpGet('myCounter'), 69, 'DpGet should return correct primitive value');
  assert.throws(() => db.DpGet('NonExistent'), /not found/, 'Should throw on non-existent data point');

  // Test 8: DpConnect/DpDisconnect
  console.log('Test 8: DpConnect/DpDisconnect');
  let callbackCalled = false;
  let callbackValue = null;
  db.DpConnect('MyDevice.DeviceID', (name, value) => {
    callbackCalled = true;
    callbackValue = value;
  });
  db.DpSet('MyDevice.DeviceID', 'Device456');
  assert(callbackCalled, 'Callback should be called on DpSet');
  assert.strictEqual(callbackValue, 'Device456', 'Callback should receive correct value');
  db.DpDisconnect('MyDevice.DeviceID');
  callbackCalled = false;
  db.DpSet('MyDevice.DeviceID', 'Device789');
  assert(!callbackCalled, 'Callback should not be called after DpDisconnect');

  // Test 9: DpNames
  console.log('Test 9: DpNames');
  let names = db.DpNames();
  assert(names.includes('MyDevice'), 'DpNames should include MyDevice');
  assert(names.includes('MyDevice.DeviceID'), 'DpNames should include MyDevice.DeviceID');
  assert(names.includes('MyDevice.Configuration.Thresholds.Temperature'), 'DpNames should include deep path');
  names = db.DpNames('number');
  assert(names.includes('myCounter'), 'DpNames with type filter should include myCounter');
  names = db.DpNames(null, 'MyDevice.*');
  assert(names.includes('MyDevice.DeviceID'), 'DpNames with pattern should include MyDevice.DeviceID');
  assert(!names.includes('myCounter'), 'DpNames with pattern should not include myCounter');

  // Test 10: DpDelete
  console.log('Test 10: DpDelete');
  db.DpDelete('MyDevice');
  assert(!db.DpExists('MyDevice'), 'MyDevice should be deleted');
  assert(!db.DpExists('MyDevice.DeviceID'), 'MyDevice.DeviceID should be deleted');
  assert(db.DpExists('myCounter'), 'myCounter should not be affected');
  db.DpDelete('myCounter');
  assert(!db.DpExists('myCounter'), 'myCounter should be deleted');

  // Test 11: DpTypeDelete
  console.log('Test 11: DpTypeDelete');
  //assert.throws(() => db.DpTypeDelete('DeviceType'), /in use/, 'Should throw when type is in use');
  db.DpCreate('MyDevice', 'DeviceType'); // Recreate for further tests
  db.DpDelete('MyDevice');
  db.DpTypeDelete('DeviceType');
  //assert(!db.DpTypeExists('DeviceType'), 'DeviceType should be deleted');

  if(!db.DpExists("cnt"))
    db.DpCreate('cnt', 'number');
  db.DpSet("cnt", 69);
  var test = db.DpGet("cnt");
  db.DpSet("cnt", 70);

  db.DpTypeCreate('DeviceType', deviceStructure);
  let obj = db.DpCreate('MyDevice', 'DeviceType');
  db.DpSet("MyDevice.DeviceID", "SChinkem");
  db.DpDelete('MyDevice');

  // Test 12: Disconnect
  console.log('Test 12: Disconnect');
  db.Disconnect();
  //assert.throws(() => db.DpGet('MyDevice'), /not found/, 'Should throw after Disconnect');
  assert(db._dpIdentificationTable.size === 0, 'DpIdentificationTable should be cleared');
  assert(db._dpTypeIdentificationTable.size === 0, 'DpTypeIdentificationTable should be cleared');

  console.log('All tests passed successfully!');



}

try {
  runTests();
} catch (err) {
  console.error('Test failed:', err.message);
  process.exit(1);
}