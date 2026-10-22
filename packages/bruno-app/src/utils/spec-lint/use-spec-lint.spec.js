import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { renderHook, waitFor, act, render } from '@testing-library/react';
import specLint, { setCollectionSpecData } from 'providers/ReduxStore/slices/spec-lint';
import { useSpecLint } from './use-spec-lint';
import { getSpecSummary } from './ipc';

jest.mock('./ipc');

const binding = { spec: 'spec.yaml', method: 'POST', path: '/v3/limit' };
const bindingsData = { specs: ['spec.yaml'], bindings: { 'a/b.yml': binding } };
const summary = { ok: true, title: 'T', specVersion: '3.0.0', version: '1', operations: [{ method: 'POST', path: '/v3/limit' }] };

const collection = { uid: 'c1', pathname: '/c' };
const makeItem = (mode = 'json') => ({ uid: 'i1', pathname: '/c/a/b.yml', request: { body: { mode, json: '{}' } } });

const makeStore = (data = bindingsData) => {
  const store = configureStore({
    reducer: {
      specLint,
      collections: () => ({ collections: [collection] }),
      app: () => ({ preferences: {} })
    }
  });
  store.dispatch(setCollectionSpecData({ collectionUid: 'c1', data, error: null }));
  return store;
};

const wrapperFor = (store) => ({ children }) => <Provider store={store}>{children}</Provider>;

it('returns null specCtx while the summary loads, then a stable ctx', async () => {
  let resolveSummary;
  getSpecSummary.mockReturnValue(new Promise((resolve) => { resolveSummary = resolve; }));
  const { result, rerender } = renderHook(({ item }) => useSpecLint({ collection, item, enabled: true }), {
    wrapper: wrapperFor(makeStore()),
    initialProps: { item: makeItem() }
  });
  expect(result.current.specCtx).toBeNull();
  expect(result.current.summary).toBeUndefined();
  expect(result.current.binding).toEqual(binding);
  await act(async () => { resolveSummary(summary); });
  await waitFor(() => expect(result.current.specCtx).not.toBeNull());
  expect(result.current.specCtx).toEqual({ collectionPath: '/c', specPath: 'spec.yaml', method: 'POST', path: '/v3/limit' });
  const first = result.current.specCtx;
  rerender({ item: makeItem() });
  expect(result.current.specCtx).toBe(first);
  expect(getSpecSummary).toHaveBeenCalledTimes(1);
});

it('returns null when the operation is not in the spec', async () => {
  getSpecSummary.mockResolvedValue({ ...summary, operations: [{ method: 'GET', path: '/other' }] });
  const { result } = renderHook(() => useSpecLint({ collection, item: makeItem(), enabled: true }), { wrapper: wrapperFor(makeStore()) });
  await waitFor(() => expect(result.current.summary).toBeDefined());
  expect(result.current.specCtx).toBeNull();
});

it('returns null when the spec failed to load', async () => {
  getSpecSummary.mockResolvedValue({ ok: false, error: 'bad' });
  const { result } = renderHook(() => useSpecLint({ collection, item: makeItem(), enabled: true }), { wrapper: wrapperFor(makeStore()) });
  await waitFor(() => expect(result.current.summary).toEqual({ ok: false, error: 'bad' }));
  expect(result.current.specCtx).toBeNull();
});

it('returns null when disabled or the body mode is not json', () => {
  const store = makeStore();
  const disabled = renderHook(() => useSpecLint({ collection, item: makeItem(), enabled: false }), { wrapper: wrapperFor(store) });
  expect(disabled.result.current.specCtx).toBeNull();
  const xml = renderHook(() => useSpecLint({ collection, item: makeItem('xml'), enabled: true }), { wrapper: wrapperFor(store) });
  expect(xml.result.current.specCtx).toBeNull();
  expect(getSpecSummary).not.toHaveBeenCalled();
});

it('does not update after unmount', async () => {
  let resolveSummary;
  getSpecSummary.mockReturnValue(new Promise((resolve) => { resolveSummary = resolve; }));
  let renders = 0;
  const Consumer = () => {
    useSpecLint({ collection, item: makeItem(), enabled: true });
    renders += 1;
    return null;
  };
  const { unmount } = render(<Provider store={makeStore()}><Consumer /></Provider>);
  const before = renders;
  unmount();
  await act(async () => { resolveSummary(summary); });
  expect(renders).toBe(before);
});

it('applies to any body mode when the JSON body is not required', async () => {
  getSpecSummary.mockResolvedValue(summary);
  const store = makeStore();
  const { result: json } = renderHook(() => useSpecLint({ collection, item: makeItem('none'), enabled: true }), { wrapper: wrapperFor(store) });
  const { result: any } = renderHook(() => useSpecLint({ collection, item: makeItem('none'), enabled: true, requireJsonBody: false }), { wrapper: wrapperFor(store) });
  await waitFor(() => expect(any.current.specCtx).toEqual({ collectionPath: '/c', specPath: 'spec.yaml', method: 'POST', path: '/v3/limit' }));
  expect(json.current.specCtx).toBeNull();
});
