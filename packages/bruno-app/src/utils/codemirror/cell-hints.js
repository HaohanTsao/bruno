let CodeMirror;
const SERVER_RENDERED = typeof window === 'undefined' || global['PREVENT_CODEMIRROR_RENDER'] === true;
if (!SERVER_RENDERED) {
  CodeMirror = require('codemirror');
}

/**
 * Opens a list under a one-line table cell editor. Picking an entry replaces the whole cell text; typing narrows
 * the list to entries that contain the text. `entries` are show-hint items ({ text, render?, ... }).
 */
export const showCellHints = (cm, entries) => {
  if (!cm || !entries.length || cm.state.completionActive) {
    return;
  }
  cm.showHint({
    completeSingle: false,
    hint: (editor) => {
      const text = editor.getValue();
      const lower = text.toLowerCase();
      const list = entries.filter((entry) => entry.text.toLowerCase().includes(lower));
      return list.length ? { list, from: CodeMirror.Pos(0, 0), to: editor.posFromIndex(text.length) } : null;
    }
  });
};

/**
 * Mouse-up handler for the element around a cell editor: opens the list when the cell is empty, the way the
 * spec hints show what can go there before anything is typed.
 */
export const openCellHintsOnEmpty = (event, entries) => {
  const wrapper = event.currentTarget.querySelector('.CodeMirror');
  const cm = wrapper && wrapper.CodeMirror;
  if (!cm || cm.getValue() !== '' || !entries.length) {
    return;
  }
  // Let the click focus the editor first; show-hint closes on blur.
  setTimeout(() => showCellHints(cm, entries), 0);
};
