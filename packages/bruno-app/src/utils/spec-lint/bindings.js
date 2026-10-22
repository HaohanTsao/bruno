// Pure helpers for reading the data of spec-bindings.json: { specs: string[], bindings: { [requestKey]: { spec, method, path } } }.
// Changes to the file are made in the main process (see the update-bindings channel), never from a copy held here.

const toPosix = (value) => value.replace(/\\/g, '/');

/**
 * Key of a request in `bindings`: its path relative to the collection, with forward slashes.
 * Plain string handling on purpose, so it behaves the same on every host OS.
 * Returns null for a request that is not inside the collection folder (for example an unsaved transient request).
 */
export const bindingKey = (collectionPathname, itemPathname) => {
  if (typeof collectionPathname !== 'string' || typeof itemPathname !== 'string') {
    return null;
  }
  const collection = toPosix(collectionPathname);
  const item = toPosix(itemPathname);
  const prefix = collection.endsWith('/') ? collection : `${collection}/`;
  return item.startsWith(prefix) && item.length > prefix.length ? item.slice(prefix.length) : null;
};

const isWellFormedBinding = (binding) =>
  binding !== null
  && typeof binding === 'object'
  && typeof binding.spec === 'string'
  && typeof binding.method === 'string'
  && typeof binding.path === 'string';

/** The binding of a request, or null when there is none or the entry in the file is malformed. */
export const getBinding = (data, key) => {
  if (!data || key === null || key === undefined || !Object.prototype.hasOwnProperty.call(data.bindings, key)) {
    return null;
  }
  const entry = data.bindings[key];
  return isWellFormedBinding(entry) ? entry : null;
};

/** How many requests are bound to a spec (the entries removing the spec takes with it). */
export const countBindingsOf = (data, storedPath) =>
  data ? Object.values(data.bindings).filter((entry) => entry !== null && typeof entry === 'object' && entry.spec === storedPath).length : 0;
