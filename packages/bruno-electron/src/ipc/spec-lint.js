const { ipcMain } = require('electron');
const { getSpec } = require('../utils/spec-lint/spec-cache');
const { getRequestSchema } = require('../utils/spec-lint/schema');
const { lintBody, describeField, urlDiffers } = require('../utils/spec-lint');
const { readBindingsFile, updateBindingsFile, toStoredPath, resolveSpecPath } = require('../utils/spec-lint/bindings-file');

// Registers a handler that never throws: any failure comes back as { error }.
const handle = (channel, fn) => {
  ipcMain.handle(channel, async (event, args) => {
    try {
      return await fn(args || {});
    } catch (err) {
      return { error: err.message };
    }
  });
};

// Loads the spec and its request schema for an operation, or null when either is unavailable.
const loadContext = ({ collectionPath, specPath, method, path }) => {
  const loaded = getSpec(resolveSpecPath(collectionPath, specPath));
  if (!loaded.ok) {
    return null;
  }
  const schema = getRequestSchema(loaded.spec, loaded.version, method, path);
  return schema ? { schema, version: loaded.version } : null;
};

const registerSpecLintIpc = () => {
  handle('renderer:spec-lint-read-bindings', ({ collectionPath }) => readBindingsFile(collectionPath));

  handle('renderer:spec-lint-update-bindings', ({ collectionPath, op }) => updateBindingsFile(collectionPath, op));

  handle('renderer:spec-lint-to-stored-path', ({ collectionPath, absolutePath }) => toStoredPath(collectionPath, absolutePath));

  handle('renderer:spec-lint-spec-summary', ({ collectionPath, specPath }) => {
    const loaded = getSpec(resolveSpecPath(collectionPath, specPath));
    if (!loaded.ok) {
      return { ok: false, error: loaded.error };
    }
    const { title, specVersion, version, operations } = loaded;
    return { ok: true, title, specVersion, version, operations };
  });

  handle('renderer:spec-lint-lint', ({ text, ...target }) => {
    const ctx = loadContext(target);
    return ctx ? { errors: lintBody(text, ctx) } : { missing: true };
  });

  handle('renderer:spec-lint-describe', ({ text, offset, ...target }) => {
    const ctx = loadContext(target);
    return { info: ctx ? describeField(text, offset, ctx) : null };
  });

  handle('renderer:spec-lint-url-differs', ({ requestUrl, specOperationPath }) => ({ differs: urlDiffers(requestUrl, specOperationPath) }));
};

module.exports = { registerSpecLintIpc };
