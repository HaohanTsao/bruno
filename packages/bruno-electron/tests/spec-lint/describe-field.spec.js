const fs = require('fs');
const path = require('path');
const { loadSpec } = require('../../src/utils/spec-lint/spec-loader');
const { getRequestSchema } = require('../../src/utils/spec-lint/schema');
const { describeField } = require('../../src/utils/spec-lint');

const { spec, version } = loadSpec(fs.readFileSync(path.join(__dirname, 'fixtures/demo-user-api.yml'), 'utf8'));
const ctx = { schema: getRequestSchema(spec, version, 'POST', '/users') };

it('describes a key under the cursor', () => {
  const body = '{"name":"A","role":"admin"}';
  expect(describeField(body, body.indexOf('role') + 1, ctx)).toEqual({
    from: body.indexOf('"role"'), to: body.indexOf('"role"') + 6, path: 'role', type: 'string', required: true, description: '使用者角色（必填，固定選項）'
  });
});
it('still works after an unquoted variable and a comment', () => {
  const body = '{\n  "level": {{lvl}}, // x\n  "role": "admin"\n}';
  expect(describeField(body, body.indexOf('role') + 1, ctx)).toMatchObject({ path: 'role', required: true });
});
it('works on a single line after an unquoted variable', () => {
  const body = '{"level": {{lvl}}, "role": "admin"}';
  expect(describeField(body, body.indexOf('role') + 1, ctx)).toMatchObject({ path: 'role', type: 'string' });
});
it('describes nested keys and keys inside array elements', () => {
  const c = { schema: { type: 'object', properties: { a: { type: 'object', required: ['b'], properties: { b: { type: 'array', items: { type: 'object', properties: { c: { type: 'integer', description: 'C' } } } } } } } } };
  const body = '{"a": {"b": [{"c": 1}]}}';
  expect(describeField(body, body.indexOf('"b"') + 1, c)).toMatchObject({ path: 'a.b', type: 'array', required: true });
  expect(describeField(body, body.indexOf('"c"') + 1, c)).toMatchObject({ path: 'a.b[0].c', type: 'integer', required: false, description: 'C' });
});
it('returns null on values, inside variables, unknown keys and broken JSON', () => {
  const body = '{"role":"admin","nickname":"x","level": {{lvl}}}';
  expect(describeField(body, body.indexOf('admin'), ctx)).toBeNull();
  expect(describeField(body, body.indexOf('lvl'), ctx)).toBeNull();
  expect(describeField(body, body.indexOf('nickname') + 1, ctx)).toBeNull();
  expect(describeField('{"role": ', 3, ctx)).toBeNull();
});
