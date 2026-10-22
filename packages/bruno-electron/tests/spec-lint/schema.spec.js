const fs = require('fs');
const path = require('path');
const { loadSpec } = require('../../src/utils/spec-lint/spec-loader');
const { getRequestSchema, toJsonSchema, findFieldSchema } = require('../../src/utils/spec-lint/schema');
const { validateValue } = require('../../src/utils/spec-lint/validate');

const { spec, version } = loadSpec(fs.readFileSync(path.join(__dirname, 'fixtures/demo-user-api.yml'), 'utf8'));

it('returns the dereferenced NewUser schema for POST /users, and the same object twice', () => {
  const s = getRequestSchema(spec, version, 'POST', '/users');
  expect(s.required).toEqual(['name', 'email', 'role']);
  expect(s.properties.role.enum).toEqual(['admin', 'editor', 'viewer']);
  expect(getRequestSchema(spec, version, 'POST', '/users')).toBe(s);
});
it('returns null when the operation has no JSON body or does not exist', () => {
  expect(getRequestSchema(spec, version, 'GET', '/users')).toBeNull();
  expect(getRequestSchema(spec, version, 'DELETE', '/nope')).toBeNull();
});
it('converts nullable and drops readOnly from required (3.0)', () => {
  const out = toJsonSchema({ type: 'object', required: ['id', 'a'], properties: { id: { type: 'integer', readOnly: true }, a: { type: 'string', nullable: true, example: 'x' } } }, '3.0');
  expect(out.required).toEqual(['a']);
  expect(out.properties.a).toEqual({ type: ['string', 'null'] });
});
it('emits only the structural keywords (F2)', () => {
  const out = toJsonSchema({
    '$id': 'https://example.com/x', '$schema': 'http://json-schema.org/draft-07/schema#', 'id': 'old', 'type': 'string', 'pattern': '^[a-z\\_]+$', 'format': 'email', 'minimum': 0, 'maxLength': 3, 'multipleOf': 0, 'examples': { a: 1 }, 'example': 'x', 'default': 'a', 'x-foo': 1, 'description': 'D', 'title': 'T'
  }, '3.0');
  expect(out).toEqual({ type: 'string', description: 'D', title: 'T' });
});
it('sanitizes type, enum and required (F2)', () => {
  expect(toJsonSchema({ type: 'int' }, '3.0')).toEqual({});
  expect(toJsonSchema({ type: ['string', 'file'] }, '3.0')).toEqual({});
  expect(toJsonSchema({ type: ['string', 'string', 'null'] }, '3.1')).toEqual({ type: ['string', 'null'] });
  expect(toJsonSchema({ enum: [] }, '3.0')).toEqual({});
  expect(toJsonSchema({ enum: 'a' }, '3.0')).toEqual({});
  expect(toJsonSchema({ enum: ['a', 'b', 'a', { x: 1, y: 2 }, { y: 2, x: 1 }] }, '3.0')).toEqual({ enum: ['a', 'b', { x: 1, y: 2 }] });
  expect(toJsonSchema({ type: 'object', properties: { a: { type: 'string', required: true } }, required: ['a', 'a', 5] }, '3.0'))
    .toEqual({ type: 'object', properties: { a: { type: 'string' } }, required: ['a'] });
  expect(toJsonSchema({ allOf: [], oneOf: [], anyOf: [] }, '3.0')).toEqual({});
});
it('does not let a bad keyword disable the other checks of the operation (F2)', () => {
  const s = {
    openapi: '3.0.0',
    paths: { '/x': { post: { requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: {
      name: { type: 'string', pattern: '^[A-Za-z0-9\\-\\_]+$', minimum: '0', maxLength: '10' },
      a: { type: 'int', enum: [] },
      b: { type: 'string', required: true, examples: { a: 1 }, enum: ['q', 'q'] }
    } } } } } } } }
  };
  const schema = getRequestSchema(s, '3.0', 'POST', '/x');
  expect(validateValue(schema, '3.0', { name: 1, b: 'z' })).toEqual([
    { kind: 'type', instancePath: '/name', expected: 'string', actual: 'integer' },
    { kind: 'enum', instancePath: '/b', allowed: ['q'] }
  ]);
});
it('drops numeric bounds and pattern, which the checker never reports', () => {
  expect(toJsonSchema({ type: 'number', minimum: 0, exclusiveMinimum: true, maximum: 9, exclusiveMaximum: false }, '3.0')).toEqual({ type: 'number' });
});
it('finds nested, array and allOf fields', () => {
  const s = { type: 'object', required: ['a'], properties: { a: { type: 'array', items: { allOf: [{ properties: { b: { type: 'integer', description: 'B' } } }, { required: ['b'] }] } } } };
  expect(findFieldSchema(s, ['a'])).toMatchObject({ required: true });
  expect(findFieldSchema(s, ['a', 0, 'b'])).toEqual({ schema: { type: 'integer', description: 'B' }, required: true });
  expect(findFieldSchema(s, ['a', 0, 'zzz'])).toBeNull();
});
it('uses the first oneOf branch that has the field', () => {
  const s = { oneOf: [{ properties: { x: { type: 'string' } } }, { properties: { y: { type: 'integer' } } }] };
  expect(findFieldSchema(s, ['y']).schema).toEqual({ type: 'integer' });
});

