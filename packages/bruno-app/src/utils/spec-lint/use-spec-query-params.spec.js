import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { renderHook, waitFor } from '@testing-library/react';
import specLint, { setCollectionSpecData } from 'providers/ReduxStore/slices/spec-lint';
import { useSpecQueryParams } from './use-spec-query-params';
import { getSpecSummary, getQueryParamsFromSpec } from './ipc';

jest.mock('./ipc');

const collection = { uid: 'c1', pathname: '/c' };
const item = { uid: 'i1', pathname: '/c/get-limit.bru', request: { body: { mode: 'none' } } };
const data = { specs: ['spec.yaml'], bindings: { 'get-limit.bru': { spec: 'spec.yaml', method: 'GET', path: '/v3/limit' } } };
const params = [{ name: 'page', required: true, deprecated: false, type: 'integer', valueType: 'integer', enum: [], default: 1, description: '' }];

const wrapper = ({ children }) => {
  const store = configureStore({ reducer: { specLint, collections: () => ({ collections: [collection] }), app: () => ({ preferences: {} }) } });
  store.dispatch(setCollectionSpecData({ collectionUid: 'c1', data, error: null }));
  return <Provider store={store}>{children}</Provider>;
};

beforeEach(() => {
  getSpecSummary.mockResolvedValue({ ok: true, title: 'T', specVersion: '1', version: '3.0', operations: [{ method: 'GET', path: '/v3/limit' }] });
  getQueryParamsFromSpec.mockResolvedValue(params);
});

it('loads the query parameters of the bound operation, whatever the body mode', async () => {
  const { result } = renderHook(() => useSpecQueryParams({ collection, item, enabled: true }), { wrapper });
  await waitFor(() => expect(result.current).toEqual(params));
  expect(getQueryParamsFromSpec).toHaveBeenCalledWith({ collectionPath: '/c', specPath: 'spec.yaml', method: 'GET', path: '/v3/limit' });
});

it('is null when spec lint is off', async () => {
  const { result } = renderHook(() => useSpecQueryParams({ collection, item, enabled: false }), { wrapper });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(result.current).toBeNull();
  expect(getQueryParamsFromSpec).not.toHaveBeenCalled();
});
