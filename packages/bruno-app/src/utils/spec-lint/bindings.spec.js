import { bindingKey, getBinding, countBindingsOf } from './bindings';

const b = { spec: 'specs/example-a.yaml', method: 'POST', path: '/v3/limit' };

it('keys by posix path relative to the collection', () => {
  expect(bindingKey('/c', '/c/folder-a/request-b.yml')).toBe('folder-a/request-b.yml');
  expect(bindingKey('C:\\c', 'C:\\c\\a\\b.yml')).toBe('a/b.yml');
});
it('has no key for a request outside the collection folder', () => {
  expect(bindingKey('/Users/a/coll', '/Users/a/Library/Application Support/bruno/tmp/transient/bruno-abc/Untitled 1.yml')).toBeNull();
  expect(bindingKey('/c', '/c')).toBeNull();
  expect(bindingKey('/c', '/cc/a.yml')).toBeNull();
  expect(bindingKey('/c', undefined)).toBeNull();
});
it('gets a binding by key', () => {
  const data = { specs: [], bindings: { 'a.yml': b } };
  expect(getBinding(data, 'a.yml')).toEqual(b);
  expect(getBinding(data, 'renamed.yml')).toBeNull();
  expect(getBinding(data, null)).toBeNull();
  expect(getBinding(null, 'a.yml')).toBeNull();
});
it('treats a malformed entry as no binding', () => {
  const data = {
    specs: [],
    bindings: {
      'nospec.yml': { method: 'POST', path: '/v3/limit' },
      'nomethod.yml': { spec: 's', path: '/x' },
      'nopath.yml': { spec: 's', method: 'GET' },
      'number.yml': { spec: 3, method: 'GET', path: '/x' },
      'null.yml': null,
      'string.yml': 'x'
    }
  };
  Object.keys(data.bindings).forEach((key) => expect(getBinding(data, key)).toBeNull());
});
it('counts the requests bound to a spec', () => {
  const data = { specs: [], bindings: { 'a.yml': b, 'b.yml': { ...b, path: '/x' }, 'c.yml': { ...b, spec: 'other.yaml' }, 'd.yml': null, 'e.yml': { spec: b.spec } } };
  // The main process removes every entry that names the spec, so the count does too.
  expect(countBindingsOf(data, 'specs/example-a.yaml')).toBe(3);
  expect(countBindingsOf(data, 'nope.yaml')).toBe(0);
  expect(countBindingsOf(null, 'specs/example-a.yaml')).toBe(0);
});
