const { prepareBody } = require('../../src/utils/spec-lint/prepare-body');

const nodeText = (text, node) => text.slice(node.offset, node.offset + node.length);

it('keeps offsets identical to the original text', () => {
  const text = '{\n  // note\n  "a": {{lvl}},\n  "b": "x"\n}';
  const r = prepareBody(text);
  expect(nodeText(text, r.tree.children[1].children[1])).toBe('"x"');
});
it('records quoted and unquoted variable values as skipped', () => {
  const text = '{"a": {{lvl}}, "b": "{{x}}", "c": "pre-{{y}}"}';
  expect(prepareBody(text).skipped.map(([s, e]) => text.slice(s, e))).toEqual(['{{lvl}}', '"{{x}}"', '"pre-{{y}}"']);
});
it('ignores {{x}} inside comments', () => {
  const text = '{\n  // copy {{x}} later\n  "a": 1 /* {{y}} */\n}';
  const r = prepareBody(text);
  expect(r.ok).toBe(true);
  expect(r.skipped).toEqual([]);
  expect(r.value).toEqual({ a: 1 });
});
it('removes null properties so they count as absent, keeps array nulls in place', () => {
  expect(prepareBody('{"a": null, "b": {"c": null, "d": 1}, "e": [null, 2]}').value).toEqual({ b: { d: 1 }, e: [null, 2] });
});
it('keeps skipped keys present', () => {
  expect(Object.keys(prepareBody('{"a": {{lvl}}}').value)).toEqual(['a']);
});
it('never skips a whole object just because it contains a variable', () => {
  const text = '{"o": {"a": "{{x}}", "b": 1}}';
  expect(prepareBody(text).skipped.map(([s, e]) => text.slice(s, e))).toEqual(['"{{x}}"']);
});
it('handles an unquoted variable followed by more keys on the same line', () => {
  const text = '{"level": {{lvl}}, "role": "admin"}';
  const r = prepareBody(text);
  expect(r.ok).toBe(true);
  expect(r.skipped.map(([s, e]) => text.slice(s, e))).toEqual(['{{lvl}}']);
  expect(r.value).toEqual({ level: 'xxxxx', role: 'admin' });
});
it('respects escaped quotes and // inside strings', () => {
  const text = '{"url": "http://x//y", "e": "say \\"{{q}}\\"", "k": 1}';
  const r = prepareBody(text);
  expect(r.ok).toBe(true);
  expect(r.skipped.map(([s, e]) => text.slice(s, e))).toEqual(['"say \\"{{q}}\\""']);
  expect(r.value.url).toBe('http://x//y');
});
it('accepts trailing commas', () => {
  expect(prepareBody('{"a": 1,}').ok).toBe(true);
});
it('fails on syntax errors', () => {
  expect(prepareBody('{"a": }').ok).toBe(false);
});
