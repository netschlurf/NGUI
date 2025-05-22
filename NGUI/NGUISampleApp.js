const NGUI = require('./httpsrv/NGUI.js');
const { IME_Sqlite3DB } = require('./httpsrv/IME_DB');
const { IME_Datapoints } = require('./httpsrv/IME_Datapoints');

//const FaktenServer = require('./FaktenServer.js');
const db = new IME_Sqlite3DB('NGUI.db');
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

function OnMyCounter(name, data)
{
    console.log(name, data);
}

var IMEDB = CheckDatabase();
const ngui = new NGUI(2808);
//const fSrv = new FaktenServer(ngui);

//ngui.RegisterHandler(fSrv);
ngui.start();

var counter = 0;
function Cyclic()
{
    db.DpSet("upTimeInS", counter);
    setTimeout(Cyclic,1000);
    counter++;
}

Cyclic()


