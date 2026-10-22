const fs = require('fs');
const path = require('path');
const { loadSpec } = require('../../src/utils/spec-lint/spec-loader');
const { getRequestSchema } = require('../../src/utils/spec-lint/schema');
const { lintBody } = require('../../src/utils/spec-lint');

const { spec, version } = loadSpec(fs.readFileSync(path.join(__dirname, 'fixtures/demo-user-api.yml'), 'utf8'));
const ctx = { schema: getRequestSchema(spec, version, 'POST', '/users'), version };
const lint = (body, c = ctx) => lintBody(body, c).map((e) => ({ at: body.slice(e.from, e.to), message: e.message }));

it('1 valid payload has no errors', () => {
  expect(lint('{"name":"Alice","email":"alice@example.com","role":"viewer","status":"active","level":2}')).toEqual([]);
});
it('2 missing required is one error on the object brace', () => {
  expect(lint('{"name":"Bob"}')).toEqual([{ at: '{', message: 'Spec requires: email, role' }]);
});
it('3 enum errors on each value', () => {
  expect(lint('{"name":"Carol","email":"carol@example.com","role":"superuser","status":"deleted"}')).toEqual([
    { at: '"superuser"', message: 'Spec allows: admin, editor, viewer (role)' },
    { at: '"deleted"', message: 'Spec allows: active, suspended, pending (status)' }
  ]);
});
it('4 type errors on each value', () => {
  expect(lint('{"name":["Dave"],"email":"dave@example.com","role":"editor","level":"2","phone":912345678}')).toEqual([
    { at: '["Dave"]', message: 'Spec expects string, got array (name)' },
    { at: '"2"', message: 'Spec expects integer, got string (level)' },
    { at: '912345678', message: 'Spec expects string, got integer (phone)' }
  ]);
});
it('5 extra fields are not reported', () => {
  expect(lint('{"name":"Eve","email":"eve@example.com","role":"admin","nickname":"evie","age":30}')).toEqual([]);
});
it('variables are skipped, quoted or not', () => {
  expect(lint('{"name":"A","email":"a@b.c","role":"admin","level": {{lvl}}}')).toEqual([]);
  expect(lint('{"name":"A","email":"a@b.c","role":"admin","level": "{{lvl}}"}')).toEqual([]);
  expect(lint('{"name":"A","email":"a@b.c","role":{{undefinedVar}}}')).toEqual([]);
});
it('null counts as absent', () => {
  expect(lint('{"name":"A","email":"a@b.c","role":"admin","level":null}')).toEqual([]);
  expect(lint('{"name":"A","email":null,"role":"admin"}')).toEqual([{ at: '{', message: 'Spec requires: email' }]);
});
it('null array elements are not reported', () => {
  const c = { schema: { type: 'object', properties: { arr: { type: 'array', items: { type: 'string', enum: ['a'] } } } }, version: '3.0' };
  expect(lint('{"arr": ["a", null]}', c)).toEqual([]);
});
it('syntax errors produce no spec errors', () => {
  expect(lint('{"name": }')).toEqual([]);
});
it('comments and variables do not shift offsets', () => {
  const body = '{\n  // c {{z}}\n  "name": "A", // trailing\n  "email": "{{e}}",\n  "role": {{r}},\n  "level": "2"\n}';
  expect(lint(body)).toEqual([{ at: '"2"', message: 'Spec expects integer, got string (level)' }]);
});
it('format is never reported', () => {
  expect(lint('{"name":"A","email":"not-an-email","role":"admin"}')).toEqual([]);
});
it('a variable inside an object does not hide errors on its siblings', () => {
  const c = { schema: { type: 'object', properties: { o: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'integer' } } } } }, version: '3.0' };
  const body = '{"o": {"a": "{{x}}", "b": "1"}}';
  expect(lint(body, c)).toEqual([{ at: '"1"', message: 'Spec expects integer, got string (o.b)' }]);
});
it('errors under digit-only object keys are kept', () => {
  const c = { schema: { type: 'object', properties: { m: { type: 'object', properties: { 123: { type: 'integer' } } } } }, version: '3.0' };
  expect(lint('{"m": {"123": "x"}}', c)).toEqual([{ at: '"x"', message: 'Spec expects integer, got string (m.123)' }]);
});

it('formats enum values and null-only expectations (F8)', () => {
  const c = (schema, version = '3.0') => ({ schema, version });
  expect(lint('"y"', c({ type: ['string', 'null'], enum: ['x', null] }))).toEqual([{ at: '"y"', message: 'Spec allows: x' }]);
  expect(lint('"y"', c({ enum: [{ k: 1 }, [1, 2], 3, 'a'] }))).toEqual([{ at: '"y"', message: 'Spec allows: {"k":1}, [1,2], 3, a' }]);
  expect(lint('"y"', c({ enum: [null] }))).toEqual([{ at: '"y"', message: 'Spec allows: null' }]);
  expect(lint('"y"', c({ type: 'null' }, '3.1'))).toEqual([{ at: '"y"', message: 'Spec expects null, got string' }]);
});
it('ignores then/else errors when a placeholder sits in the condition field (F4)', () => {
  const schema = { type: 'object', if: { properties: { kind: { const: 'A' } }, required: ['kind'] }, then: { required: ['a'] }, else: { required: ['b'] } };
  expect(lint('{"kind":"{{k}}","a":1}', { schema, version: '3.1' })).toEqual([]);
  expect(lint('{"kind":{{k}},"a":1}', { schema, version: '3.1' })).toEqual([]);
});

it('makes each message unique per value, so one line can show several marks (editor-integration F1)', () => {
  const c = { schema: { type: 'object', properties: { limit: { type: 'object', properties: { a: { type: 'integer' }, b: { type: 'integer' } } }, tags: { type: 'array', items: { type: 'integer' } } } }, version: '3.0' };
  const body = '{"limit":{"a":"1","b":"3"},"tags":["0","1"]}';
  const messages = lintBody(body, c).map((e) => e.message);
  expect(messages).toEqual([
    'Spec expects integer, got string (limit.a)',
    'Spec expects integer, got string (limit.b)',
    'Spec expects integer, got string (tags[0])',
    'Spec expects integer, got string (tags[1])'
  ]);
  expect(new Set(messages).size).toBe(messages.length);
});
it('names the object a required error belongs to when it is not the root', () => {
  const c = { schema: { type: 'object', properties: { a: { type: 'object', required: ['x'] }, b: { type: 'object', required: ['x'] } } }, version: '3.0' };
  expect(lint('{"a":{},"b":{}}', c)).toEqual([
    { at: '{', message: 'Spec requires: x (a)' },
    { at: '{', message: 'Spec requires: x (b)' }
  ]);
});