const makeSpec = (schemas, body, openapi = '3.0.3') => ({
  openapi,
  paths: { '/x': { post: { requestBody: { content: { 'application/json': { schema: body } } } } } },
  components: { schemas }
});
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const check = (spec, version, value, op = '/x') => validateValue(getRequestSchema(spec, version, 'POST', op), version, value);

describe('recursive refs (F1)', () => {
  it('validates mutual recursion without inlining it', () => {
    const spec = makeSpec({
      A: { type: 'object', required: ['b'], properties: { b: ref('B'), n: { type: 'integer' } } },
      B: { type: 'object', properties: { a: ref('A') } }
    }, ref('A'));
    expect(check(spec, '3.0', { b: { a: { n: 'x', b: {} } } })).toEqual([{ kind: 'type', instancePath: '/b/a/n', expected: 'integer', actual: 'string' }]);
    expect(check(spec, '3.0', { b: { a: { b: { a: {} } } } })).toEqual([{ kind: 'required', instancePath: '/b/a/b/a', missing: ['b'] }]);
  });
  it('stays small and fast when every schema references all the others', () => {
    const N = 14;
    const schemas = {};
    for (let i = 0; i < N; i++) {
      const properties = { v: { type: 'integer' } };
      for (let j = 0; j < N; j++) if (j !== i) properties[`s${j}`] = ref(`S${j}`);
      schemas[`S${i}`] = { type: 'object', properties };
    }
    for (const version of ['3.0', '3.1']) {
      const spec = makeSpec(schemas, ref('S0'), version === '3.1' ? '3.1.0' : '3.0.3');
      const t0 = Date.now();
      const schema = getRequestSchema(spec, version, 'POST', '/x');
      expect(JSON.stringify(schema).length).toBeLessThan(100000);
      expect(validateValue(schema, version, { s1: { s2: { s3: { v: 'x' } } } })).toEqual([{ kind: 'type', instancePath: '/s1/s2/s3/v', expected: 'integer', actual: 'string' }]);
      expect(Date.now() - t0).toBeLessThan(2000);
    }
  });
  it('uses local definitions refs for 3.0 and $defs for 3.1', () => {
    const schemas = { A: { type: 'object', properties: { a: { $ref: '#/components/schemas/A' } } } };
    const s30 = getRequestSchema(makeSpec(schemas, { type: 'object', properties: { p: ref('A') } }), '3.0', 'POST', '/x');
    expect(s30.properties.p.$ref).toBe('#/definitions/A');
    expect(Object.keys(s30.definitions)).toEqual(['A']);
    expect(s30.definitions.A.properties.a.$ref).toBe('#/definitions/A');
    const s31 = getRequestSchema(makeSpec(schemas, { type: 'object', properties: { p: ref('A') } }, '3.1.0'), '3.1', 'POST', '/x');
    expect(s31.properties.p.$ref).toBe('#/$defs/A');
    expect(Object.keys(s31.$defs)).toEqual(['A']);
  });
  it('returns null and warns once when the schema is beyond the node budget', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const wide = { type: 'object', properties: {} };
    for (let i = 0; i < 210000; i++) wide.properties[`p${i}`] = { type: 'string' };
    const spec = makeSpec({}, wide);
    expect(getRequestSchema(spec, '3.0', 'POST', '/x')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
  it('survives a ref that only points at itself', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const spec = makeSpec({ A: { allOf: [ref('A')] }, B: ref('B') }, { type: 'object', properties: { a: ref('A'), b: ref('B'), c: { type: 'integer' } } });
    expect(check(spec, '3.0', { c: 'x' })).toEqual(expect.any(Array));
    warn.mockRestore();
  });
  it('follows local refs in findFieldSchema and describes through them', () => {
    const spec = makeSpec({
      A: { type: 'object', required: ['n'], properties: { n: { $ref: '#/components/schemas/N' } } },
      N: { type: 'object', description: 'Node', properties: { next: ref('N'), a: ref('A') } }
    }, ref('A'));
    const schema = getRequestSchema(spec, '3.0', 'POST', '/x');
    expect(findFieldSchema(schema, ['n'])).toMatchObject({ required: true, schema: { type: 'object', description: 'Node' } });
    expect(findFieldSchema(schema, ['n', 'next', 'next', 'a', 'n'])).toMatchObject({ required: true });
    expect(findFieldSchema(schema, ['n', 'zzz'])).toBeNull();
  });
  it('does not loop on a oneOf that points back at itself', () => {
    const spec = makeSpec({ A: { oneOf: [ref('A'), { properties: { y: { type: 'integer' } } }] } }, ref('A'));
    const schema = getRequestSchema(spec, '3.0', 'POST', '/x');
    expect(findFieldSchema(schema, ['y']).schema).toEqual({ type: 'integer' });
    expect(findFieldSchema(schema, ['q'])).toBeNull();
  });
});

describe('Ajv instances (F3)', () => {
  const shared = { $id: 'https://example.com/schemas/user', type: 'object', required: ['name'], properties: { name: { type: 'string' } } };
  const twoOps = (schemas) => ({
    openapi: '3.0.3',
    paths: {
      '/a': { post: { requestBody: { content: { 'application/json': { schema: ref('U') } } } } },
      '/b': { put: { requestBody: { content: { 'application/json': { schema: ref('U') } } } } }
    },
    components: { schemas }
  });
  it('compiles two operations that share a component with an $id', () => {
    const spec = twoOps({ U: shared });
    const a = getRequestSchema(spec, '3.0', 'POST', '/a');
    const b = getRequestSchema(spec, '3.0', 'PUT', '/b');
    expect(validateValue(a, '3.0', { name: 1 })).toHaveLength(1);
    expect(validateValue(b, '3.0', { name: 1 })).toHaveLength(1);
    expect(JSON.stringify(a)).not.toMatch(/\$id|example\.com/);
  });
  it('still validates a freshly parsed copy of the same spec', () => {
    for (let i = 0; i < 3; i++) {
      const spec = twoOps({ U: JSON.parse(JSON.stringify(shared)) });
      const a = getRequestSchema(spec, '3.0', 'POST', '/a');
      expect(validateValue(a, '3.0', { name: 1 })).toEqual([{ kind: 'type', instancePath: '/name', expected: 'string', actual: 'integer' }]);
    }
  });
});

describe('readOnly (F5)', () => {
  it('ignores required for a name that is readOnly in another allOf member', () => {
    const spec = makeSpec({
      Base: { type: 'object', properties: { id: { type: 'string', readOnly: true } } }
    }, { allOf: [ref('Base'), { type: 'object', required: ['id', 'name'], properties: { name: { type: 'string' } } }] });
    expect(check(spec, '3.0', { name: 'n' })).toEqual([]);
    expect(check(spec, '3.0', {})).toEqual([{ kind: 'required', instancePath: '', missing: ['name'] }]);
  });
  it('ignores required for a property whose readOnly sits in its own allOf', () => {
    const spec = makeSpec({}, { type: 'object', required: ['id'], properties: { id: { allOf: [{ type: 'string' }, { readOnly: true }] } } });
    expect(check(spec, '3.0', {})).toEqual([]);
  });
  it('ignores required for a readOnly property reached through a ref', () => {
    const spec = makeSpec({ Id: { type: 'string', readOnly: true } }, { type: 'object', required: ['id'], properties: { id: ref('Id') } });
    expect(check(spec, '3.0', {})).toEqual([]);
  });
  it('honours readOnly next to a $ref (3.1) and keeps the description for hover', () => {
    const spec = makeSpec({ Id: { type: 'string', description: 'base' } },
      { type: 'object', required: ['id'], properties: { id: { $ref: '#/components/schemas/Id', readOnly: true, description: 'override' } } }, '3.1.0');
    const schema = getRequestSchema(spec, '3.1', 'POST', '/x');
    expect(validateValue(schema, '3.1', {})).toEqual([]);
    expect(findFieldSchema(schema, ['id']).schema).toMatchObject({ type: 'string', description: 'override' });
  });
  it('keeps the description of a plain ref', () => {
    const spec = makeSpec({ Id: { type: 'string', description: 'base' } }, { type: 'object', properties: { id: ref('Id') } });
    expect(findFieldSchema(getRequestSchema(spec, '3.0', 'POST', '/x'), ['id']).schema).toMatchObject({ type: 'string', description: 'base' });
  });
});

describe('media types (F6)', () => {
  const body = { type: 'object', required: ['a'], properties: { a: { type: 'string' } } };
  const specFor = (key) => ({ openapi: '3.0.3', paths: { '/x': { post: { requestBody: { content: { [key]: { schema: body } } } } } } });
  it.each(['application/json;charset=UTF-8', 'Application/JSON ; charset=utf-8', 'application/vnd.api+json', 'application/problem+json; x=y', 'application/json'])('finds the JSON body of %s', (key) => {
    expect(getRequestSchema(specFor(key), '3.0', 'POST', '/x')).toMatchObject({ required: ['a'] });
  });
  it.each(['text/plain', 'application/xml', 'text/json', 'application/jsonx'])('does not pick %s', (key) => {
    expect(getRequestSchema(specFor(key), '3.0', 'POST', '/x')).toBeNull();
  });
  it('follows a $ref requestBody', () => {
    const spec = { openapi: '3.0.3', paths: { '/x': { post: { requestBody: { $ref: '#/components/requestBodies/R' } } } }, components: { requestBodies: { R: { content: { 'application/json': { schema: body } } } } } };
    expect(getRequestSchema(spec, '3.0', 'POST', '/x')).toMatchObject({ required: ['a'] });
  });
});

describe('dropped keywords behind local refs', () => {
  it('still drops errors from a component that is only reached through oneOf, anyOf, if or then', () => {
    const schemas = { Strict: { type: 'object', required: ['z'], properties: { n: { type: 'integer' } } } };
    for (const body of [{ oneOf: [ref('Strict'), { type: 'string' }] }, { anyOf: [ref('Strict')] }, { not: ref('Strict') }, { if: { required: ['q'] }, then: ref('Strict') }]) {
      const spec = makeSpec(schemas, body, '3.1.0');
      expect(check(spec, '3.1', { n: 'x' })).toEqual([]);
    }
  });
  it('drops errors of components that contain refs themselves (Ajv compiles those as separate functions)', () => {
    const schemas = {
      Card: { type: 'object', required: ['cardNo'], properties: { cardNo: { type: 'string' }, meta: ref('Meta') } },
      Bank: { type: 'object', required: ['iban'], properties: { iban: { type: 'string' }, meta: ref('Meta') } },
      Meta: { type: 'object', properties: { note: { type: 'string' } } }
    };
    const cases = [
      [{ type: 'object', properties: { m: { oneOf: [ref('Card'), ref('Bank')] } } }, { m: { zzz: 1 } }],
      [{ type: 'object', properties: { m: { anyOf: [ref('Card')] } } }, { m: { zzz: 1 } }],
      [{ type: 'object', properties: { m: { not: ref('Card') } } }, { m: { cardNo: 'x' } }],
      [{ oneOf: [ref('Card')] }, []],
      [{ type: 'object', if: { required: ['q'] }, then: ref('Card') }, { q: 1 }],
      [{ type: 'object', if: { required: ['q'] }, else: ref('Card') }, { r: 1 }]
    ];
    for (const version of ['3.0', '3.1']) {
      for (const [body, value] of cases) {
        expect(check(makeSpec(schemas, body, version === '3.1' ? '3.1.0' : '3.0.3'), version, value)).toEqual([]);
      }
    }
  });
  it('keeps the errors of a component used both directly and through oneOf', () => {
    const schemas = { Strict: { type: 'object', required: ['z'] } };
    const spec = makeSpec(schemas, { type: 'object', properties: { a: ref('Strict'), b: { oneOf: [ref('Strict'), { type: 'string' }] } } });
    expect(check(spec, '3.0', { a: {}, b: {} })).toEqual([{ kind: 'required', instancePath: '/a', missing: ['z'] }]);
  });
});
