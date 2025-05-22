const { IME_Sqlite3DB } = require('./httpsrv/IME_DB');

function runExample() {
    const db = new IME_Sqlite3DB('example.db');
  
    try {
      // Connect to the database
      console.log('Connecting to database...');
      db.Connect();
      console.log('Connected successfully!');
  
      // Verify tables exist
      console.log('\nChecking if tables exist...');
      console.log('DataPointTypes table exists:', db.TableExists('DataPointTypes'));
      console.log('DataPoints table exists:', db.TableExists('DataPoints'));
      console.log('Open SQLite DB Browser to verify tables exist in example.db');
  
      // Create a simple type
      console.log('\nCreating simple type...');
      const simpleType = {
        dpTypeName: 'Temperature',
        dpType: 'number'
      };
      db.DpTypeCreate(JSON.stringify(simpleType));
      console.log('Created simple type: Temperature');
  
      // Verify type exists
      console.log('\nVerifying type exists...');
      let type = db.GetType('Temperature');
      console.log('Type Temperature:', type);
      console.log('Open SQLite DB Browser to verify DataPointTypes table contains Temperature');
  
      // Try to delete a non-existent type
      console.log('\nTrying to delete non-existent type...');
      try {
        db.DpTypeDelete('NonExistentType');
      } catch (err) {
        console.log('Caught expected error:', err.message);
      }
  
      // Create a data point
      console.log('\nCreating data point...');
      db.DpCreate('officeTemp', 'Temperature');
      console.log('Created data point: officeTemp');
  
      // Try to delete type referenced by data point
      console.log('\nTrying to delete type referenced by data point...');
      try {
        db.DpTypeDelete('Temperature');
      } catch (err) {
        console.log('Caught expected error:', err.message);
      }
  
      // Delete the data point
      console.log('\nDeleting data point...');
      db.DpDelete('officeTemp');
      console.log('Deleted data point: officeTemp');
  
      // Delete the type
      console.log('\nDeleting type...');
      db.DpTypeDelete('Temperature');
      console.log('Deleted type: Temperature');
  
      // Verify type is deleted
      console.log('\nVerifying type is deleted...');
      type = db.GetType('Temperature');
      console.log('Type Temperature:', type);
      console.log('Open SQLite DB Browser to verify DataPointTypes table no longer contains Temperature');
  
      // Clean up
      console.log('\nCleaning up...');
      db.Disconnect();
      console.log('Disconnected from database');
    } catch (err) {
      console.error('Error:', err.message);
      if (db) {
        db.Disconnect();
      }
    }
  }
  
  // Run the example
  runExample();