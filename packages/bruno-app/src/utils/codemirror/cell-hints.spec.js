import CodeMirror from 'codemirror';
import 'codemirror/addon/hint/show-hint';
import { openCellHintsOnEmpty, showCellHints } from './cell-hints';

document.createRange = () => ({
  setStart() {},
  setEnd() {},
  getBoundingClientRect: () => ({ right: 0, left: 0, top: 0, bottom: 0 }),
  getClientRects: () => ({ length: 0, item: () => null })
});

let host;
let cm;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  cm.closeHint();
  host.remove();
});

const shown = () => (cm.state.completionActive && cm.state.completionActive.data ? cm.state.completionActive.data.list.map((e) => e.text) : null);

it('lists the entries that contain the cell text and picking replaces the whole text', () => {
  cm = CodeMirror(host, { value: 'ad' });
  showCellHints(cm, [{ text: 'admin' }, { text: 'editor' }, { text: 'read' }]);
  expect(shown()).toEqual(['admin', 'read']);
  const completion = cm.state.completionActive;
  completion.pick(completion.data, 0);
  expect(cm.getValue()).toBe('admin');
});

it('opens on mouse-up only when the cell is empty', () => {
  jest.useFakeTimers();
  cm = CodeMirror(host, { value: '' });
  const event = { currentTarget: host };
  openCellHintsOnEmpty(event, [{ text: 'admin' }]);
  jest.runAllTimers();
  expect(shown()).toEqual(['admin']);
  cm.closeHint();

  cm.setValue('x');
  openCellHintsOnEmpty(event, [{ text: 'admin' }]);
  jest.runAllTimers();
  expect(cm.state.completionActive).toBeFalsy();
  jest.useRealTimers();
});
