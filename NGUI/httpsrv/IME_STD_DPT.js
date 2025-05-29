class IME_STD_DPT 
{
  constructor()
  {
    this.DPT_SampleDeviceStructure = {
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

    this.DPT_User = {
      name: "User",
      type: "struct",
      children: [
        { name: "firstName", type: "string" },
        { name: "lastName", type: "string" },
        { name: "email", type: "string" },
        { name: "username", type: "string" },
        { name: "password", type: "string" },
      ]
    };    
  }

  GetDPT_SampleDeviceStructure() { return this.DPT_SampleDeviceStructure; }
  GetDPT_User() { return this.DPT_User; }
}

module.exports = IME_STD_DPT;
