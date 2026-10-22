import React from 'react';
import { render, act } from '@testing-library/react';
import CodeEditor from './index';
import { ThemeProvider } from 'styled-components';
import { formatSize } from 'utils/common';
import { LONG_LINE_LIMIT } from 'utils/common/long-lines';
import darkTheme from 'themes/dark/dark';
import themes from 'themes/index';

const CodeMirror = require('codemirror');

jest.mock('codemirror', () => {
  const codemirror = require('test-utils/mocks/codemirror');
  return codemirror;
});

jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useSelector: jest.fn((selector) => selector({ app: { preferences: {} } }))
}));

jest.mock('providers/ReduxStore', () => ({
  __esModule: true,
  default: {
    dispatch: jest.fn(),
    getState: jest.fn(() => ({})),
    subscribe: jest.fn()
  }
}));

jest.mock('utils/codemirror/autocomplete', () => ({
  setupAutoComplete: jest.fn(() => jest.fn()),
  showRootHints: jest.fn()
}));

jest.mock('utils/codemirror/aiGhostText', () => ({
  setupAiAutocomplete: jest.fn(() => jest.fn())
}));

jest.mock('utils/codemirror/lint-errors', () => ({
  setupLintErrorTooltip: jest.fn(() => jest.fn())
}));

jest.mock('utils/codemirror/resize', () => ({
  setupCodeMirrorResizeRefresh: jest.fn(() => jest.fn())
}));

jest.mock('components/CodeMirrorSearch/searchKeyBindings', () => ({
  buildSearchKeyBindings: jest.fn(() => ({}))
}));

jest.mock('./state-persistence', () => {
  const actual = jest.requireActual('./state-persistence');
  return {
    ...actual,
    applyEditorState: jest.fn(),
    captureEditorState: jest.fn(),
    readPersistedEditorState: jest.fn(),
    writePersistedEditorState: jest.fn()
  };
});

jest.mock('utils/collections', () => ({
  getAllVariables: jest.fn(() => ({}))
}));

jest.mock('utils/common/codemirror', () => ({
  defineCodeMirrorBrunoVariablesMode: jest.fn()
}));

const mockDestroyLinkAware = jest.fn();
const mockResolveLinkClickHandler = jest.fn((item, collection) => (collection?.uid ? jest.fn() : undefined));
jest.mock('utils/codemirror/linkClickHandler', () => ({
  resolveLinkClickHandler: (...args) => mockResolveLinkClickHandler(...args)
}));

const mockSetupLinkAware = jest.fn((editor) => {
  editor._destroyLinkAware = mockDestroyLinkAware;
});
jest.mock('utils/codemirror/linkAware', () => ({
  setupLinkAware: (...args) => mockSetupLinkAware(...args)
}));

const setupEditorWithRef = (props = {}) => {
  const ref = React.createRef();
  const view = render(
    <ThemeProvider theme={darkTheme}>
      <CodeEditor ref={ref} {...props} />
    </ThemeProvider>
  );
  return {
    ref,
    ...view,
    rerender: (nextProps) => view.rerender(
      <ThemeProvider theme={darkTheme}>
        <CodeEditor ref={ref} {...nextProps} />
      </ThemeProvider>
    )
  };
};

const getStatusBarToggle = (view) => view.getByTestId('editor-status-bar-toggle');

const itemA = { uid: 'item-a', type: 'http-request' };
const collectionA = { uid: 'collection-a' };
const itemB = { uid: 'item-b', type: 'graphql-request' };
const collectionB = { uid: 'collection-b' };

const renderEditor = (props) =>
  render(
    <ThemeProvider theme={darkTheme}>
      <CodeEditor value="http://example.test/foo" {...props} />
    </ThemeProvider>
  );

