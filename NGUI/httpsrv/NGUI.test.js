const NGUI = require('./NGUI');
const path = require('path');
const fs = require('fs').promises;

// Unterdrücke console.error-Ausgaben in allen Tests:
jest.spyOn(console, 'error').mockImplementation(() => {});

jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    writeFile: jest.fn(),
    copyFile: jest.fn(),
  }
}));

describe('NGUI PutResource', () => {
  let ngui;
  let ws;
  let sendResponseMock;
  let resolveAppRootMock;

  beforeEach(() => {
    ngui = new NGUI();
    ws = {};
    sendResponseMock = jest.spyOn(ngui, 'sendResponse').mockImplementation(() => {});
    resolveAppRootMock = jest.spyOn(ngui, 'resolveAppRoot').mockResolvedValue('/mock/htdocs');
    jest.clearAllMocks();
  });

  it('should return 400 if args missing', async () => {
    await ngui.PutResource({}, ws);
    expect(sendResponseMock).toHaveBeenCalledWith(ws, {}, '', '400: Missing fileName or content');
  });

  it('should return 400 if fileName is invalid (path traversal)', async () => {
    const msg = { args: { fileName: '../evil.txt', content: 'abc' } };
    await ngui.PutResource(msg, ws);
    expect(sendResponseMock).toHaveBeenCalledWith(ws, msg, '', '400: Invalid fileName');
  });

  it('should save new file if it does not exist', async () => {
    const msg = { args: { fileName: 'test.txt', content: 'abc' } };
    fs.access.mockRejectedValueOnce(new Error('not found'));
    fs.writeFile.mockResolvedValueOnce();
    await ngui.PutResource(msg, ws);
    expect(fs.writeFile).toHaveBeenCalledWith(path.join('/mock/htdocs', 'test.txt'), 'abc', 'utf8');
    expect(sendResponseMock).toHaveBeenCalledWith(ws, msg, { status: 'File saved', rc: 200 });
  });

  it('should update file and create backup if file exists', async () => {
    const msg = { args: { fileName: 'test.txt', content: 'abc' } };
    fs.access.mockResolvedValueOnce();
    fs.copyFile.mockResolvedValueOnce();
    fs.writeFile.mockResolvedValueOnce();
    await ngui.PutResource(msg, ws);
    expect(fs.copyFile).toHaveBeenCalledWith(path.join('/mock/htdocs', 'test.txt'), path.join('/mock/htdocs', 'test.txt') + '_BACKUP');
    expect(fs.writeFile).toHaveBeenCalledWith(path.join('/mock/htdocs', 'test.txt'), 'abc', 'utf8');
    expect(sendResponseMock).toHaveBeenCalledWith(ws, msg, { status: 'File updated', rc: 200 });
  });

  it('should handle writeFile error when saving new file', async () => {
    const msg = { args: { fileName: 'test.txt', content: 'abc' } };
    fs.access.mockRejectedValueOnce(new Error('not found'));
    fs.writeFile.mockRejectedValueOnce(new Error('disk full'));
    await ngui.PutResource(msg, ws);
    expect(sendResponseMock).toHaveBeenCalledWith(ws, msg, '', '500: disk full');
  });

  it('should handle writeFile error when updating file', async () => {
    const msg = { args: { fileName: 'test.txt', content: 'abc' } };
    fs.access.mockResolvedValueOnce();
    fs.copyFile.mockResolvedValueOnce();
    fs.writeFile.mockRejectedValueOnce(new Error('permission denied'));
    await ngui.PutResource(msg, ws);
    expect(sendResponseMock).toHaveBeenCalledWith(ws, msg, '', '500: permission denied');
  });
});