import { readBindings, updateBindings, lintWithSpec, describeWithSpec, urlDiffersFromSpec, operationHasJsonBody } from './ipc';

const invoke = jest.fn();
beforeEach(() => {
  invoke.mockReset(); window.ipcRenderer = { invoke };
});

it('readBindings always returns full data', async () => {
  invoke.mockResolvedValue({ error: 'spec-bindings.json is not valid JSON' });
  expect(await readBindings({ collectionPath: '/c' })).toEqual({ data: { specs: [], bindings: {} }, error: 'spec-bindings.json is not valid JSON' });
  invoke.mockResolvedValue({ data: { specs: ['a'], bindings: {} } });
  expect(await readBindings({ collectionPath: '/c' })).toEqual({ data: { specs: ['a'], bindings: {} }, error: null });
});
it('updateBindings sends the operation and returns the new data, or throws', async () => {
  const op = { type: 'addSpec', storedPath: 'a' };
  invoke.mockResolvedValue({ data: { specs: ['a'], bindings: {} } });
  expect(await updateBindings({ collectionPath: '/c', op })).toEqual({ specs: ['a'], bindings: {} });
  expect(invoke).toHaveBeenCalledWith('renderer:spec-lint-update-bindings', { collectionPath: '/c', op });
  invoke.mockResolvedValue({ error: 'boom' });
  await expect(updateBindings({ collectionPath: '/c', op })).rejects.toThrow('boom');
});
it('lintWithSpec unwraps errors and turns missing or error into []', async () => {
  invoke.mockResolvedValue({ errors: [{ from: 0, to: 1, message: 'Spec requires: x' }] });
  expect(await lintWithSpec({})).toEqual([{ from: 0, to: 1, message: 'Spec requires: x' }]);
  invoke.mockResolvedValue({ missing: true });
  expect(await lintWithSpec({})).toEqual([]);
  invoke.mockResolvedValue({ error: 'boom' });
  expect(await lintWithSpec({})).toEqual([]);
});
it('describeWithSpec and urlDiffersFromSpec unwrap', async () => {
  invoke.mockResolvedValue({ info: { path: 'role' } });
  expect(await describeWithSpec({})).toEqual({ path: 'role' });
  invoke.mockResolvedValue({ error: 'x' });
  expect(await describeWithSpec({})).toBeNull();
  invoke.mockResolvedValue({ differs: true });
  expect(await urlDiffersFromSpec({})).toBe(true);
  invoke.mockResolvedValue({ error: 'x' });
  expect(await urlDiffersFromSpec({})).toBe(false);
});

it('operationHasJsonBody is false only when the lint channel answers missing', async () => {
  const target = { collectionPath: '/c', specPath: 's.yaml', method: 'POST', path: '/x' };
  invoke.mockResolvedValueOnce({ errors: [] });
  expect(await operationHasJsonBody(target)).toBe(true);
  invoke.mockResolvedValueOnce({ missing: true });
  expect(await operationHasJsonBody(target)).toBe(false);
  expect(invoke).toHaveBeenLastCalledWith('renderer:spec-lint-lint', { ...target, text: '{}' });
});
