const IME_DBHandler = require('./IME_DBHandler');

describe('IME_DBHandler', () => {
  let dbMock, handler, wsMock, sendResponseSpy;

  beforeEach(() => {
    dbMock = {
      DpGet: jest.fn(),
      DpSet: jest.fn(),
      DpConnect: jest.fn(),
      DpDisconnect: jest.fn(),
      DpCreate: jest.fn(),
      DpDelete: jest.fn(),
      DpNames: jest.fn(),
      DpTypes: jest.fn(),
      DpExists: jest.fn(),
      DpTypeExists: jest.fn(),
      DpRename: jest.fn(),
    };
    handler = new IME_DBHandler(dbMock);
    wsMock = {};
    sendResponseSpy = jest.spyOn(handler, 'sendResponse').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('OnHandle', () => {
    it('should dispatch to the correct command handler and return true', () => {
      const msg = { cmd: 'DpGet', args: { dpName: 'foo' } };
      handler.DpGet = jest.fn();
      expect(handler.OnHandle(wsMock, msg)).toBe(true);
      expect(handler.DpGet).toHaveBeenCalledWith(msg, wsMock);
    });

    it('should return false for unknown command', () => {
      const msg = { cmd: 'UnknownCmd' };
      expect(handler.OnHandle(wsMock, msg)).toBe(false);
    });
  });

  describe('DpGet', () => {
    it('should call db.DpGet and send response', () => {
      dbMock.DpGet.mockReturnValue(42);
      const msg = { cmd: 'DpGet', args: { dpName: 'foo' } };
      handler.DpGet(msg, wsMock);
      expect(dbMock.DpGet).toHaveBeenCalledWith('foo');
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, { cmd: 'DpGet', dpName: 'foo', value: 42 });
    });

    it('should handle missing dpName', () => {
      const msg = { cmd: 'DpGet', args: {} };
      handler.DpGet(msg, wsMock);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, null, { cmd: 'DpGet', dpName: undefined, rc: 300 });
    });

    it('should handle db error', () => {
      dbMock.DpGet.mockImplementation(() => { throw new Error('fail'); });
      const msg = { cmd: 'DpGet', args: { dpName: 'foo' } };
      handler.DpGet(msg, wsMock);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, null, 'Error getting data point');
    });
  });

  describe('DpSet', () => {
    it('should call db.DpSet and send response', () => {
      const msg = { cmd: 'DpSet', args: { dpName: 'foo', value: 123 } };
      handler.DpSet(msg, wsMock);
      expect(dbMock.DpSet).toHaveBeenCalledWith('foo', 123);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, { cmd: 'DpSet', dpName: 'foo', rc: 200 });
    });

    it('should handle missing args', () => {
      const msg = { cmd: 'DpSet', args: { dpName: 'foo' } };
      handler.DpSet(msg, wsMock);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, null, { cmd: 'DpSet', dpName: 'foo', msg: 'missing args', rc: 300 });
    });

    it('should handle db error', () => {
      dbMock.DpSet.mockImplementation(() => { throw new Error('fail'); });
      const msg = { cmd: 'DpSet', args: { dpName: 'foo', value: 1 } };
      handler.DpSet(msg, wsMock);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, null, { cmd: 'DpSet', dpName: 'foo', msg: 'internal error', rc: 400 });
    });
  });

  describe('DpExists', () => {
    it('should call db.DpExists and send response', () => {
      dbMock.DpExists.mockReturnValue(true);
      const msg = { cmd: 'DpExists', args: { dpName: 'foo ' } };
      handler.DpExists(msg, wsMock);
      expect(dbMock.DpExists).toHaveBeenCalledWith('foo');
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, { cmd: 'DpExists', dpName: 'foo', exists: true, rc: 200 });
    });

    it('should handle missing dpName', () => {
      const msg = { cmd: 'DpExists', args: {} };
      handler.DpExists(msg, wsMock);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, null, { cmd: 'DpExists', dpName: undefined, rc: 300 });
    });

    it('should handle db error', () => {
      dbMock.DpExists.mockImplementation(() => { throw new Error('fail'); });
      const msg = { cmd: 'DpExists', args: { dpName: 'foo' } };
      handler.DpExists(msg, wsMock);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, null, { cmd: 'DpExists', dpName: 'foo', rc: 400 });
    });
  });

  describe('DpTypeExists', () => {
    it('should call db.DpTypeExists and send response', () => {
      dbMock.DpTypeExists.mockReturnValue(true);
      const msg = { cmd: 'DpTypeExists', args: { type: 'myType' } };
      handler.DpTypeExists(msg, wsMock);
      expect(dbMock.DpTypeExists).toHaveBeenCalledWith('myType');
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, { cmd: 'DpTypeExists', type: 'myType', exists: true, rc: 200 });
    });

    it('should handle missing type', () => {
      const msg = { cmd: 'DpTypeExists', args: {} };
      handler.DpTypeExists(msg, wsMock);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, null, { cmd: 'DpTypeExists', type: null, rc: 300 });
    });

    it('should handle db error', () => {
      dbMock.DpTypeExists.mockImplementation(() => { throw new Error('fail'); });
      const msg = { cmd: 'DpTypeExists', args: { type: 'myType' } };
      handler.DpTypeExists(msg, wsMock);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, null, { cmd: 'DpTypeExists', type: 'myType', rc: 400 });
    });
  });

  describe('DpRename', () => {
    it('should call db.DpRename and send response', () => {
      dbMock.DpRename.mockReturnValue({ oldName: 'foo', newName: 'bar' });
      const msg = { cmd: 'DpRename', args: { dpName: 'foo', newName: 'bar' } };
      handler.DpRename(msg, wsMock);
      expect(dbMock.DpRename).toHaveBeenCalledWith('foo', 'bar');
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, { cmd: 'DpRename', oldName: 'foo', newName: 'bar', rc: 200 });
    });

    it('should handle missing args', () => {
      const msg = { cmd: 'DpRename', args: { dpName: 'foo' } };
      handler.DpRename(msg, wsMock);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, null, { cmd: 'DpRename', rc: 300 });
    });

    it('should handle db error', () => {
      dbMock.DpRename.mockImplementation(() => { throw new Error('fail'); });
      const msg = { cmd: 'DpRename', args: { dpName: 'foo', newName: 'bar' } };
      handler.DpRename(msg, wsMock);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, null, 'Error renaming datapoint');
    });
  });

  describe('DpConnect', () => {
    it('should add connection and call db.DpConnect if new', () => {
      dbMock.DpGet.mockReturnValue(5);
      dbMock.DpConnect.mockImplementation((dpName, cb) => {});
      const msg = { cmd: 'DpConnect', args: { dpName: 'foo' } };
      handler.DpConnect(msg, wsMock);
      expect(handler.DpConnectionMap.has('foo')).toBe(true);
      expect(dbMock.DpConnect).toHaveBeenCalledWith('foo', expect.any(Function));
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, { cmd: 'DpConnect', dpName: 'foo', value: 5, rc: 200 });
    });

    it('should handle missing dpName', () => {
      const msg = { cmd: 'DpConnect', args: {} };
      handler.DpConnect(msg, wsMock);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, null, { cmd: 'DpConnect', dpName: undefined, rc: 300 });
    });

    it('should handle db error', () => {
      dbMock.DpGet.mockImplementation(() => { throw new Error('fail'); });
      dbMock.DpConnect.mockImplementation(() => { throw new Error('fail'); });
      const msg = { cmd: 'DpConnect', args: { dpName: 'foo' } };
      handler.DpConnect(msg, wsMock);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, null, { cmd: 'DpConnect', dpName: 'foo', rc: 400 });
    });
  });

  describe('DpDisconnect', () => {
    it('should remove connection and call db.DpDisconnect if last', () => {
      dbMock.DpGet.mockReturnValue(7);
      dbMock.DpDisconnect.mockImplementation((dpName, cb) => cb());
      const msg = { cmd: 'DpDisconnect', args: { dpName: 'foo' } };
      handler.DpConnectionMap.set('foo', [{ msg, ws: wsMock }]);
      handler.DpDisconnect(msg, wsMock);
      expect(handler.DpConnectionMap.has('foo')).toBe(false);
      expect(dbMock.DpDisconnect).toHaveBeenCalledWith('foo', expect.any(Function));
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, { cmd: 'DpDisconnect', dpName: 'foo', value: 7, rc: 200 });
    });

    it('should handle missing dpName', () => {
      const msg = { cmd: 'DpDisconnect', args: {} };
      handler.DpDisconnect(msg, wsMock);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, null, { cmd: 'DpDisconnect', dpName: undefined, rc: 300 });
    });

    it('should handle db error', () => {
      dbMock.DpGet.mockReturnValue(1);
      dbMock.DpDisconnect.mockImplementation(() => { throw new Error('fail'); });
      const msg = { cmd: 'DpDisconnect', args: { dpName: 'foo' } };
      handler.DpConnectionMap.set('foo', [{ msg, ws: wsMock }]);
      handler.DpDisconnect(msg, wsMock);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, null, { cmd: 'DpDisconnect', dpName: 'foo', rc: 400 });
    });

    it('should send response if dpName not in map', () => {
      const msg = { cmd: 'DpDisconnect', args: { dpName: 'foo' } };
      handler.DpDisconnect(msg, wsMock);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, { cmd: 'DpDisconnect', dpName: 'foo', rc: 200 });
    });
  });

  describe('DpCreate', () => {
    it('should call db.DpCreate and send response', () => {
      dbMock.DpCreate.mockReturnValue({ name: 'foo', typeName: 'bar' });
      const msg = { cmd: 'DpCreate', args: { dpName: 'foo', type: 'bar' } };
      handler.DpCreate(msg, wsMock);
      expect(dbMock.DpCreate).toHaveBeenCalledWith('foo', 'bar');
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, { name: 'foo', type: 'bar' });
    });

    it('should handle missing args', () => {
      const msg = { cmd: 'DpCreate', args: { dpName: 'foo' } };
      handler.DpCreate(msg, wsMock);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, null, { cmd: 'DpCreate', dpName: 'foo', rc: 300 });
    });

    it('should handle db error', () => {
      dbMock.DpCreate.mockImplementation(() => { throw new Error('fail'); });
      const msg = { cmd: 'DpCreate', args: { dpName: 'foo', type: 'bar' } };
      handler.DpCreate(msg, wsMock);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, null, 'Error creating data point');
    });
  });

  describe('DpDelete', () => {
    it('should call db.DpDelete and send response', () => {
      dbMock.DpDelete.mockReturnValue({ name: 'foo' });
      const msg = { cmd: 'DpDelete', args: { dpName: 'foo', type: 'bar' } };
      handler.DpDelete(msg, wsMock);
      expect(dbMock.DpDelete).toHaveBeenCalledWith('foo');
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, { name: 'foo' });
    });

    it('should handle missing args', () => {
      const msg = { cmd: 'DpDelete', args: { dpName: 'foo' } };
      handler.DpDelete(msg, wsMock);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, null, { cmd: 'DpDelete', dpName: 'foo', rc: 300 });
    });

    it('should handle db error', () => {
      dbMock.DpDelete.mockImplementation(() => { throw new Error('fail'); });
      const msg = { cmd: 'DpDelete', args: { dpName: 'foo', type: 'bar' } };
      handler.DpDelete(msg, wsMock);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, null, 'Error creating data point');
    });
  });

  describe('DpNames', () => {
    it('should call db.DpNames and send response', () => {
      dbMock.DpNames.mockReturnValue(['foo', 'bar']);
      const msg = { cmd: 'DpNames', args: { typeName: 't', pattern: 'p*' } };
      handler.DpNames(msg, wsMock);
      expect(dbMock.DpNames).toHaveBeenCalledWith('t', 'p*');
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, { cmd: 'DpNames', names: ['foo', 'bar'], rc: 200 });
    });

    it('should handle db error', () => {
      dbMock.DpNames.mockImplementation(() => { throw new Error('fail'); });
      const msg = { cmd: 'DpNames', args: {} };
      handler.DpNames(msg, wsMock);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, null, 'Error getting data point names');
    });
  });

  describe('DpTypes', () => {
    it('should call db.DpTypes and send response', () => {
      dbMock.DpTypes.mockReturnValue(['t1', 't2']);
      const msg = { cmd: 'DpTypes', args: { pattern: 't*' } };
      handler.DpTypes(msg, wsMock);
      expect(dbMock.DpTypes).toHaveBeenCalledWith('t*');
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, { cmd: 'DpTypes', types: ['t1', 't2'], rc: 200 });
    });

    it('should handle db error', () => {
      dbMock.DpTypes.mockImplementation(() => { throw new Error('fail'); });
      const msg = { cmd: 'DpTypes', args: {} };
      handler.DpTypes(msg, wsMock);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, null, 'Error getting data point types');
    });
  });

  describe('OnWebsocketClosed', () => {
    it('should remove ws from all DpConnectionMap entries and call db.DpDisconnect if none left', () => {
      const ws1 = {};
      const ws2 = {};
      dbMock.DpDisconnect.mockImplementation((dpName, cb) => cb && cb());
      handler.DpConnectionMap.set('foo', [{ msg: {}, ws: ws1 }, { msg: {}, ws: ws2 }]);
      handler.OnWebsocketClosed(ws1);
      expect(handler.DpConnectionMap.get('foo')).toEqual([{ msg: {}, ws: ws2 }]);
      handler.OnWebsocketClosed(ws2);
      expect(handler.DpConnectionMap.has('foo')).toBe(false);
      expect(dbMock.DpDisconnect).toHaveBeenCalledWith('foo', expect.any(Function));
    });

    it('should handle errors gracefully', () => {
      handler.DpConnectionMap.set('foo', [{ msg: {}, ws: wsMock }]);
      dbMock.DpDisconnect.mockImplementation(() => { throw new Error('fail'); });
      expect(() => handler.OnWebsocketClosed(wsMock)).not.toThrow();
    });
  });

  describe('OnDpConnect', () => {
    it('should send response to all callbacks', () => {
      const callBacks = [
        { msg: { cmd: 'DpConnect' }, ws: wsMock },
        { msg: { cmd: 'DpConnect' }, ws: wsMock }
      ];
      handler.OnDpConnect('foo', 123, callBacks);
      expect(sendResponseSpy).toHaveBeenCalledTimes(2);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, callBacks[0].msg, { data: { cmd: 'DpConnect', dpName: 'foo', value: 123 } });
    });
  });
});