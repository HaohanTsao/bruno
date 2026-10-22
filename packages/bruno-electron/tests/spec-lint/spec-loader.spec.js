const fs = require('fs');
const path = require('path');
const { loadSpec } = require('../../src/utils/spec-lint/spec-loader');

const demo = fs.readFileSync(path.join(__dirname, 'fixtures/demo-user-api.yml'), 'utf8');

it('loads the demo spec and lists operations', () => {
  const r = loadSpec(demo);
  expect(r.ok).toBe(true);
  expect(r.version).toBe('3.0');
  expect(r.title).toBe('Demo User API');
  expect(r.specVersion).toBe('1.0.0');
  expect(r.operations).toEqual([
    { method: 'GET', path: '/users', summary: '' },
    { method: 'POST', path: '/users', summary: '' },
    { method: 'GET', path: '/users/{id}', summary: '' }
  ]);
});
it('accepts JSON text and 3.1', () => {
  expect(loadSpec(JSON.stringify({ openapi: '3.1.0', info: { title: 'T', version: '1' }, paths: {} })).version).toBe('3.1');
});
it('rejects Swagger 2.0 with a clear message', () => {
  expect(loadSpec('swagger: "2.0"\npaths: {}')).toEqual({ ok: false, error: 'Swagger 2.0 is not supported. Use an OpenAPI 3.x spec.' });
});
it('reports YAML syntax errors', () => {
  const r = loadSpec('openapi: 3.0.0\npaths: [');
  expect(r.ok).toBe(false);
  expect(r.error).toMatch(/^Could not parse spec: /);
});
it('rejects documents that are not OpenAPI 3.x', () => {
  expect(loadSpec('foo: bar')).toEqual({ ok: false, error: 'Not an OpenAPI 3.x spec (missing "openapi: 3.x").' });
});

const DIR = process.env.SPEC_LINT_REAL_SPECS;
(DIR ? describe : describe.skip)('real specs', () => {
  it('loads every real spec', () => {
    for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.yaml'))) {
      const t0 = Date.now();
      const r = loadSpec(fs.readFileSync(path.join(DIR, f), 'utf8'));
      console.log(f, r.ok && r.operations.length, `${Date.now() - t0} ms`);
      expect(r.ok).toBe(true);
      expect(r.operations.length).toBeGreaterThan(0);
    }
  });
});

it('keeps unquoted YAML dates as strings (F7)', () => {
  const r = loadSpec('openapi: 3.0.0\nx-d: 2020-01-01\nx-list: [2020-01-01, 2021-06-30]\nx-yes: yes\n');
  expect(r.ok).toBe(true);
  expect(r.spec['x-d']).toBe('2020-01-01');
  expect(r.spec['x-list']).toEqual(['2020-01-01', '2021-06-30']);
  expect(r.spec['x-yes']).toBe('yes');
});
it('still resolves YAML merge keys', () => {
  const r = loadSpec('openapi: 3.0.0\nx-a: &a {p: 1}\nx-b:\n  <<: *a\n  q: 2\n');
  expect(r.spec['x-b']).toEqual({ p: 1, q: 2 });
});
