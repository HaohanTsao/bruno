const yaml = require('js-yaml');

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head', 'trace'];

const YAML_SCHEMA = yaml.CORE_SCHEMA.extend({ implicit: [yaml.types.merge] });

const parseText = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    // CORE_SCHEMA keeps unquoted timestamps as strings; merge keys are still resolved.
    return yaml.load(text, { schema: YAML_SCHEMA });
  }
};

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const listOperations = (paths) => {
  const operations = [];
  if (!isObject(paths)) {
    return operations;
  }
  for (const path of Object.keys(paths)) {
    const item = paths[path];
    if (!isObject(item)) {
      continue;
    }
    for (const method of HTTP_METHODS) {
      if (isObject(item[method])) {
        const summary = typeof item[method].summary === 'string' ? item[method].summary : '';
        operations.push({ method: method.toUpperCase(), path, summary });
      }
    }
  }
  return operations.sort((a, b) => {
    if (a.path !== b.path) {
      return a.path < b.path ? -1 : 1;
    }
    return a.method < b.method ? -1 : a.method > b.method ? 1 : 0;
  });
};

/**
 * Parses an OpenAPI 3.x spec (JSON or YAML text) and lists its operations. Does not expand `$ref`s.
 */
const loadSpec = (text) => {
  let spec;
  try {
    spec = parseText(text);
  } catch (err) {
    return { ok: false, error: `Could not parse spec: ${err.message}` };
  }

  if (isObject(spec) && spec.swagger !== undefined) {
    return { ok: false, error: 'Swagger 2.0 is not supported. Use an OpenAPI 3.x spec.' };
  }
  if (!isObject(spec) || typeof spec.openapi !== 'string' || !spec.openapi.startsWith('3.')) {
    return { ok: false, error: 'Not an OpenAPI 3.x spec (missing "openapi: 3.x").' };
  }

  const info = isObject(spec.info) ? spec.info : {};
  return {
    ok: true,
    spec,
    version: spec.openapi.startsWith('3.1') ? '3.1' : '3.0',
    title: typeof info.title === 'string' ? info.title : '',
    specVersion: info.version === undefined || info.version === null ? '' : String(info.version),
    operations: listOperations(spec.paths)
  };
};

module.exports = { loadSpec };
