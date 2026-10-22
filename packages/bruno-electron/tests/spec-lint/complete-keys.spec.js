const fs = require('fs');
const path = require('path');
const { loadSpec } = require('../../src/utils/spec-lint/spec-loader');
const { getRequestSchema } = require('../../src/utils/spec-lint/schema');
const { completeKeys } = require('../../src/utils/spec-lint');

const { spec, version } = loadSpec(fs.readFileSync(path.join(__dirname, 'fixtures/demo-user-api.yml'), 'utf8'));
const ctx = { schema: getRequestSchema(spec, version, 'POST', '/users') };

// `|` marks the cursor.
const complete = (body, c = ctx) => completeKeys(body.replace('|', ''), body.indexOf('|'), c);
const names = (body, c) => (complete(body, c) || []).map((item) => item.name);

it('lists every field of the body in spec order, with type, required flag and description', () => {
  expect(names('{|}')).toEqual(['name', 'email', 'role', 'status', 'level', 'phone']);
  expect(complete('{"|"}').find((item) => item.name === 'role')).toEqual({
    name: 'role', type: 'string', required: true, description: '使用者角色（必填，固定選項）', deprecated: false
  });
});
it('leaves out keys the object already has, but not the one being typed', () => {
  expect(names('{"name": "A", "ro|"}')).toEqual(['email', 'role', 'status', 'level', 'phone']);
  expect(names('{\n  "name": "A",\n  "role|"\n}')).toEqual(['email', 'role', 'status', 'level', 'phone']);
});
it('works in half typed bodies, with a bare word, comments and variables', () => {
  expect(names('{"name": "A",\n  ro|')).toContain('role');
  expect(names('{\n  // x\n  "level": {{lvl}},\n  st|\n}')).toContain('status');
  expect(names('{"level": {{lvl}}, "|"}')).not.toContain('level');
});
it('returns null on values and undescribed objects', () => {
  expect(complete('{"role": "ad|"}')).toBeNull();
  expect(complete('{"role": 1 |}')).toBeNull();
  expect(complete('{"nickname": {"|"}}')).toBeNull();
});
it('follows nested objects, array items, allOf and oneOf branches', () => {
  const c = {
    schema: {
      type: 'object',
      required: ['a'],
      properties: {
        a: { type: 'array', items: { allOf: [{ type: 'object', required: ['x'], properties: { x: { type: 'integer', description: 'X' } } }, { properties: { y: { type: 'string' } } }] } },
        b: { oneOf: [{ type: 'object', required: ['p'], properties: { p: { type: 'string' } } }, { type: 'object', properties: { q: { type: 'string', deprecated: true } } }] },
        id: { type: 'integer', readOnly: true }
      }
    }
  };
  expect(names('{|}', c)).toEqual(['a', 'b']);
  expect(complete('{"a": [{"|"}]}', c)).toEqual([
    { name: 'x', type: 'integer', required: true, description: 'X', deprecated: false },
    { name: 'y', type: 'string', required: false, description: '', deprecated: false }
  ]);
  // A field one branch requires is not required by the object.
  expect(complete('{"b": {|}}', c)).toEqual([
    { name: 'p', type: 'string', required: false, description: '', deprecated: false },
    { name: 'q', type: 'string', required: false, description: '', deprecated: true }
  ]);
});