describe('CodeEditor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts in degraded mode for a pathological line', () => {
    const view = setupEditorWithRef({ value: 'x'.repeat(LONG_LINE_LIMIT + 1) });

    expect(CodeMirror).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lineNumbers: false,
        mode: null,
        lint: false,
        autoCloseBrackets: false,
        matchBrackets: false,
        foldGutter: false,
        gutters: []
      })
    );
    expect(view.getByTestId('editor-status-bar')).toHaveTextContent('editor features turned off for performance');
  });

  it('updates status bar byte size when editing while long-line mode stays active', () => {
    const initial = 'x'.repeat(LONG_LINE_LIMIT + 1);
    const next = `${initial}${'y'.repeat(1024)}`;
    const view = setupEditorWithRef({ value: initial, mode: 'application/json' });
    const editor = CodeMirror.mock.results[0].value;
    const changeHandler = editor.on.mock.calls.find(([event]) => event === 'change')[1];

    expect(view.getByTestId('editor-status-bar')).toHaveTextContent(formatSize(initial.length));

    editor._currentValue = next;
    act(() => changeHandler());
    view.rerender({ value: next, mode: 'application/json' });

    expect(view.getByTestId('editor-status-bar')).toHaveTextContent(formatSize(next.length));
  });

  it('enters degraded mode before loading a pathological external value', () => {
    const { rerender } = setupEditorWithRef({ value: 'short', mode: 'application/json' });
    const editor = CodeMirror.mock.results[0].value;

    rerender({ value: 'x'.repeat(LONG_LINE_LIMIT + 1), mode: 'application/json' });

    expect(editor.setOption).toHaveBeenCalledWith('mode', null);
    expect(editor.setOption).toHaveBeenCalledWith('lint', false);
    expect(editor.setValue).toHaveBeenCalledWith('x'.repeat(LONG_LINE_LIMIT + 1));
    const modeCallIndex = editor.setOption.mock.calls.findIndex(([key, value]) => key === 'mode' && value === null);
    expect(editor.setOption.mock.invocationCallOrder[modeCallIndex])
      .toBeLessThan(editor.setValue.mock.invocationCallOrder[0]);
  });

  it('enters degraded mode when a pathological line is pasted', () => {
    const view = setupEditorWithRef({ value: 'short', mode: 'application/json' });
    const editor = CodeMirror.mock.results[0].value;
    const beforeChangeHandler = editor.on.mock.calls.find(([event]) => event === 'beforeChange')[1];
    const changeHandler = editor.on.mock.calls.find(([event]) => event === 'change')[1];

    act(() => {
      beforeChangeHandler(editor, {
        from: { line: 0, ch: 5 },
        to: { line: 0, ch: 5 },
        text: ['x'.repeat(LONG_LINE_LIMIT + 1)]
      });
    });

    expect(editor.setOption).toHaveBeenCalledWith('mode', null);
    expect(editor.setOption).toHaveBeenCalledWith('lint', false);

    editor._currentValue = 'x'.repeat(LONG_LINE_LIMIT + 1);
    act(() => changeHandler());

    expect(editor.options.lint).toBe(false);
    expect(view.getByTestId('editor-status-bar')).toHaveTextContent('editor features turned off for performance');
  });

  it('enables full editor and reverts back via the status bar toggle', () => {
    const value = 'x'.repeat(LONG_LINE_LIMIT + 1);
    const view = setupEditorWithRef({ value, mode: 'application/json' });
    const editor = CodeMirror.mock.results[0].value;

    act(() => {
      getStatusBarToggle(view).click();
    });

    expect(editor.setOption).toHaveBeenCalledWith('mode', 'brunovariables');
    expect(getStatusBarToggle(view)).toHaveTextContent('disable full editor');

    editor.setOption.mockClear();

    act(() => {
      getStatusBarToggle(view).click();
    });

    expect(editor.setOption).toHaveBeenCalledWith('mode', null);
    expect(getStatusBarToggle(view)).toHaveTextContent('enable full editor');
  });

  it('clears the full-editor override when external value changes on the same tab', () => {
    const view = setupEditorWithRef({
      value: 'x'.repeat(LONG_LINE_LIMIT + 1),
      mode: 'application/json'
    });

    act(() => {
      getStatusBarToggle(view).click();
    });
    expect(getStatusBarToggle(view)).toHaveTextContent('disable full editor');

    view.rerender({ value: 'y'.repeat(LONG_LINE_LIMIT + 1), mode: 'application/json' });

    expect(getStatusBarToggle(view)).toHaveTextContent('enable full editor');
  });

  it('clears the full-editor override when the document changes on tab switch', () => {
    const value = 'x'.repeat(LONG_LINE_LIMIT + 1);
    const view = setupEditorWithRef({
      value,
      mode: 'application/json',
      docKey: 'doc-1'
    });

    act(() => {
      getStatusBarToggle(view).click();
    });
    expect(getStatusBarToggle(view)).toHaveTextContent('disable full editor');

    view.rerender({ value, mode: 'application/json', docKey: 'doc-2' });

    expect(getStatusBarToggle(view)).toHaveTextContent('enable full editor');
  });

  it('clears the full-editor override when a forced degrade fires from a paste', () => {
    const view = setupEditorWithRef({ value: 'short', mode: 'application/json' });
    const editor = CodeMirror.mock.results[0].value;
    const beforeChangeHandler = editor.on.mock.calls.find(([event]) => event === 'beforeChange')[1];

    act(() => {
      beforeChangeHandler(editor, {
        from: { line: 0, ch: 5 },
        to: { line: 0, ch: 5 },
        text: ['x'.repeat(LONG_LINE_LIMIT + 1)]
      });
    });

    act(() => {
      getStatusBarToggle(view).click();
    });
    expect(getStatusBarToggle(view)).toHaveTextContent('disable full editor');

    act(() => {
      beforeChangeHandler(editor, {
        from: { line: 0, ch: 0 },
        to: { line: 0, ch: 0 },
        text: ['y'.repeat(LONG_LINE_LIMIT + 1)]
      });
    });

    expect(getStatusBarToggle(view)).toHaveTextContent('enable full editor');
  });

  it('loads a normal external value before restoring enhanced features', () => {
    const { rerender, queryByTestId } = setupEditorWithRef({
      value: 'x'.repeat(LONG_LINE_LIMIT + 1),
      mode: 'application/json'
    });
    const editor = CodeMirror.mock.results[0].value;
    editor.setOption.mockClear();
    editor.setValue.mockClear();

    rerender({ value: 'short', mode: 'application/json' });

    const modeCallIndex = editor.setOption.mock.calls.findIndex(
      ([key, value]) => key === 'mode' && value === 'brunovariables'
    );
    expect(editor.setValue).toHaveBeenCalledWith('short');
    expect(editor.setValue.mock.invocationCallOrder[0])
      .toBeLessThan(editor.setOption.mock.invocationCallOrder[modeCallIndex]);
    expect(queryByTestId('editor-status-bar')).not.toBeInTheDocument();
  });

  it('hides the status bar for short content', () => {
    const view = setupEditorWithRef({ value: 'short', mode: 'application/json' });

    expect(view.queryByTestId('editor-status-bar')).not.toBeInTheDocument();
  });

  describe('link-aware setup', () => {
    it('does not enable click-to-open-request on an editable field', () => {
      renderEditor({ item: itemA, collection: collectionA });

      expect(mockSetupLinkAware).toHaveBeenCalledTimes(1);
      expect(mockSetupLinkAware.mock.calls[0][1].onLinkClick).toBeUndefined();
    });

    it('enables click-to-open-request on a read-only field with a collection', () => {
      renderEditor({ item: itemA, collection: collectionA, readOnly: true });

      expect(mockSetupLinkAware).toHaveBeenCalledTimes(1);
      expect(mockSetupLinkAware.mock.calls[0][1].onLinkClick).toBeDefined();

      mockSetupLinkAware.mock.calls[0][1].onLinkClick('http://example.test/foo');
      expect(mockResolveLinkClickHandler).toHaveBeenLastCalledWith(itemA, collectionA);
    });

    it('does not enable click-to-open-request on a read-only field without a collection', () => {
      renderEditor({ item: itemA, collection: undefined, readOnly: true });

      expect(mockSetupLinkAware).toHaveBeenCalledTimes(1);
      expect(mockSetupLinkAware.mock.calls[0][1].onLinkClick).toBeUndefined();
    });

    it('uses an explicitly provided onLinkClick prop even on an editable field', () => {
      const onLinkClick = jest.fn();
      renderEditor({ item: itemA, collection: collectionA, onLinkClick });

      expect(mockSetupLinkAware).toHaveBeenCalledTimes(1);
      expect(mockSetupLinkAware.mock.calls[0][1].onLinkClick).toBeDefined();

      mockSetupLinkAware.mock.calls[0][1].onLinkClick('http://example.test/foo');
      expect(onLinkClick).toHaveBeenCalledWith('http://example.test/foo');
      expect(mockResolveLinkClickHandler).not.toHaveBeenCalled();
    });

    it('does not reconfigure when item/collection change but stay enabled', () => {
      const { rerender } = renderEditor({ item: itemA, collection: collectionA, readOnly: true });

      expect(mockSetupLinkAware).toHaveBeenCalledTimes(1);

      rerender(
        <ThemeProvider theme={darkTheme}>
          <CodeEditor value="http://example.test/foo" item={itemB} collection={collectionB} readOnly={true} />
        </ThemeProvider>
      );

      expect(mockDestroyLinkAware).not.toHaveBeenCalled();
      expect(mockSetupLinkAware).toHaveBeenCalledTimes(1);
    });

    it('does not reconfigure when item/collection change while staying disabled', () => {
      const { rerender } = renderEditor({ item: itemA, collection: collectionA });

      expect(mockSetupLinkAware).toHaveBeenCalledTimes(1);

      rerender(
        <ThemeProvider theme={darkTheme}>
          <CodeEditor value="http://example.test/foo" item={itemB} collection={collectionB} />
        </ThemeProvider>
      );

      expect(mockDestroyLinkAware).not.toHaveBeenCalled();
      expect(mockSetupLinkAware).toHaveBeenCalledTimes(1);
    });

    it('reconfigures when readOnly flips from false to true', () => {
      const { rerender } = renderEditor({ item: itemA, collection: collectionA });

      expect(mockSetupLinkAware).toHaveBeenCalledTimes(1);
      expect(mockSetupLinkAware.mock.calls[0][1].onLinkClick).toBeUndefined();

      rerender(
        <ThemeProvider theme={darkTheme}>
          <CodeEditor value="http://example.test/foo" item={itemA} collection={collectionA} readOnly={true} />
        </ThemeProvider>
      );

      expect(mockDestroyLinkAware).toHaveBeenCalledTimes(1);
      expect(mockSetupLinkAware).toHaveBeenCalledTimes(2);
      expect(mockSetupLinkAware.mock.calls[1][1].onLinkClick).toBeDefined();
    });

    it('reconfigures once a collection becomes available on a read-only field', () => {
      const { rerender } = renderEditor({ item: itemA, collection: undefined, readOnly: true });

      expect(mockSetupLinkAware).toHaveBeenCalledTimes(1);
      expect(mockSetupLinkAware.mock.calls[0][1].onLinkClick).toBeUndefined();

      rerender(
        <ThemeProvider theme={darkTheme}>
          <CodeEditor value="http://example.test/foo" item={itemA} collection={collectionA} readOnly={true} />
        </ThemeProvider>
      );

      expect(mockDestroyLinkAware).toHaveBeenCalledTimes(1);
      expect(mockSetupLinkAware).toHaveBeenCalledTimes(2);
      expect(mockSetupLinkAware.mock.calls[1][1].onLinkClick).toBeDefined();
    });

    it('tears down and reconfigures when onLinkClick is removed from an editable field', () => {
      const onLinkClick = jest.fn();
      const { rerender } = renderEditor({ item: itemA, collection: collectionA, onLinkClick });

      expect(mockSetupLinkAware).toHaveBeenCalledTimes(1);
      expect(mockSetupLinkAware.mock.calls[0][1].onLinkClick).toBeDefined();

      rerender(
        <ThemeProvider theme={darkTheme}>
          <CodeEditor value="http://example.test/foo" item={itemA} collection={collectionA} />
        </ThemeProvider>
      );

      expect(mockDestroyLinkAware).toHaveBeenCalledTimes(1);
      expect(mockSetupLinkAware).toHaveBeenCalledTimes(2);
      expect(mockSetupLinkAware.mock.calls[1][1].onLinkClick).toBeUndefined();
    });
  });

  describe('lint on mount (editor-integration F3)', () => {
    // The shared CodeMirror mock only covers what the other tests need; any other method is a no-op here.
    const mountWith = (props) => {
      const CM = CodeMirror;
      const original = CM.getMockImplementation();
      CM.mockImplementationOnce((node, options) => {
        const editor = original(node, options);
        editor._currentValue = options.value;
        editor.getWrapperElement = () => document.createElement('div');
        editor.getDoc = () => ({ getValue: () => '', getAllMarks: () => [], getHistory: () => ({}), listSelections: () => [], getCursor: () => ({ line: 0, ch: 0 }) });
        editor.getScrollInfo = () => ({ top: 0, left: 0 });
        editor.getAllMarks = () => [];
        return new Proxy(editor, { get: (target, prop) => (prop in target || typeof prop === 'symbol' ? target[prop] : (target[prop] = jest.fn())) });
      });
      render(
        <ThemeProvider theme={themes.light}>
          <CodeEditor mode="application/ld+json" value='{"a":1}' {...props} />
        </ThemeProvider>
      );
      return CM.mock.results[0].value;
    };

    beforeEach(() => {
      CodeMirror.mockClear();
    });

    it('does not lint a second time on mount when no spec is involved, and keeps the default delay', () => {
      const editor = mountWith({});
      expect(editor.performLint).not.toHaveBeenCalled();
      expect(editor.options.lint.delay).toBeUndefined();
    });

    it('lints on mount and uses the shorter delay when the request is bound to a spec', () => {
      const specCtx = { collectionPath: '/c', specPath: 's.yaml', method: 'POST', path: '/x' };
      const editor = mountWith({ specCtx });
      expect(editor.performLint).toHaveBeenCalledTimes(1);
      expect(editor.options.lint.delay).toBe(300);
      expect(editor.setOption).toHaveBeenCalledWith('lint', expect.objectContaining({ delay: 300 }));
    });
  });
});
