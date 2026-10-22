const os = require('os');
const fs = require('fs');
const path = require('path');
const { readBindingsFile, writeBindingsFile, updateBindingsFile } = require('../../src/utils/spec-lint/bindings-file');

const binding = { spec: 'specs/example-a.yaml', method: 'POST', path: '/v3/limit' };
let dir;
let file;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-bf-'));
  file = path.join(dir, 'spec-bindings.json');
});

describe('readBindingsFile', () => {
  test('missing file reads as empty', () => {
    expect(readBindingsFile(dir)).toEqual({ data: { specs: [], bindings: {} } });
  });

  test('strips a UTF-8 byte order mark', () => {
    fs.writeFileSync(file, '﻿{"specs":["a.yml"],"bindings":{}}');
    expect(readBindingsFile(dir)).toEqual({ data: { specs: ['a.yml'], bindings: {} } });
  });

  test('keeps unknown top-level keys', () => {
    fs.writeFileSync(file, JSON.stringify({ $comment: 'owner: team A', specs: [], bindings: {} }));
    expect(readBindingsFile(dir).data).toEqual({ $comment: 'owner: team A', specs: [], bindings: {} });
  });

  test.each([
    ['specs is a string', { specs: '../example-a.yaml', bindings: {} }],
    ['specs holds a non-string', { specs: ['a', 1], bindings: {} }],
    ['bindings is an array', { specs: [], bindings: [] }],
    ['bindings is null', { specs: [], bindings: null }],
    ['the root is an array', []],
    ['the root is a string', 'x']
  ])('reports an error when %s', (name, content) => {
    fs.writeFileSync(file, JSON.stringify(content));
    const result = readBindingsFile(dir);
    expect(result.data).toBeUndefined();
    expect(result.error).toMatch(/^spec-bindings\.json /);
  });

  test('missing specs or bindings default to empty', () => {
    fs.writeFileSync(file, '{}');
    expect(readBindingsFile(dir)).toEqual({ data: { specs: [], bindings: {} } });
  });

  test('invalid JSON is an error', () => {
    fs.writeFileSync(file, '{oops');
    expect(readBindingsFile(dir)).toEqual({ error: 'spec-bindings.json is not valid JSON' });
  });
});

describe('writeBindingsFile', () => {
  test('writes formatted JSON and leaves no temp file', () => {
    const data = { specs: ['a'], bindings: {} };
    expect(writeBindingsFile(dir, data)).toEqual({ ok: true });
    expect(fs.readFileSync(file, 'utf8')).toBe(JSON.stringify(data, null, 2) + '\n');
    expect(fs.readdirSync(dir)).toEqual(['spec-bindings.json']);
  });

  test.each([
    ['undefined', undefined],
    ['null', null],
    ['an array', []],
    ['a string', 'x'],
    ['specs of the wrong type', { specs: {}, bindings: {} }],
    ['bindings of the wrong type', { specs: [], bindings: [] }]
  ])('refuses %s and leaves the file alone', (name, data) => {
    fs.writeFileSync(file, 'original');
    expect(writeBindingsFile(dir, data)).toEqual({ error: expect.stringMatching(/^spec-bindings\.json /) });
    expect(fs.readFileSync(file, 'utf8')).toBe('original');
    expect(fs.readdirSync(dir)).toEqual(['spec-bindings.json']);
  });

  test('a failed write keeps the old file and removes the temp file', () => {
    fs.writeFileSync(file, 'original');
    const spy = jest.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('disk gone');
    });
    try {
      expect(writeBindingsFile(dir, { specs: [], bindings: {} })).toEqual({ error: 'disk gone' });
    } finally {
      spy.mockRestore();
    }
    expect(fs.readFileSync(file, 'utf8')).toBe('original');
    expect(fs.readdirSync(dir)).toEqual(['spec-bindings.json']);
  });

  test('never truncates the target before the rename', () => {
    fs.writeFileSync(file, 'original');
    const seen = [];
    const real = fs.renameSync;
    const spy = jest.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      seen.push(fs.readFileSync(to, 'utf8'));
      return real(from, to);
    });
    try {
      writeBindingsFile(dir, { specs: [], bindings: {} });
    } finally {
      spy.mockRestore();
    }
    expect(seen).toEqual(['original']);
  });
});

