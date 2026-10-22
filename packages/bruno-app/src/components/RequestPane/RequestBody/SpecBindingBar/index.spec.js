import '@testing-library/jest-dom';
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { ThemeProvider } from 'styled-components';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import specLint, { setCollectionSpecData } from 'providers/ReduxStore/slices/spec-lint';
import { ThemeContext } from 'providers/Theme';
import themes from 'themes/index';
import { getSpecSummary, urlDiffersFromSpec, updateBindings, operationHasJsonBody } from 'utils/spec-lint/ipc';
import SpecBindingBar from './index';

jest.mock('utils/spec-lint/ipc');

const collection = { uid: 'c1', pathname: '/c' };
const item = (url = '{{SVC_D}}/v3/limit') => ({
  uid: 'i1',
  pathname: '/c/limit.yml',
  request: { url, body: { mode: 'json', json: '{}' } }
});
const boundData = { specs: ['../example-a.yaml'], bindings: { 'limit.yml': { spec: '../example-a.yaml', method: 'POST', path: '/v3/limit' } } };
const okSummary = (operations) => ({ ok: true, title: 'Example A', specVersion: '1.0.0', version: '3.0', operations });
const limitOp = { method: 'POST', path: '/v3/limit', summary: 'Create limit' };

// Stand-in for the main process: applies the operation to the data the test started with.
let currentData;
const applyOp = (data, op) => {
  if (op.type === 'setBinding') {
    const bindings = { ...data.bindings };
    if (op.binding) {
      bindings[op.key] = op.binding;
    } else {
      delete bindings[op.key];
    }
    return { ...data, bindings };
  }
  return data;
};

const renderBar = ({ data = { specs: [], bindings: {} }, error = null, requestItem = item() } = {}) => {
  currentData = data;
  const store = configureStore({
    reducer: {
      specLint,
      collections: () => ({ collections: [collection] }),
      app: () => ({ preferences: {} })
    }
  });
  store.dispatch(setCollectionSpecData({ collectionUid: 'c1', data, error }));
  return render(
    <ThemeContext.Provider value={{ theme: themes.light }}>
      <ThemeProvider theme={themes.light}>
        <Provider store={store}>
          <SpecBindingBar item={requestItem} collection={collection} />
        </Provider>
      </ThemeProvider>
    </ThemeContext.Provider>
  );
};

beforeEach(() => {
  jest.resetAllMocks();
  getSpecSummary.mockResolvedValue(okSummary([limitOp]));
  urlDiffersFromSpec.mockResolvedValue(false);
  operationHasJsonBody.mockResolvedValue(true);
  updateBindings.mockImplementation(({ op }) => Promise.resolve(applyOp(currentData, op)));
});

it('shows a quiet Choose API when unbound', async () => {
  renderBar();
  expect(screen.getByText('Choose API')).toBeInTheDocument();
  expect(screen.queryByText(/not found|no match/i)).toBeNull();
});

it('shows the bound operation and file name', async () => {
  getSpecSummary.mockResolvedValue(okSummary([limitOp]));
  renderBar({ data: boundData });
  expect(await screen.findByText('POST /v3/limit · example-a.yaml')).toBeInTheDocument();
  await waitFor(() => expect(urlDiffersFromSpec).toHaveBeenCalledWith({ requestUrl: '{{SVC_D}}/v3/limit', specOperationPath: '/v3/limit' }));
  expect(screen.queryByText(/URL path differs/)).toBeNull();
});

it('shows the URL hint when the path differs', async () => {
  getSpecSummary.mockResolvedValue(okSummary([limitOp]));
  urlDiffersFromSpec.mockResolvedValue(true);
  renderBar({ data: boundData, requestItem: item('{{SVC_D}}/v2/limit') });
  expect(await screen.findByText('URL path differs from spec: /v3/limit')).toBeInTheDocument();
});

it('shows Binding not found when the operation is missing', async () => {
  getSpecSummary.mockResolvedValue(okSummary([{ method: 'GET', path: '/other', summary: '' }]));
  renderBar({ data: boundData });
  expect(await screen.findByText('Binding not found in spec')).toBeInTheDocument();
  expect(screen.getByText('Change')).toBeInTheDocument();
  expect(screen.getByText('Unbind')).toBeInTheDocument();
});

