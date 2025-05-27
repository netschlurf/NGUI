const NGUI = require('./httpsrv/NGUI.js');
const { IME_Sqlite3DB } = require('./httpsrv/IME_DB');
const IME_DBHandler = require('./httpsrv/IME_DBHandler');

const imeDB = new IME_Sqlite3DB('NGUI.db');
imeDB.Connect();
const ngui = new NGUI(2808);
const dbHandler = new IME_DBHandler(imeDB);

ngui.registerHandler(dbHandler);
ngui.start();

var counter = 0;
function Cyclic()
{
    //imeDB.DpSet("myCounter", counter);
    //var test = imeDB.DpGet("myCounter");
    setTimeout(Cyclic,10000);
    counter++;
}

Cyclic()



/*
const { IME_Datapoints } = require('./httpsrv/IME_Datapoints');

function OnMyCounter(name, data)
{
    console.log(name, data);
}

function CheckDatabase()
{
    
    const datapoints = new IME_Datapoints();
    db.Connect();
    
    var types = datapoints.GetDptypes();
    for (var i = 0; i < types.length; i++) {
        try {
            db.DpTypeCreate(JSON.stringify(types[i]));
        }
        catch (err) {

        }            
    }; 

     
    try {
        var newUser = db.DpCreate("netschlurf", "UserProfile");
        newUser.name = "netschlurf";
        newUser.email = "netschlurf@gmail.com";
        db.DpSet("netschlurf", newUser);
    } catch (error) {
        console.info("netschlurf already exists");
    }   
    
    try {
        var myCounter = db.DpCreate("upTimeInS", "number")
        var myCounter = db.DpCreate("myCounter", "number") 
        var myString = db.DpCreate("myString", "string")
    }
    catch (error) {
        //console.info("Error creating or setting user:");
    }  

    db.DpConnect("upTimeInS", OnMyCounter)

    db.DpSet("myCounter", 2);
    db.DpSet("myString", "oasch");

    var tmp1 = db.DpGet("myCounter"); 
    var tmp2 = db.DpGet("myString"); 
   
    return db;
}

*/

