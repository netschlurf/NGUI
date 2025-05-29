const NGUI = require('./httpsrv/NGUI.js');
const { IME_Sqlite3DB } = require('./httpsrv/IME_DB');
const IME_DBHandler = require('./httpsrv/IME_DBHandler');
const IME_STD_DPT = require('./httpsrv/IME_STD_DPT.js');


const imeDB = new IME_Sqlite3DB('NGUI.db');
imeDB.Connect();
//const ngui = new NGUI(2808);
//const dbHandler = new IME_DBHandler(imeDB);

//ngui.registerHandler(dbHandler);
//ngui.start();

function CreateSampleDatabase()
{
  const stdDPs = new IME_STD_DPT();

  const dpTypes = [
    ["Device", stdDPs.GetDPT_SampleDeviceStructure()],
    ["User", stdDPs.GetDPT_User()]
  ];

  for (const [name, structure] of dpTypes) {
    try {
      imeDB.DpTypeCreate(name, structure);
    } catch (error) {
      console.log(`Fehler bei DpTypeCreate(${name}): ${error.message}`);
    }
  }

  const dps = [
    ["SampleDevice", "Device"],
    ["default", "User"],
    ["admin", "User"],
    ["eima", "User"],
    ["string1", "string"],
    ["string2", "string"], 
    ["boolean1", "boolean"],
    ["boolean2", "boolean"],       
  ];  

  for(var i=0;i<50;i++)
  {
    dps.push(["num" + i, "number"])
  }

  for (const [name, type] of dps) {
    try {
      imeDB.DpCreate(name, type);
    } catch (error) {
      console.log(`Fehler bei DpCreate(${name}): ${error.message}`);
    }
  }  
}

function Simulate()
{
  setInterval(() => {
    console.log('Callback every 1s');
    for(var i=0;i<50;i++)
    {
      var dp = "num" + i;
      imeDB.DpSet(dp, Math.random());
    }
   
  }, 1000);
}

//CreateSampleDatabase();

Simulate();