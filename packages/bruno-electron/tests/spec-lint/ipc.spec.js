const os = require('os');
const fs = require('fs');
const path = require('path');
const handlers = {};
jest.mock('electron', () => ({ ipcMain: { handle: (name, fn) => { handlers[name] = fn; } } }));
const { registerSpecLintIpc } = require('../../src/ipc/spec-lint');
registerSpecLintIpc();

const call = (name, args) => handlers[name]({}, args);
const demo = path.join(__dirname, 'fixtures/demo-user-api.yml');
let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-')); });

test('missing bindings file reads as empty', async () => {
  expect(await call('renderer:spec-lint-read-bindings', { collectionPath: dir })).toEqual({ data: { specs: [], bindings: {} } });
});
test('invalid bindings file is an error, not a throw', async () => {
  fs.writeFileSync(path.join(dir, 'spec-bindings.json'), '{oops');
  expect(await call('renderer:spec-lint-read-bindings', { collectionPath: dir })).toEqual({ error: 'spec-bindings.json is not valid JSON' });
});
test('update applies the operation to the file on disk and returns the new data', async () => {
  fs.writeFileSync(path.join(dir, 'spec-bindings.json'), JSON.stringify({ specs: [], bindings: { 'other.yml': { spec: 's', method: 'GET', path: '/x' } } }));
  const result = await call('renderer:spec-lint-update-bindings', { collectionPath: dir, op: { type: 'addSpec', storedPath: '../s.yaml' } });
  expect(result).toEqual({ data: { specs: ['../s.yaml'], bindings: { 'other.yml': { spec: 's', method: 'GET', path: '/x' } } } });
  expect(JSON.parse(fs.readFileSync(path.join(dir, 'spec-bindings.json'), 'utf8'))).toEqual(result.data);
});
test('update reports an error instead of throwing', async () => {
  expect((await call('renderer:spec-lint-update-bindings', { collectionPath: dir, op: { type: 'bogus' } })).error).toEqual(expect.any(String));
  expect((await call('renderer:spec-lint-update-bindings', {})).error).toEqual(expect.any(String));
});
test('there is no raw write channel any more', () => {
  expect(handlers['renderer:spec-lint-write-bindings']).toBeUndefined();
});
test('stored path is relative and flags only .yml files inside yml collections (data-safety-ipc F8, design-and-ux F5)', async () => {
  const stored = (absolutePath) => call('renderer:spec-lint-to-stored-path', { collectionPath: dir, absolutePath });
  // A bru collection reads no .yml as a request.
  expect(await stored(path.join(dir, 'specs', 'a.yml'))).toEqual({ storedPath: 'specs/a.yml', insideYmlCollection: false });
  fs.writeFileSync(path.join(dir, 'opencollection.yml'), 'opencollection: 1.0.0');
  expect(await stored(path.join(dir, 'specs', 'a.yml'))).toEqual({ storedPath: 'specs/a.yml', insideYmlCollection: true });
  expect((await stored(path.join(dir, 'specs', 'A.YML'))).insideYmlCollection).toBe(true);
  expect((await stored(path.join(dir, 'specs', 'a.yaml'))).insideYmlCollection).toBe(false);
  expect((await stored(path.join(dir, 'specs', 'a.json'))).insideYmlCollection).toBe(false);
  expect(await stored(path.join(dir, '..', 'x.yml'))).toMatchObject({ storedPath: '../x.yml', insideYmlCollection: false });
});
test('summary, lint and describe work end to end', async () => {
  const specPath = path.relative(dir, demo);
  const s = await call('renderer:spec-lint-spec-summary', { collectionPath: dir, specPath });
  expect(s).toMatchObject({ ok: true, title: 'Demo User API', version: '3.0' });
  const l = await call('renderer:spec-lint-lint', { collectionPath: dir, specPath, method: 'POST', path: '/users', text: '{"name":"Bob"}' });
  expect(l.errors).toEqual([{ from: 0, to: 1, message: 'Spec requires: email, role' }]);
  const d = await call('renderer:spec-lint-describe', { collectionPath: dir, specPath, method: 'POST', path: '/users', text: '{"role":"x"}', offset: 2 });
  expect(d.info).toMatchObject({ path: 'role', required: true });
});
test('lint against a missing spec or missing operation returns missing', async () => {
  expect(await call('renderer:spec-lint-lint', { collectionPath: dir, specPath: 'nope.yaml', method: 'POST', path: '/users', text: '{}' })).toEqual({ missing: true });
  expect(await call('renderer:spec-lint-lint', { collectionPath: dir, specPath: path.relative(dir, demo), method: 'POST', path: '/gone', text: '{}' })).toEqual({ missing: true });
});
test('summary of a Swagger 2.0 file reports the load error', async () => {
  fs.writeFileSync(path.join(dir, 'old.yaml'), 'swagger: "2.0"\npaths: {}\n');
  expect(await call('renderer:spec-lint-spec-summary', { collectionPath: dir, specPath: 'old.yaml' }))
    .toEqual({ ok: false, error: 'Swagger 2.0 is not supported. Use an OpenAPI 3.x spec.' });
});
test('url-differs answers for the bar', async () => {
  expect(await call('renderer:spec-lint-url-differs', { requestUrl: '{{SVC_D}}/v2/limit', specOperationPath: '/v3/limit' })).toEqual({ differs: true });
});
