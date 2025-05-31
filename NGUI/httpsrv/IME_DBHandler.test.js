const IME_DBHandler = require('./IME_DBHandler');

jest.spyOn(console, 'error').mockImplementation(() => {});

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
      handler.commandMap.DpGet = jest.fn();
      expect(handler.OnHandle(wsMock, msg)).toBe(true);
      expect(handler.commandMap.DpGet).toHaveBeenCalledWith(msg, wsMock);
    });

    it('should return false for unknown command', () => {
      const msg = { cmd: 'UnknownCmd' };
      expect(handler.OnHandle(wsMock, msg)).toBe(false);
    });
  });

  describe('DpGet', () => {
    it('should call db.DpGet and send response for single dpName', () => {
      dbMock.DpGet.mockReturnValue({ value: 42, tstamp: 123 });
      const msg = { cmd: 'DpGet', args: { dpName: 'foo' } };
      handler.DpGet(msg, wsMock);
      expect(dbMock.DpGet).toHaveBeenCalledWith('foo');
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, { cmd: 'DpGet', dpName: 'foo', value: { value: 42, tstamp: 123 }, rc: 200 });
    });

    it('should call db.DpGet and send response for array of dpNames', () => {
      dbMock.DpGet.mockReturnValue([{ value: 42, tstamp: 123 }, { value: 100, tstamp: 124 }]);
      const msg = { cmd: 'DpGet', args: { dpName: ['foo', 'bar'] } };
      handler.DpGet(msg, wsMock);
      expect(dbMock.DpGet).toHaveBeenCalledWith(['foo', 'bar']);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, [
        { cmd: 'DpGet', dpName: 'foo', value: { value: 42, tstamp: 123 }, rc: 200 },
        { cmd: 'DpGet', dpName: 'bar', value: { value: 100, tstamp: 124 }, rc: 200 }
      ]);
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
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, null, { cmd: 'DpGet', dpName: 'foo', msg: 'Error getting data point', rc: 400 });
    });
  });

  describe('DpSet', () => {
    it('should call db.DpSet and send response for single dpName', () => {
      const msg = { cmd: 'DpSet', args: { dpName: 'foo', value: 123 } };
      handler.DpSet(msg, wsMock);
      expect(dbMock.DpSet).toHaveBeenCalledWith('foo', 123);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, { cmd: 'DpSet', dpName: 'foo', rc: 200 });
    });

    it('should call db.DpSet and send response for array of dpNames', () => {
      const msg = { cmd: 'DpSet', args: { dpName: ['foo', 'bar'], value: [123, 456] } };
      handler.DpSet(msg, wsMock);
      expect(dbMock.DpSet).toHaveBeenCalledWith(['foo', 'bar'], [123, 456]);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, [
        { cmd: 'DpSet', dpName: 'foo', rc: 200 },
        { cmd: 'DpSet', dpName: 'bar', rc: 200 }
      ]);
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
    it('should add connection and call db.DpConnect if new for single dpName', () => {
      dbMock.DpGet.mockReturnValue({ value: 5, tstamp: 123 });
      dbMock.DpConnect.mockImplementation((dpName, cb) => {});
      const msg = { cmd: 'DpConnect', args: { dpName: 'foo' } };
      handler.DpConnect(msg, wsMock);
      expect(handler.DpConnectionMap.has('foo')).toBe(true);
      expect(dbMock.DpConnect).toHaveBeenCalledWith('foo', expect.any(Function));
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, { cmd: 'DpConnect', dpName: 'foo', value: { value: 5, tstamp: 123 }, rc: 200 });
    });

    it('should add connections and call db.DpConnect for array of dpNames', () => {
      dbMock.DpGet.mockReturnValue([{ value: 5, tstamp: 123 }, { value: 10, tstamp: 124 }]);
      dbMock.DpConnect.mockImplementation((dpName, cb) => {});
      const msg = { cmd: 'DpConnect', args: { dpName: ['foo', 'bar'] } };
      handler.DpConnect(msg, wsMock);
      expect(handler.DpConnectionMap.has('foo')).toBe(true);
      expect(handler.DpConnectionMap.has('bar')).toBe(true);
      expect(dbMock.DpConnect).toHaveBeenCalledWith(['foo', 'bar'], expect.any(Function));
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, [
        { cmd: 'DpConnect', dpName: 'foo', value: { value: 5, tstamp: 123 }, rc: 200 },
        { cmd: 'DpConnect', dpName: 'bar', value: { value: 10, tstamp: 124 }, rc: 200 }
      ]);
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
    it('should remove connection and call db.DpDisconnect if last for single dpName', () => {
      dbMock.DpGet.mockReturnValue({ value: 7, tstamp: 123 });
      dbMock.DpDisconnect.mockImplementation((dpName, cb) => cb && cb());
      const msg = { cmd: 'DpDisconnect', args: { dpName: 'foo' } };
      handler.DpConnectionMap.set('foo', [{ msg, ws: wsMock }]);
      handler.DpDisconnect(msg, wsMock);
      expect(handler.DpConnectionMap.has('foo')).toBe(false);
      expect(dbMock.DpDisconnect).toHaveBeenCalledWith('foo', expect.any(Function));
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, { cmd: 'DpDisconnect', dpName: 'foo', value: { value: 7, tstamp: 123 }, rc: 200 });
    });

    it('should remove connections and call db.DpDisconnect for array of dpNames', () => {
      dbMock.DpGet.mockReturnValue([{ value: 7, tstamp: 123 }, { value: 8, tstamp: 124 }]);
      dbMock.DpDisconnect.mockImplementation((dpName, cb) => cb && cb());
      const msg = { cmd: 'DpDisconnect', args: { dpName: ['foo', 'bar'] } };
      handler.DpConnectionMap.set('foo', [{ msg, ws: wsMock }]);
      handler.DpConnectionMap.set('bar', [{ msg, ws: wsMock }]);
      handler.DpDisconnect(msg, wsMock);
      expect(handler.DpConnectionMap.has('foo')).toBe(false);
      expect(handler.DpConnectionMap.has('bar')).toBe(false);
      expect(dbMock.DpDisconnect).toHaveBeenCalledWith(['foo', 'bar']);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, [
        { cmd: 'DpDisconnect', dpName: 'foo', value: { value: 7, tstamp: 123 }, rc: 200 },
        { cmd: 'DpDisconnect', dpName: 'bar', value: { value: 8, tstamp: 124 }, rc: 200 }
      ]);
    });

    it('should handle missing dpName', () => {
      const msg = { cmd: 'DpDisconnect', args: {} };
      handler.DpDisconnect(msg, wsMock);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, null, { cmd: 'DpDisconnect', dpName: undefined, rc: 300 });
    });

    it('should handle db error', () => {
      dbMock.DpGet.mockReturnValue({ value: 1, tstamp: 123 });
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
    it('should call db.DpCreate and send response for single dpName', () => {
      dbMock.DpCreate.mockReturnValue({ name: 'foo', typeName: 'bar' });
      const msg = { cmd: 'DpCreate', args: { dpName: 'foo', type: 'bar' } };
      handler.DpCreate(msg, wsMock);
      expect(dbMock.DpCreate).toHaveBeenCalledWith('foo', 'bar');
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, { name: 'foo', type: 'bar', rc: 200 });
    });

    it('should call db.DpCreate and send response for array of dpNames', () => {
      dbMock.DpCreate.mockReturnValue([{ name: 'foo', typeName: 'bar' }, { name: 'baz', typeName: 'bar' }]);
      const msg = { cmd: 'DpCreate', args: { dpName: ['foo', 'baz'], type: ['bar', 'bar'] } };
      handler.DpCreate(msg, wsMock);
      expect(dbMock.DpCreate).toHaveBeenCalledWith(['foo', 'baz'], ['bar', 'bar']);
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock, msg, [
        { name: 'foo', type: 'bar', rc: 200 },
        { name: 'baz', type: 'bar', rc: 200 }
      ]);
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
      expect(sendResponseSpy).toHaveBeenCalledWith(wsMock