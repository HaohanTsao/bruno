const { validateValue } = require('../../src/utils/spec-lint/validate');

const schema = { type: 'object', required: ['name', 'email'], properties: { name: { type: 'string' }, level: { type: 'integer', enum: [1, 2, 3] }, p: { oneOf: [{ type: 'string' }, { type: 'integer' }] } } };

it('merges required errors per object', () => {
  expect(validateValue(schema, '3.0', {})).toEqual([{ kind: 'required', instancePath: '', missing: ['name', 'email'] }]);
});
it('keeps only the type error when type and enum fail together', () => {
  expect(validateValue(schema, '3.0', { name: 'a', email: 'b', level: '2' })).toEqual([{ kind: 'type', instancePath: '/level', expected: 'integer', actual: 'string' }]);
});
it('reports enum when the type is right', () => {
  expect(validateValue(schema, '3.0', { name: 'a', email: 'b', level: 5 })).toEqual([{ kind: 'enum', instancePath: '/level', allowed: [1, 2, 3] }]);
});
it('drops errors inside oneOf branches', () => {
  expect(validateValue(schema, '3.0', { name: 'a', email: 'b', p: true })).toEqual([]);
});
it('uses the 2020 dialect for 3.1 (prefixItems is enforced only there)', () => {
  const s = { type: 'array', prefixItems: [{ type: 'integer' }] };
  expect(validateValue(s, '3.1', ['x'])).toEqual([{ kind: 'type', instancePath: '/0', expected: 'integer', actual: 'string' }]);
  expect(validateValue(s, '3.0', ['x'])).toEqual([]);
});
it('keeps errors on properties that are merely named not or if', () => {
  const s = { type: 'object', properties: { not: { type: 'string' }, if: { type: 'string' } } };
  expect(validateValue(s, '3.0', { not: 1, if: 2 }).map((e) => e.instancePath)).toEqual(['/not', '/if']);
});
it('expected type omits null', () => {
  expect(validateValue({ type: ['integer', 'null'] }, '3.1', 'x')).toEqual([{ kind: 'type', instancePath: '', expected: 'integer', actual: 'string' }]);
});
it('returns [] when the schema cannot be compiled', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect(validateValue({ type: 'number', exclusiveMinimum: true }, '3.0', 1)).toEqual([]);
  warn.mockRestore();
});
it('compiles each schema object once', () => {
  const s = { type: 'string' };
  validateValue(s, '3.0', 1);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 200; i++) validateValue(s, '3.0', 1);
  expect(Number(process.hrtime.bigint() - t0) / 1e6).toBeLessThan(50);
});

it('drops errors from then/else, contains and propertyNames (F4)', () => {
  const cond = { if: { properties: { kind: { const: 'A' } }, required: ['kind'] }, then: { required: ['a'] }, else: { required: ['b'] } };
  expect(validateValue(cond, '3.1', { kind: 'x', a: 1 })).toEqual([]);
  expect(validateValue({ type: 'array', contains: { type: 'integer' } }, '3.1', ['a', 'b'])).toEqual([]);
  expect(validateValue({ type: 'object', propertyNames: { enum: ['a'] } }, '3.1', { b: 1 })).toEqual([]);
  expect(validateValue({ type: 'object', dependentRequired: { a: ['b'] } }, '3.1', { a: 1 })).toEqual([]);
});
it('drops errors under the dropped keywords even behind a property named properties', () => {
  const s = { type: 'object', properties: { properties: { not: { type: 'string' } } } };
  expect(validateValue(s, '3.0', { properties: 'x' })).toEqual([]);
});
it('reports one error when type is declared twice (F9)', () => {
  const s = { type: 'object', properties: { a: { type: 'string', allOf: [{ type: 'string' }] } } };
  expect(validateValue(s, '3.0', { a: 1 })).toEqual([{ kind: 'type', instancePath: '/a', expected: 'string', actual: 'integer' }]);
});
it('reports null-only expectations as null and omits null from allowed values (F8)', () => {
  expect(validateValue({ type: 'null' }, '3.1', 'y')).toEqual([{ kind: 'type', instancePath: '', expected: 'null', actual: 'string' }]);
  expect(validateValue({ type: ['string', 'null'], enum: ['x', null] }, '3.1', 'y')).toEqual([{ kind: 'enum', instancePath: '', allowed: ['x'] }]);
  expect(validateValue({ enum: [null] }, '3.1', 'y')).toEqual([{ kind: 'enum', instancePath: '', allowed: [null] }]);
});
