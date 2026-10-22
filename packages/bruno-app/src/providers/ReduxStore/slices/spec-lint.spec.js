import { configureStore } from '@reduxjs/toolkit';
import reducer, { setCollectionSpecData, loadSpecBindings, saveSpecBindings } from './spec-lint';
import { readBindings, updateBindings } from 'utils/spec-lint/ipc';

jest.mock('utils/spec-lint/ipc');

const makeStore = () =>
  configureStore({
    reducer: {
      specLint: reducer,
      collections: () => ({ collections: [{ uid: 'c1', pathname: '/c' }] }),
      app: () => ({ preferences: {} })
    }
  });

it('stores data per collection', () => {
  const s = reducer(undefined, setCollectionSpecData({ collectionUid: 'c1', data: { specs: ['a'], bindings: {} }, error: null }));
  expect(s.byCollection.c1).toEqual({ data: { specs: ['a'], bindings: {} }, loaded: true, error: null });
});

it('loadSpecBindings reads with the collection pathname and stores the result', async () => {
  readBindings.mockResolvedValue({ data: { specs: ['a'], bindings: {} }, error: null });
  const store = makeStore();
  await store.dispatch(loadSpecBindings('c1'));
  expect(readBindings).toHaveBeenCalledWith({ collectionPath: '/c' });
  expect(store.getState().specLint.byCollection.c1.data).toEqual({ specs: ['a'], bindings: {} });
});

it('loadSpecBindings keeps full-shape data and the error for a broken file', async () => {
  readBindings.mockResolvedValue({ data: { specs: [], bindings: {} }, error: 'spec-bindings.json is not valid JSON' });
  const store = makeStore();
  await store.dispatch(loadSpecBindings('c1'));
  expect(store.getState().specLint.byCollection.c1).toEqual({
    data: { specs: [], bindings: {} },
    loaded: true,
    error: 'spec-bindings.json is not valid JSON'
  });
});

it('saveSpecBindings sends the operation, then stores the data that comes back', async () => {
  const fresh = { specs: ['a', 'from-disk'], bindings: {} };
  updateBindings.mockResolvedValue(fresh);
  const store = makeStore();
  const op = { type: 'addSpec', storedPath: 'a' };
  expect(await store.dispatch(saveSpecBindings('c1', op))).toBe(true);
  expect(updateBindings).toHaveBeenCalledWith({ collectionPath: '/c', op });
  expect(store.getState().specLint.byCollection.c1).toEqual({ data: fresh, loaded: true, error: null });
});

it('saveSpecBindings throws and keeps the state when the change fails', async () => {
  updateBindings.mockRejectedValue(new Error('disk gone'));
  const store = makeStore();
  const before = store.getState().specLint;
  await expect(store.dispatch(saveSpecBindings('c1', { type: 'addSpec', storedPath: 'a' }))).rejects.toThrow('disk gone');
  expect(store.getState().specLint).toEqual(before);
});

it('saveSpecBindings refuses to overwrite while the file is broken', async () => {
  const store = makeStore();
  store.dispatch(setCollectionSpecData({ collectionUid: 'c1', data: { specs: [], bindings: {} }, error: 'spec-bindings.json is not valid JSON' }));
  const before = store.getState().specLint;
  expect(await store.dispatch(saveSpecBindings('c1', { type: 'addSpec', storedPath: 'a' }))).toBe(false);
  expect(updateBindings).not.toHaveBeenCalled();
  expect(store.getState().specLint).toEqual(before);
});
