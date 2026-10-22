import CodeMirror from 'codemirror';
import 'codemirror/addon/hint/show-hint';
import { completeKeysWithSpec } from 'utils/spec-lint/ipc';
import { findKeyToken, filterKeyItems, keyMeta } from './spec-key-hints';

jest.mock('utils/spec-lint/ipc', () => ({ completeKeysWithSpec: jest.fn() }));

// The real codemirror needs a few layout APIs jsdom does not have.
document.createRange = () => ({
  setStart() {},
  setEnd() {},
  getBoundingClientRect: () => ({ right: 0, left: 0, top: 0, bottom: 0 }),
  getClientRects: () => ({ length: 0, item: () => null })
});

// `|` marks the cursor.
const token = (line) => findKeyToken(line.replace('|', ''), line.indexOf('|'));

describe('findKeyToken', () => {
  it('covers a quoted key, closed or not, and the part typed so far', () => {
    expect(token('  "li|"')).toEqual({ from: 2, to: 6, prefix: 'li' });
    expect(token('  "li|')).toEqual({ from: 2, to: 5, prefix: 'li' });
    expect(token('  "|"')).toEqual({ from: 2, to: 4, prefix: '' });
    expect(token('  "limit-|type": 1')).toEqual({ from: 2, to: 14, prefix: 'limit-' });
  });
  it('covers a bare word and an empty spot', () => {
    expect(token('  li|')).toEqual({ from: 2, to: 4, prefix: 'li' });
    expect(token('  |')).toEqual({ from: 2, to: 2, prefix: '' });
  });
  it('is null right after a closing quote', () => {
    expect(token('  "role"|')).toBeNull();
    expect(token('{"a": "x", "b"|')).toBeNull();
    expect(token('{"a": "x", "|"')).toEqual({ from: 11, to: 13, prefix: '' });
  });
});

describe('filterKeyItems', () => {
  const items = [
    { name: 'limit-reference', required: false },
    { name: 'limit-type', required: true },
    { name: 'credit-limit', required: true },
    { name: 'limit-on', required: true },
    { name: 'currency', required: false }
  ];
  it('puts names that start with the prefix first and required ones first in each group', () => {
    expect(filterKeyItems(items, 'li').map((item) => item.name)).toEqual(['limit-type', 'limit-on', 'limit-reference', 'credit-limit']);
    expect(filterKeyItems(items, 'LIMIT-T').map((item) => item.name)).toEqual(['limit-type']);
  });
  it('lists everything, required first, for an empty prefix', () => {
    expect(filterKeyItems(items, '').map((item) => item.name)).toEqual(['limit-type', 'credit-limit', 'limit-on', 'limit-reference', 'currency']);
  });
});

it('keyMeta shows type, required and deprecated', () => {
  expect(keyMeta({ type: 'integer', required: true, deprecated: false })).toBe('integer · required');
  expect(keyMeta({ type: 'string', required: false, deprecated: true })).toBe('string · deprecated');
});

describe('in the editor', () => {
  const specCtx = { collectionPath: '/c', specPath: 's.yaml', method: 'POST', path: '/v3/limit' };
  const items = [
    { name: 'limit-reference', type: 'string', required: false, description: 'Ref', deprecated: false },
    { name: 'limit-type', type: 'integer', required: true, description: '<b>Type</b>', deprecated: false },
    { name: 'limit-on', type: 'integer', required: true, description: '', deprecated: false }
  ];
  let host;
  let cm;

  const flush = async () => {
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }
  };

  // Puts the text in the editor with the cursor at `|`.
  const makeEditor = (text) => {
    cm = CodeMirror(host, { value: text.replace('|', ''), specKeyHints: true });
    cm.specCtx = specCtx;
    cm.setCursor(cm.posFromIndex(text.indexOf('|')));
    return cm;
  };
  const keyup = (key, extra = {}) => CodeMirror.signal(cm, 'keyup', cm, { key, ...extra });
  const shownNames = () => (cm.state.completionActive && cm.state.completionActive.data ? cm.state.completionActive.data.list.map((hint) => hint.text) : null);

  beforeEach(() => {
    completeKeysWithSpec.mockReset();
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  afterEach(() => {
    cm.closeHint();
    cm.setOption('specKeyHints', false);
    host.remove();
  });

  it('opens the list of fields when a quote is typed where a key goes', async () => {
    completeKeysWithSpec.mockResolvedValue(items);
    makeEditor('{"limit": {"|"}}');
    keyup('"');
    await flush();
    expect(completeKeysWithSpec).toHaveBeenCalledWith({ ...specCtx, text: '{"limit": {""}}', offset: 12 });
    expect(shownNames()).toEqual(['limit-type', 'limit-on', 'limit-reference']);
    const rendered = document.querySelector('.CodeMirror-hints');
    expect(rendered.textContent).toContain('integer · required');
    // Descriptions are text, never markup.
    expect(rendered.querySelector('b')).toBeNull();
  });

  it('picking a field writes the quoted key and a colon', async () => {
    completeKeysWithSpec.mockResolvedValue(items);
    makeEditor('{"limit": {"li|"}}');
    keyup('i');
    await flush();
    const completion = cm.state.completionActive;
    completion.pick(completion.data, 0);
    expect(cm.getValue()).toBe('{"limit": {"limit-type": }}');
    expect(cm.getCursor()).toEqual(expect.objectContaining({ line: 0, ch: 25 }));
  });

  it('keeps an existing colon when the key is replaced', async () => {
    completeKeysWithSpec.mockResolvedValue(items);
    makeEditor('{"limit-o|": 1}');
    keyup('o');
    await flush();
    const completion = cm.state.completionActive;
    completion.pick(completion.data, 0);
    expect(cm.getValue()).toBe('{"limit-on": 1}');
  });

  it('does nothing without a spec, while composing, on modifier shortcuts or when the spec has no list', async () => {
    completeKeysWithSpec.mockResolvedValue(items);
    makeEditor('{"|"}');
    keyup('"', { isComposing: true });
    keyup('a', { ctrlKey: true });
    keyup('Enter');
    cm.specCtx = null;
    keyup('"');
    await flush();
    expect(completeKeysWithSpec).not.toHaveBeenCalled();

    cm.specCtx = specCtx;
    completeKeysWithSpec.mockResolvedValue(null);
    keyup('"');
    await flush();
    expect(cm.state.completionActive).toBeFalsy();
  });

  it('does not open when the cursor left the key before the answer came', async () => {
    let resolve;
    completeKeysWithSpec.mockReturnValue(new Promise((r) => {
      resolve = r;
    }));
    makeEditor('{"a|", "b": 1}');
    keyup('a');
    cm.setCursor({ line: 0, ch: 9 });
    resolve(items);
    await flush();
    expect(cm.state.completionActive).toBeFalsy();
  });
});