it('says the spec file was not found, not that the binding is, when the file is missing (design-and-ux F4)', async () => {
  getSpecSummary.mockResolvedValue({ ok: false, error: 'Spec file not found: /abs/dir/example-a.yaml' });
  renderBar({ data: boundData });
  expect(await screen.findByText('Spec file not found: example-a.yaml')).toBeInTheDocument();
  expect(screen.queryByText('Binding not found in spec')).toBeNull();
  expect(screen.getByText('Change')).toBeInTheDocument();
  expect(screen.getByText('Unbind')).toBeInTheDocument();
});

it('shows the loader error when the spec file cannot be read or parsed', async () => {
  getSpecSummary.mockResolvedValue({ ok: false, error: 'Swagger 2.0 is not supported. Use an OpenAPI 3.x spec.' });
  renderBar({ data: boundData });
  expect(await screen.findByText('Swagger 2.0 is not supported. Use an OpenAPI 3.x spec.')).toBeInTheDocument();
  expect(screen.queryByText('Binding not found in spec')).toBeNull();
});

it('says so quietly when the operation has no JSON body in the spec (correctness F6)', async () => {
  operationHasJsonBody.mockResolvedValue(false);
  renderBar({ data: boundData });
  expect(await screen.findByText('This API has no JSON body in the spec')).toBeInTheDocument();
  expect(screen.getByText('POST /v3/limit · example-a.yaml')).toBeInTheDocument();
});

it('does not mention a missing JSON body when the spec has one', async () => {
  renderBar({ data: boundData });
  await screen.findByText('POST /v3/limit · example-a.yaml');
  await waitFor(() => expect(operationHasJsonBody).toHaveBeenCalled());
  expect(screen.queryByText('This API has no JSON body in the spec')).toBeNull();
});

it('shows nothing extra while the summary is loading', () => {
  getSpecSummary.mockReturnValue(new Promise(() => {}));
  renderBar({ data: boundData });
  expect(screen.getByText('POST /v3/limit · example-a.yaml')).toBeInTheDocument();
  expect(screen.queryByText('Binding not found in spec')).toBeNull();
  expect(screen.queryByText(/URL path differs/)).toBeNull();
});

it('Unbind writes the bindings without this request', async () => {
  getSpecSummary.mockResolvedValue(okSummary([limitOp]));
  renderBar({ data: boundData });
  fireEvent.click(await screen.findByText('Unbind'));
  await waitFor(() => expect(updateBindings).toHaveBeenCalledTimes(1));
  expect(updateBindings).toHaveBeenCalledWith({ collectionPath: '/c', op: { type: 'setBinding', key: 'limit.yml', binding: null } });
  expect(await screen.findByText('Choose API')).toBeInTheDocument();
});

it('cannot write while spec-bindings.json is broken', async () => {
  renderBar({ data: boundData, error: 'spec-bindings.json is not valid JSON' });
  await act(async () => {});
  const button = screen.getByText('Choose API');
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('title', 'spec-bindings.json is not valid JSON — fix or delete the file');
  fireEvent.click(button);
  expect(screen.queryByTestId('spec-binding-picker')).toBeNull();
  expect(screen.queryByText('Unbind')).toBeNull();
  expect(updateBindings).not.toHaveBeenCalled();
});

it('says so when no specs are registered', () => {
  renderBar();
  fireEvent.click(screen.getByText('Choose API'));
  expect(screen.getByText('No API specs registered. Add them in Collection Settings → Spec Lint.')).toBeInTheDocument();
});