describe('updateBindingsFile', () => {
  test('applies the change to the data on disk, not to a stale copy', () => {
    fs.writeFileSync(file, JSON.stringify({ specs: ['s.yaml'], bindings: { 'teammate.yml': binding } }));
    const result = updateBindingsFile(dir, { type: 'setBinding', key: 'mine.yml', binding });
    expect(result.data.bindings).toEqual({ 'teammate.yml': binding, 'mine.yml': binding });
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(result.data);
  });

  test('preserves unknown top-level keys', () => {
    fs.writeFileSync(file, JSON.stringify({ $comment: 'keep me', specs: [], bindings: {} }));
    updateBindingsFile(dir, { type: 'addSpec', storedPath: 's.yaml' });
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ $comment: 'keep me', specs: ['s.yaml'], bindings: {} });
  });

  test('creates the file when it does not exist', () => {
    expect(updateBindingsFile(dir, { type: 'addSpec', storedPath: 's.yaml' })).toEqual({ data: { specs: ['s.yaml'], bindings: {} } });
  });

  test('addSpec does not add the same spec twice', () => {
    updateBindingsFile(dir, { type: 'addSpec', storedPath: 's.yaml' });
    expect(updateBindingsFile(dir, { type: 'addSpec', storedPath: 's.yaml' }).data.specs).toEqual(['s.yaml']);
  });

  test('setBinding with null unbinds', () => {
    updateBindingsFile(dir, { type: 'setBinding', key: 'a.yml', binding });
    expect(updateBindingsFile(dir, { type: 'setBinding', key: 'a.yml', binding: null }).data.bindings).toEqual({});
  });

  test('removeSpec removes the spec and its bindings, keeps others, skips malformed entries without throwing', () => {
    fs.writeFileSync(file, JSON.stringify({
      specs: ['s.yaml', 't.yaml'],
      bindings: {
        'a.yml': { spec: 's.yaml', method: 'GET', path: '/a' },
        'b.yml': { spec: 't.yaml', method: 'GET', path: '/b' },
        'null.yml': null,
        'nospec.yml': { method: 'GET', path: '/c' }
      }
    }));
    const result = updateBindingsFile(dir, { type: 'removeSpec', storedPath: 's.yaml' });
    expect(result.data.specs).toEqual(['t.yaml']);
    expect(Object.keys(result.data.bindings).sort()).toEqual(['b.yml', 'nospec.yml', 'null.yml']);
  });

  test('replaceSpec points the spec and every binding that used it at the new file (data-safety-ipc F2, design-and-ux F3)', () => {
    fs.writeFileSync(file, JSON.stringify({
      note: 'kept',
      specs: ['x.yaml', 'LM_241.yaml', 'y.yaml'],
      bindings: {
        'a.yml': { spec: 'LM_241.yaml', method: 'POST', path: '/v3/limit' },
        'b.yml': { spec: 'y.yaml', method: 'GET', path: '/b' },
        'c.yml': { spec: 'LM_241.yaml', method: 'GET', path: '/c' },
        'null.yml': null
      }
    }));
    const result = updateBindingsFile(dir, { type: 'replaceSpec', storedPath: 'LM_241.yaml', newStoredPath: 'LM_242.yaml' });
    expect(result.data.specs).toEqual(['x.yaml', 'LM_242.yaml', 'y.yaml']);
    expect(result.data.bindings).toEqual({
      'a.yml': { spec: 'LM_242.yaml', method: 'POST', path: '/v3/limit' },
      'b.yml': { spec: 'y.yaml', method: 'GET', path: '/b' },
      'c.yml': { spec: 'LM_242.yaml', method: 'GET', path: '/c' },
      'null.yml': null
    });
    expect(result.data.note).toBe('kept');
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(result.data);
  });

  test('replaceSpec onto a spec that is already registered keeps it once', () => {
    fs.writeFileSync(file, JSON.stringify({ specs: ['a.yaml', 'b.yaml'], bindings: { 'r.yml': { spec: 'a.yaml', method: 'GET', path: '/a' } } }));
    const result = updateBindingsFile(dir, { type: 'replaceSpec', storedPath: 'a.yaml', newStoredPath: 'b.yaml' });
    expect(result.data.specs).toEqual(['b.yaml']);
    expect(result.data.bindings['r.yml'].spec).toBe('b.yaml');
  });

  test('refuses to write while the file is unreadable', () => {
    fs.writeFileSync(file, '{oops');
    expect(updateBindingsFile(dir, { type: 'addSpec', storedPath: 's.yaml' })).toEqual({ error: 'spec-bindings.json is not valid JSON' });
    expect(fs.readFileSync(file, 'utf8')).toBe('{oops');
  });

  test('refuses to write when specs has the wrong type', () => {
    fs.writeFileSync(file, JSON.stringify({ specs: '../example-a.yaml', bindings: {} }));
    const before = fs.readFileSync(file, 'utf8');
    expect(updateBindingsFile(dir, { type: 'addSpec', storedPath: 's.yaml' }).error).toMatch(/^spec-bindings\.json /);
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });

  test.each([
    ['unknown type', { type: 'nope' }],
    ['no op', undefined],
    ['setBinding without a key', { type: 'setBinding', binding }],
    ['setBinding with a malformed binding', { type: 'setBinding', key: 'a.yml', binding: { method: 'GET' } }],
    ['addSpec without a path', { type: 'addSpec' }],
    ['removeSpec with a non-string path', { type: 'removeSpec', storedPath: 3 }],
    ['replaceSpec without a new path', { type: 'replaceSpec', storedPath: 'a.yaml' }]
  ])('rejects %s without touching the file', (name, op) => {
    expect(updateBindingsFile(dir, op).error).toEqual(expect.any(String));
    expect(fs.existsSync(file)).toBe(false);
  });
});
