const { resolvePointer } = require('../../src/utils/spec-lint/deref');

const root = { a: { 'b/c': [{ d: 1 }], 'e~f': 2, 'sp ace': 3 } };

it('resolves JSON pointers with escapes and array indexes', () => {
  expect(resolvePointer(root, '#/a/b~1c/0/d')).toBe(1);
  expect(resolvePointer(root, '#/a/e~0f')).toBe(2);
  expect(resolvePointer(root, '#/a/sp%20ace')).toBe(3);
});
it('returns undefined for a missing path', () => {
  expect(resolvePointer(root, '#/a/nope')).toBeUndefined();
  expect(resolvePointer(root, '#/a/b~1c/0/d/x')).toBeUndefined();
});
it('does not walk the prototype chain', () => {
  expect(resolvePointer(root, '#/a/constructor')).toBeUndefined();
});
