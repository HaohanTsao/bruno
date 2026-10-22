import { completeKeysWithSpec } from 'utils/spec-lint/ipc';

let CodeMirror;
const SERVER_RENDERED = typeof window === 'undefined' || global['PREVENT_CODEMIRROR_RENDER'] === true;

// Characters a key is made of, as far as finding the key around the cursor goes.
const KEY_CHAR = /[^\s"{}[\],:]/;
// Keys that start a lookup: a quote or any character a key can hold.
const TRIGGER_KEY = /^[^\s{}[\],:]$/;

// Whether the quote at `index` opens a string: an even number of unescaped quotes comes before it on the line.
const opensString = (line, index) => {
  let count = 0;
  for (let i = 0; i < index; i++) {
    if (line[i] === '\\') {
      i++;
    } else if (line[i] === '"') {
      count++;
    }
  }
  return count % 2 === 0;
};

/**
 * Finds the key being typed around `ch` on `line`. `from`/`to` cover the key including its quotes (when it has
 * them), `prefix` is the part of the key before the cursor. Returns null right after a closing quote.
 */
export const findKeyToken = (line, ch) => {
  let start = ch;
  while (start > 0 && KEY_CHAR.test(line[start - 1])) {
    start--;
  }
  let end = ch;
  while (end < line.length && KEY_CHAR.test(line[end])) {
    end++;
  }
  const quoted = line[start - 1] === '"';
  if (quoted && !opensString(line, start - 1)) {
    return null;
  }
  return {
    from: quoted ? start - 1 : start,
    to: quoted && line[end] === '"' ? end + 1 : end,
    prefix: line.slice(start, ch)
  };
};

/**
 * Keeps the fields whose name contains `prefix` (case-insensitive): names that start with it first, required
 * fields first within each group, otherwise in spec order.
 */
export const filterKeyItems = (items, prefix) => {
  const lower = prefix.toLowerCase();
  const byRequired = (list) => [...list.filter((item) => item.required), ...list.filter((item) => !item.required)];
  const starts = [];
  const contains = [];
  for (const item of items) {
    const name = item.name.toLowerCase();
    if (name.startsWith(lower)) {
      starts.push(item);
    } else if (name.includes(lower)) {
      contains.push(item);
    }
  }
  return [...byRequired(starts), ...byRequired(contains)];
};

export const keyMeta = (item) => [item.type, item.required && 'required', item.deprecated && 'deprecated'].filter(Boolean).join(' · ');

// Everything coming from the spec is set through `textContent`, so a name or description can never inject markup.
export const renderSpecFieldHint = (element, self, data) => {
  const { item } = data;
  element.classList.add('spec-key-hint');
  const name = document.createElement('span');
  name.className = 'spec-key-hint-name';
  name.textContent = item.name;
  const meta = document.createElement('span');
  meta.className = 'spec-key-hint-meta';
  meta.textContent = keyMeta(item);
  element.appendChild(name);
  element.appendChild(meta);
  if (item.description) {
    const description = document.createElement('span');
    description.className = 'spec-key-hint-description';
    description.textContent = item.description;
    element.appendChild(description);
    element.title = item.description;
  }
};

// Writes the picked key with its quotes, and `: ` unless a colon already follows it.
const pickItem = (cm, data, completion) => {
  const after = cm.getLine(data.from.line).slice(data.to.ch);
  const colon = after.match(/^\s*:\s?/);
  const key = JSON.stringify(completion.item.name);
  cm.replaceRange(colon ? key : `${key}: `, data.from, data.to, 'complete');
  if (colon) {
    cm.setCursor({ line: data.from.line, ch: data.from.ch + key.length + colon[0].length });
  }
};

if (!SERVER_RENDERED) {
  CodeMirror = require('codemirror');

  CodeMirror.defineOption('specKeyHints', false, function (cm, enabled, old) {
    if (old && old !== CodeMirror.Init) {
      teardown(cm);
    }
    if (enabled) {
      setup(cm);
    }
  });

  // The hint function of one open list. It filters the fields fetched when the list opened as the key is typed,
  // and returns nothing once the cursor is no longer in that key (show-hint then hides the list).
  const buildHint = (items, keyFrom) => (cm) => {
    const cursor = cm.getCursor();
    const token = findKeyToken(cm.getLine(cursor.line), cursor.ch);
    if (!token || token.from !== keyFrom) {
      return null;
    }
    const list = filterKeyItems(items, token.prefix).map((item) => ({ text: item.name, item, render: renderSpecFieldHint, hint: pickItem }));
    return list.length ? { list, from: CodeMirror.Pos(cursor.line, token.from), to: CodeMirror.Pos(cursor.line, token.to) } : null;
  };

  function setup(cm) {
    const state = (cm.state.specKeyHints = { seq: 0 });

    const request = () => {
      const cursor = cm.getCursor();
      const token = findKeyToken(cm.getLine(cursor.line), cursor.ch);
      const seq = ++state.seq;
      if (!token) {
        return;
      }
      completeKeysWithSpec({ ...cm.specCtx, text: cm.getValue(), offset: cm.indexFromPos(cursor) }).then((items) => {
        if (!items || !items.length || seq !== state.seq || !cm.specCtx || cm.state.completionActive) {
          return;
        }
        // Only open while the cursor is still in the same key.
        const now = cm.getCursor();
        const nowToken = now.line === cursor.line ? findKeyToken(cm.getLine(now.line), now.ch) : null;
        if (!nowToken || nowToken.from !== token.from) {
          return;
        }
        cm.showHint({ hint: buildHint(items, token.from), completeSingle: false, specKeyHints: true });
      }, () => {});
    };

    const onKeyUp = (cm, event) => {
      // Keys pressed while an input method composes text (zhuyin, pinyin, ...) are not typed yet.
      if (!cm.specCtx || event.isComposing || event.keyCode === 229 || !TRIGGER_KEY.test(event.key)) {
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || cm.somethingSelected()) {
        return;
      }
      const active = cm.state.completionActive;
      if (active) {
        // A list of ours keeps updating itself; one that has nothing left to show is closed and asked for again.
        if (!active.options.specKeyHints || active.widget) {
          return;
        }
        active.close();
      }
      request();
    };

    cm.on('keyup', onKeyUp);
    state.dispose = () => {
      state.seq += 1;
      cm.off('keyup', onKeyUp);
    };
  }

  function teardown(cm) {
    const state = cm.state.specKeyHints;
    if (state) {
      state.dispose();
      delete cm.state.specKeyHints;
    }
  }
}
