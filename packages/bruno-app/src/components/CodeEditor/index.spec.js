import React from 'react';
import { render, act } from '@testing-library/react';
import CodeMirror from 'codemirror';
import CodeEditor from './index';
import { ThemeProvider } from 'styled-components';
import themes from 'themes/index';

jest.mock('codemirror', () => {
  const codemirror = require('test-utils/mocks/codemirror');
  return codemirror;
});

const MOCK_THEME = {
  codemirror: {
    bg: '#1e1e1e',
    border: '#333'
  },
  textLink: '#007acc'
};

const setupEditorState = (editor, { value, cursorPosition }) => {
  editor._currentValue = value;
  editor.getCursor.mockReturnValue({ line: 0, ch: cursorPosition });
  editor.getRange.mockImplementation((from, to) => {
    if (from.line === 0 && from.ch === 0 && to.line === 0 && to.ch === cursorPosition) {
      return value;
    }
    return editor._currentValue.slice(from.ch, to.ch);
  });

  editor.state = {
    completionActive: null
  };
};

const setupEditorWithRef = () => {
  const ref = React.createRef();
  const { rerender } = render(
    <ThemeProvider theme={MOCK_THEME}>
      <CodeEditor ref={ref} />
    </ThemeProvider>
  );
  return { ref, rerender };
};

describe('CodeEditor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('add CodeEditor related tests here', () => {});

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
