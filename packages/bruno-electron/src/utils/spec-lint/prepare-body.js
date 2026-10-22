const { parseTree, getNodeValue } = require('jsonc-parser');

/**
 * Rewrites `text` into a same-length string that jsonc-parser can parse, so node offsets map
 * straight back to the original text. Comments become spaces (newlines kept) and each unquoted
 * `{{var}}` becomes a quoted placeholder of the same length. Every string containing `{{` and every
 * unquoted variable is recorded in `skipped` as a `[start, end)` range of the original text.
 */
const neutralize = (text) => {
  const out = text.split('');
  const skipped = [];
  const n = text.length;
  let i = 0;

  while (i < n) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"' && text[j] !== '\n') {
        j += text[j] === '\\' ? 2 : 1;
      }
      const end = Math.min(j + 1, n);
      if (text.slice(i, end).includes('{{')) {
        skipped.push([i, end]);
      }
      i = end;
    } else if (c === '/' && next === '/') {
      while (i < n && text[i] !== '\n') {
        out[i++] = ' ';
      }
    } else if (c === '/' && next === '*') {
      const close = text.indexOf('*/', i + 2);
      const end = close === -1 ? n : close + 2;
      for (; i < end; i++) {
        if (text[i] !== '\n') {
          out[i] = ' ';
        }
      }
    } else if (c === '{' && next === '{') {
      const close = text.indexOf('}}', i + 2);
      if (close === -1 || text.slice(i, close).includes('\n')) {
        i++;
        continue;
      }
      const end = close + 2;
      out[i] = '"';
      for (let j = i + 1; j < end - 1; j++) {
        out[j] = 'x';
      }
      out[end - 1] = '"';
      skipped.push([i, end]);
      i = end;
    } else {
      i++;
    }
  }

  return { neutral: out.join(''), skipped };
};

// `null` counts as absent: drop null-valued object properties, leave array elements in place.
const dropNullProperties = (value) => {
  if (Array.isArray(value)) {
    return value.map(dropNullProperties);
  }
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (child !== null) {
        out[key] = dropNullProperties(child);
      }
    }
    return out;
  }
  return value;
};

/**
 * Parses a JSON request body that may contain comments, trailing commas and `{{var}}` placeholders.
 */
const prepareBody = (text) => {
  const { neutral, skipped } = neutralize(text);
  const errors = [];
  const tree = parseTree(neutral, errors, { allowTrailingComma: true });
  if (errors.length || !tree) {
    return { ok: false };
  }
  return { ok: true, value: dropNullProperties(getNodeValue(tree)), tree, skipped };
};

module.exports = { prepareBody };