it('binds a request by picking a spec and an operation, with a filter', async () => {
  const operations = [
    { method: 'POST', path: '/v3/limit', summary: 'Create limit' },
    { method: 'GET', path: '/v3/limit/{id}', summary: 'Read limit' },
    { method: 'GET', path: '/v3/other', summary: '' }
  ];
  getSpecSummary.mockImplementation(({ specPath }) => Promise.resolve(specPath === 'bad.yaml' ? { ok: false, error: 'x' } : okSummary(operations)));
  renderBar({ data: { specs: ['../example-a.yaml', 'bad.yaml'], bindings: {} } });
  fireEvent.click(screen.getByText('Choose API'));
  const specButton = await screen.findByText('Example A 1.0.0');
  expect(screen.getByText('bad.yaml').closest('button')).toBeDisabled();
  fireEvent.click(specButton);
  fireEvent.change(screen.getByPlaceholderText('Filter'), { target: { value: 'read' } });
  expect(screen.queryByText('/v3/other')).toBeNull();
  fireEvent.click(screen.getByText('/v3/limit/{id} — Read limit'));
  await waitFor(() => expect(updateBindings).toHaveBeenCalledTimes(1));
  expect(updateBindings).toHaveBeenCalledWith({
    collectionPath: '/c',
    op: { type: 'setBinding', key: 'limit.yml', binding: { spec: '../example-a.yaml', method: 'GET', path: '/v3/limit/{id}' } }
  });
});

const clickLikeUser = (element) => {
  fireEvent.mouseDown(element);
  fireEvent.mouseUp(element);
  fireEvent.click(element);
};

it('closes the picker when Choose API is clicked a second time', async () => {
  renderBar({ data: { specs: ['../example-a.yaml'], bindings: {} } });
  clickLikeUser(screen.getByText('Choose API'));
  expect(await screen.findByTestId('spec-binding-picker')).toBeInTheDocument();
  clickLikeUser(screen.getByText('Choose API'));
  expect(screen.queryByTestId('spec-binding-picker')).toBeNull();
});

it('closes the picker when Change is clicked a second time', async () => {
  renderBar({ data: boundData });
  await screen.findByText('POST /v3/limit · example-a.yaml');
  clickLikeUser(screen.getByText('Change'));
  expect(await screen.findByTestId('spec-binding-picker')).toBeInTheDocument();
  clickLikeUser(screen.getByText('Change'));
  expect(screen.queryByTestId('spec-binding-picker')).toBeNull();
});

it('still closes the picker when clicking elsewhere', async () => {
  renderBar({ data: { specs: ['../example-a.yaml'], bindings: {} } });
  clickLikeUser(screen.getByText('Choose API'));
  expect(await screen.findByTestId('spec-binding-picker')).toBeInTheDocument();
  fireEvent.mouseDown(document.body);
  expect(screen.queryByTestId('spec-binding-picker')).toBeNull();
});

it('shows Choose API instead of crashing when the binding entry is malformed', async () => {
  renderBar({ data: { specs: [], bindings: { 'limit.yml': { method: 'POST', path: '/v3/limit' } } } });
  expect(screen.getByText('Choose API')).toBeInTheDocument();
  expect(screen.queryByText('Unbind')).toBeNull();
});

it('renders nothing for a transient request outside the collection folder', () => {
  renderBar({ requestItem: { ...item(), pathname: '/tmp/userData/tmp/transient/bruno-abc/Untitled 1.yml' } });
  expect(screen.queryByTestId('spec-binding-bar')).toBeNull();
  expect(screen.queryByText('Choose API')).toBeNull();
});

it('lists every operation of a large spec and shows file names under spec titles (design-and-ux F6)', async () => {
  const operations = Array.from({ length: 583 }, (_, i) => ({ method: 'GET', path: `/v1/item${String(i).padStart(4, '0')}`, summary: '' }));
  operations.push({ method: 'POST', path: '/v3/limit', summary: 'Create limit' });
  getSpecSummary.mockResolvedValue({ ...okSummary(operations), title: 'Example Customer API' });
  renderBar({ data: { specs: ['../specs/example-b.yaml'], bindings: {} } });
  fireEvent.click(screen.getByText('Choose API'));
  const title = await screen.findByText('Example Customer API 1.0.0');
  expect(screen.getByText('example-b.yaml')).toBeInTheDocument();
  fireEvent.click(title);
  expect(await screen.findByText('/v3/limit — Create limit')).toBeInTheDocument();
  expect(screen.queryByText(/Showing the first/)).toBeNull();
  expect(document.querySelectorAll('.picker-item')).toHaveLength(584);
});
