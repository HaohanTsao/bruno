const fs = require('fs');
const { loadSpec } = require('./spec-loader');

// absolutePath -> { mtimeMs, result }
const cache = new Map();

/**
 * Loads a spec file, re-reading and re-parsing it only when its mtime changed. While the mtime is
 * unchanged the very same result object is returned.
 */
const getSpec = (absolutePath) => {
  let mtimeMs;
  try {
    mtimeMs = fs.statSync(absolutePath).mtimeMs;
  } catch {
    cache.delete(absolutePath);
    return { ok: false, error: `Spec file not found: ${absolutePath}` };
  }

  const cached = cache.get(absolutePath);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.result;
  }

  let result;
  try {
    const loaded = loadSpec(fs.readFileSync(absolutePath, 'utf8'));
    result = loaded.ok ? { ...loaded, mtimeMs } : loaded;
  } catch (err) {
    result = { ok: false, error: `Could not read spec: ${err.message}` };
  }
  cache.set(absolutePath, { mtimeMs, result });
  return result;
};

const clearSpecCache = () => {
  cache.clear();
};

module.exports = { getSpec, clearSpecCache };
