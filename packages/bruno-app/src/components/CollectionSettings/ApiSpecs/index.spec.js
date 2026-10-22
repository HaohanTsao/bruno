import '@testing-library/jest-dom';
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { ThemeProvider } from 'styled-components';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import specLint from 'providers/ReduxStore/slices/spec-lint';
import { ThemeContext } from 'providers/Theme';
import themes from 'themes/index';
import { readBindings, updateBindings, getSpecSummary, toStoredPath } from 'utils/spec-lint/ipc';
import { browseFiles } from 'providers/ReduxStore/slices/collections/actions';
import ApiSpecs from './index';

jest.mock('utils/spec-lint/ipc');
jest.mock('providers/ReduxStore/slices/collections/actions', () => ({ browseFiles: jest.fn() }));

const collection = { uid: 'c1', pathname: '/c' };

const renderTab = () => {
  const store = configureStore({
    reducer: {
      specLint,
      collections: () => ({ collections: [collection] }),
      app: () => ({ preferences: {} })
    }
  });
  render(
    <ThemeContext.Provider value={{ theme: themes.light }}>
      <ThemeProvider theme={themes.light}>
        <Provider store={store}>
          <ApiSpecs collection={collection} />
        </Provider>
      </ThemeProvider>
    </ThemeContext.Provider>
  );
  return store;
};

beforeEach(() => {
  jest.resetAllMocks();
  getSpecSummary.mockResolvedValue({ ok: false, error: 'x' });
});

it('reads the file when the tab is shown and again on Reload', async () => {
  readBindings.mockResolvedValue({ data: { specs: ['a.yaml'], bindings: {} }, error: null });
  renderTab();
  await waitFor(() => expect(readBindings).toHaveBeenCalledTimes(1));
  readBindings.mockResolvedValue({ data: { specs: ['a.yaml', 'from-git.yaml'], bindings: {} }, error: null });
  fireEvent.click(screen.getByText('Reload'));
  expect(await screen.findByText('from-git.yaml')).toBeInTheDocument();
  expect(readBindings).toHaveBeenCalledTimes(2);
});

const bound = (spec, n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`r${i}.yml`, { spec, method: 'GET', path: `/p${i}` }]));

it('Remove asks first and says how many bound requests will be unbound (data-safety-ipc F2, design-and-ux F3)', async () => {
  readBindings.mockResolvedValue({ data: { specs: ['specs/example-a.yaml'], bindings: bound('specs/example-a.yaml', 3) }, error: null });
  updateBindings.mockResolvedValue({ specs: [], bindings: {} });
  renderTab();
  fireEvent.click(await screen.findByText('Remove'));
  expect(screen.getByText('Remove example-a.yaml? 3 bound requests will be unbound.')).toBeInTheDocument();
  expect(updateBindings).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Cancel'));
  expect(updateBindings).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByText(/bound requests will be unbound/)).toBeNull());

  fireEvent.click(screen.getByText('Remove'));
  fireEvent.click(await screen.findByTestId('modal-submit-btn'));
  await waitFor(() => expect(updateBindings).toHaveBeenCalledWith({ collectionPath: '/c', op: { type: 'removeSpec', storedPath: 'specs/example-a.yaml' } }));
});

it('Replace file sends a replaceSpec operation for the picked file', async () => {
  readBindings.mockResolvedValue({ data: { specs: ['specs/LM_241.yaml'], bindings: bound('specs/LM_241.yaml', 2) }, error: null });
  updateBindings.mockResolvedValue({ specs: ['specs/LM_242.yaml'], bindings: bound('specs/LM_242.yaml', 2) });
  browseFiles.mockReturnValue(() => Promise.resolve(['/c/specs/LM_242.yaml']));
  toStoredPath.mockResolvedValue({ storedPath: 'specs/LM_242.yaml', insideYmlCollection: false });
  renderTab();
  fireEvent.click(await screen.findByText('Replace file…'));
  await waitFor(() =>
    expect(updateBindings).toHaveBeenCalledWith({ collectionPath: '/c', op: { type: 'replaceSpec', storedPath: 'specs/LM_241.yaml', newStoredPath: 'specs/LM_242.yaml' } })
  );
});

it('warns about a .yml file inside a YAML collection with the new wording, and adds it after Add anyway', async () => {
  readBindings.mockResolvedValue({ data: { specs: [], bindings: {} }, error: null });
  updateBindings.mockResolvedValue({ specs: ['specs/a.yml'], bindings: {} });
  browseFiles.mockReturnValue(() => Promise.resolve(['/c/specs/a.yml']));
  toStoredPath.mockResolvedValue({ storedPath: 'specs/a.yml', insideYmlCollection: true });
  renderTab();
  await waitFor(() => expect(screen.getByTestId('api-specs-add')).not.toBeDisabled());
  fireEvent.click(screen.getByTestId('api-specs-add'));
  expect(await screen.findByText('Bruno reads every .yml file in this folder as a request. Add it anyway?')).toBeInTheDocument();
  expect(updateBindings).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Add anyway'));
  await waitFor(() => expect(updateBindings).toHaveBeenCalledWith({ collectionPath: '/c', op: { type: 'addSpec', storedPath: 'specs/a.yml' } }));
});

it('shows the file name and the full title of each spec', async () => {
  readBindings.mockResolvedValue({ data: { specs: ['../specs/example-a.yaml'], bindings: {} }, error: null });
  getSpecSummary.mockResolvedValue({ ok: true, title: 'Example Limit API', specVersion: '1.0.0', version: '3.0', operations: [] });
  renderTab();
  expect(await screen.findByText('Example Limit API')).toBeInTheDocument();
  expect(screen.getByText('example-a.yaml')).toBeInTheDocument();
});
