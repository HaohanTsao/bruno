// Renderer side of the spec-lint IPC channels. Each function unwraps the channel result so callers
// never see channel shapes.

const invoke = (channel, args) => window.ipcRenderer.invoke(channel, args);

const emptyBindings = () => ({ specs: [], bindings: {} });

export const readBindings = async ({ collectionPath }) => {
  const result = await invoke('renderer:spec-lint-read-bindings', { collectionPath });
  if (result.error) {
    return { data: emptyBindings(), error: result.error };
  }
  return { data: { ...emptyBindings(), ...result.data }, error: null };
};

/**
 * Changes spec-bindings.json. The main process re-reads the file, applies `op` ({ type: 'setBinding', key, binding }
 * | { type: 'addSpec', storedPath } | { type: 'removeSpec', storedPath }) to what is on disk, writes it and returns
 * the new data. Throws when the change could not be made.
 */
export const updateBindings = async ({ collectionPath, op }) => {
  const result = await invoke('renderer:spec-lint-update-bindings', { collectionPath, op });
  if (result.error) {
    throw new Error(result.error);
  }
  return { ...emptyBindings(), ...result.data };
};

export const toStoredPath = async ({ collectionPath, absolutePath }) => {
  const result = await invoke('renderer:spec-lint-to-stored-path', { collectionPath, absolutePath });
  if (result.error) {
    throw new Error(result.error);
  }
  return { storedPath: result.storedPath, insideYmlCollection: result.insideYmlCollection };
};

export const getSpecSummary = async ({ collectionPath, specPath }) => {
  const result = await invoke('renderer:spec-lint-spec-summary', { collectionPath, specPath });
  return result.error ? { ok: false, error: result.error } : result;
};

export const lintWithSpec = async (args) => {
  const result = await invoke('renderer:spec-lint-lint', args);
  return Array.isArray(result.errors) ? result.errors : [];
};

/**
 * Whether the operation has a JSON request body in the spec, so there is something to check a body against.
 * Asks the lint channel about an empty object; it answers `missing` when the spec has no JSON body schema for it.
 */
export const operationHasJsonBody = async ({ collectionPath, specPath, method, path }) => {
  const result = await invoke('renderer:spec-lint-lint', { collectionPath, specPath, method, path, text: '{}' });
  return result.missing !== true;
};

export const describeWithSpec = async (args) => {
  const result = await invoke('renderer:spec-lint-describe', args);
  return result.info || null;
};

/** Spec fields that can be typed as a key at `offset` of `text`, or null when `offset` is not where a key goes. */
export const completeKeysWithSpec = async (args) => {
  const result = await invoke('renderer:spec-lint-complete-keys', args);
  return Array.isArray(result.items) ? result.items : null;
};

/** Query parameters of the bound operation, or null when the spec or the operation cannot be found. */
export const getQueryParamsFromSpec = async ({ collectionPath, specPath, method, path }) => {
  const result = await invoke('renderer:spec-lint-query-params', { collectionPath, specPath, method, path });
  return Array.isArray(result.params) ? result.params : null;
};

export const urlDiffersFromSpec = async ({ requestUrl, specOperationPath }) => {
  const result = await invoke('renderer:spec-lint-url-differs', { requestUrl, specOperationPath });
  return result.differs === true;
};
