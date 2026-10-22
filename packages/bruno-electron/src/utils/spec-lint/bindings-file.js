const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BINDINGS_FILE = 'spec-bindings.json';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isString = (value) => typeof value === 'string';

const bindingsFilePath = (collectionPath) => path.join(collectionPath, BINDINGS_FILE);

const isWellFormedBinding = (binding) => isObject(binding) && isString(binding.spec) && isString(binding.method) && isString(binding.path);

// Returns a message when the data cannot be used (or written back) as spec-bindings.json, otherwise null.
const shapeProblem = (data) => {
  if (!isObject(data)) {
    return `${BINDINGS_FILE} must hold a JSON object`;
  }
  if (!Array.isArray(data.specs) || !data.specs.every(isString)) {
    return `${BINDINGS_FILE} has an invalid "specs" (expected a list of paths)`;
  }
  if (!isObject(data.bindings)) {
    return `${BINDINGS_FILE} has an invalid "bindings" (expected an object)`;
  }
  return null;
};

/**
 * Reads spec-bindings.json from the collection root. A missing file reads as empty data; invalid JSON or a
 * wrong shape returns { error } so the file is left for the user to fix. Unknown top-level keys are kept.
 */
const readBindingsFile = (collectionPath) => {
  let text;
  try {
    text = fs.readFileSync(bindingsFilePath(collectionPath), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { data: { specs: [], bindings: {} } };
    }
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return { error: `${BINDINGS_FILE} is not valid JSON` };
  }
  if (!isObject(parsed)) {
    return { error: shapeProblem(parsed) };
  }
  const data = {
    ...parsed,
    specs: parsed.specs === undefined ? [] : parsed.specs,
    bindings: parsed.bindings === undefined ? {} : parsed.bindings
  };
  const problem = shapeProblem(data);
  return problem ? { error: problem } : { data };
};

/**
 * Writes the data atomically: to a temp file next to the target, fsynced, then renamed over it. Refuses data of
 * the wrong shape. Returns { ok: true } or { error }; never throws.
 */
const writeBindingsFile = (collectionPath, data) => {
  const problem = shapeProblem(data);
  if (problem) {
    return { error: problem };
  }
  const target = bindingsFilePath(collectionPath);
  const tempPath = `${target}.tmp-${crypto.randomBytes(6).toString('hex')}`;
  try {
    const fd = fs.openSync(tempPath, 'w');
    try {
      fs.writeSync(fd, JSON.stringify(data, null, 2) + '\n', null, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tempPath, target);
    return { ok: true };
  } catch (err) {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      // nothing more to clean up
    }
    return { error: err.message };
  }
};

// Pure operations on the data. Each returns new data and never mutates its input.
const operations = {
  setBinding: (data, { key, binding }) => {
    if (!isString(key) || key === '') {
      throw new Error('setBinding needs a request key');
    }
    if (binding !== null && !isWellFormedBinding(binding)) {
      throw new Error('setBinding needs a binding with spec, method and path, or null');
    }
    const bindings = { ...data.bindings };
    if (binding) {
      bindings[key] = { spec: binding.spec, method: binding.method, path: binding.path };
    } else {
      delete bindings[key];
    }
    return { ...data, bindings };
  },
  addSpec: (data, { storedPath }) => {
    if (!isString(storedPath) || storedPath === '') {
      throw new Error('addSpec needs a spec path');
    }
    return data.specs.includes(storedPath) ? data : { ...data, specs: [...data.specs, storedPath] };
  },
  // Points a registered spec, and every binding that used it, at another file. Bindings keep method and path.
  replaceSpec: (data, { storedPath, newStoredPath }) => {
    if (!isString(storedPath) || storedPath === '' || !isString(newStoredPath) || newStoredPath === '') {
      throw new Error('replaceSpec needs the old and the new spec path');
    }
    const specs = data.specs.map((spec) => (spec === storedPath ? newStoredPath : spec)).filter((spec, i, all) => all.indexOf(spec) === i);
    const bindings = Object.fromEntries(
      Object.entries(data.bindings).map(([key, binding]) => [key, isObject(binding) && binding.spec === storedPath ? { ...binding, spec: newStoredPath } : binding])
    );
    return { ...data, specs, bindings };
  },
  removeSpec: (data, { storedPath }) => {
    if (!isString(storedPath) || storedPath === '') {
      throw new Error('removeSpec needs a spec path');
    }
    return {
      ...data,
      specs: data.specs.filter((spec) => spec !== storedPath),
      // Malformed entries are never matched, so they stay on disk untouched.
      bindings: Object.fromEntries(Object.entries(data.bindings).filter(([, binding]) => !(isObject(binding) && binding.spec === storedPath)))
    };
  }
};

/**
 * Read-modify-write of spec-bindings.json: re-reads the file, applies one operation to what is on disk, and writes
 * the result. Returns { data } or { error }; nothing is written when the file cannot be read or the operation is invalid.
 */
const updateBindingsFile = (collectionPath, op) => {
  try {
    const apply = op && Object.prototype.hasOwnProperty.call(operations, op.type) ? operations[op.type] : null;
    if (!apply) {
      return { error: 'Unknown spec bindings operation' };
    }
    const current = readBindingsFile(collectionPath);
    if (current.error) {
      return { error: current.error };
    }
    const data = apply(current.data, op);
    const written = writeBindingsFile(collectionPath, data);
    return written.error ? { error: written.error } : { data };
  } catch (err) {
    return { error: err.message };
  }
};

/**
 * Turns an absolute spec path into the path stored in spec-bindings.json: relative to the
 * collection with forward slashes (it may start with ../). Only a path on another Windows drive
 * stays absolute.
 */
const toStoredPath = (collectionPath, absolutePath) => {
  const relative = path.relative(collectionPath, absolutePath);
  const storedPath = (path.isAbsolute(relative) ? absolutePath : relative).replace(/\\/g, '/');
  const inside = !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`);
  // Bruno reads only .yml files of a YAML collection as requests (see hasRequestExtension).
  const insideYmlCollection = inside && /\.yml$/i.test(absolutePath) && fs.existsSync(path.join(collectionPath, 'opencollection.yml'));
  return { storedPath, insideYmlCollection };
};

const resolveSpecPath = (collectionPath, specPath) => path.resolve(collectionPath, specPath);

module.exports = { BINDINGS_FILE, readBindingsFile, writeBindingsFile, updateBindingsFile, toStoredPath, resolveSpecPath };
