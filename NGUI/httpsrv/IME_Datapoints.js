const UserProfile = {
  dpTypeName: "UserProfile",
  dpType: "complex",
  children: [
    {
      dpTypeName: "name",
      dpType: "string"
    },
    {
      dpTypeName: "email",
      dpType: "string"
    },
    {
      dpTypeName: "address",
      dpType: "complex",
      children: [
        {
          dpTypeName: "street",
          dpType: "string"
        },
        {
          dpTypeName: "city",
          dpType: "string"
        },
        {
          dpTypeName: "zipCode",
          dpType: "string"
        },
        {
          dpTypeName: "country",
          dpType: "string"
        }
      ]
    },
    {
      dpTypeName: "preferences",
      dpType: "complex",
      children: [
        {
          dpTypeName: "theme",
          dpType: "string"
        },
        {
          dpTypeName: "receiveNotifications",
          dpType: "boolean"
        }
      ]
    }
  ]
};

const NumberType = {
  dpTypeName: 'number',
  dpType: 'number'
};

const StringType = {
  dpTypeName: 'string',
  dpType: 'string'
};

class IME_Datapoints 
{
  constructor() {
    this.dptypes = [];
    this.dptypes.push(UserProfile);
    this.dptypes.push(NumberType);
    this.dptypes.push(StringType);
  }

  GetDptypes() 
  {
    return this.dptypes;
  }
}

module.exports = { IME_Datapoints };
