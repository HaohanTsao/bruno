const Ajv = require('ajv');
const Ajv2020 = require('ajv/dist/2020');
const { ownerSpecOf, ALT_SUFFIX } = require('./schema');

// verbose: errors carry parentSchema, the schema object the failing keyword belongs to.
const ajvOptions = { strict: false, allErrors: true, verbose: true, validateFormats: false, addUsedSchema: false };
const ajvClasses = { '3.0': Ajv, '3.1': Ajv2020 };

// One Ajv instance per loaded spec object, so replacing a spec (spec-cache reload) makes the old
// instance, its schema cache and its compiled validators unreachable. Schemas that did not come
// from getRequestSchema (tests) get an instance of their own.
// WeakMap<spec | schema, { '3.0'?: Ajv, '3.1'?: Ajv2020 }>
const ajvOwners = new WeakMap();

const getAjv = (schema, version) => {
  const owner = ownerSpecOf(schema) || schema;
  let byVersion = ajvOwners.get(owner);
  if (!byVersion) {
    byVersion = {};
    ajvOwners.set(owner, byVersion);
  }
  if (!byVersion[version]) {
    byVersion[version] = new ajvClasses[version](ajvOptions);
  }
  return byVersion[version];
};

// Compiled validators per version and schema object. A schema that failed to compile maps to null.
const compiled = {
  '3.0': new WeakMap(),
  '3.1': new WeakMap()
};

const KEPT_KEYWORDS = new Set(['required', 'enum', 'type']);
// Conditional and "at least one" rules: an error below them does not mean the value is wrong.
const DROPPED_KEYWORDS = new Set([
  'oneOf', 'anyOf', 'not', 'if', 'then', 'else', 'contains', 'propertyNames', 'dependentSchemas',
  'dependentRequired', 'dependencies', 'unevaluatedProperties', 'unevaluatedItems'
]);
const NAME_CONTAINERS = new Set(['properties', 'patternProperties', '$defs', 'definitions']);

const getValidator = (schema, version) => {
  const cache = compiled[version];
  if (cache.has(schema)) {
    return cache.get(schema);
  }
  let validate = null;
  try {
    validate = getAjv(schema, version).compile(schema);
  } catch (err) {
    console.warn(`Spec lint: could not compile schema, skipping validation: ${err.message}`);
  }
  cache.set(schema, validate);
  return validate;
};

// A schemaPath segment is a keyword unless it is a property (or definition) name.
const passesThroughDroppedKeyword = (schemaPath) => {
  const segments = schemaPath.split('/');
  return segments.some((segment, i) => !NAME_CONTAINERS.has(segments[i - 1]) && DROPPED_KEYWORDS.has(segment));
};

// Every schema node inside a definition that is only reached through a dropped keyword (see
// schema.js). Ajv compiles a definition that contains refs as a function of its own, and the
// schemaPath of its errors starts over, so those errors are recognized by their parentSchema instead.
const altNodes = new WeakMap();

const getAltNodes = (schema) => {
  let nodes = altNodes.get(schema);
  if (!nodes) {
    nodes = new WeakSet();
    const collect = (node) => {
      if (node === null || typeof node !== 'object' || nodes.has(node)) {
        return;
      }
      nodes.add(node);
      Object.values(node).forEach(collect);
    };
    for (const container of [schema.definitions, schema.$defs]) {
      for (const [name, def] of Object.entries(container || {})) {
        if (name.endsWith(ALT_SUFFIX)) {
          collect(def);
        }
      }
    }
    altNodes.set(schema, nodes);
  }
  return nodes;
};

const valueAt = (root, instancePath) => {
  let cur = root;
  if (instancePath === '') {
    return cur;
  }
  for (const raw of instancePath.slice(1).split('/')) {
    cur = cur[raw.replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  return cur;
};

const typeOf = (value) => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
};

const validateValue = (schema, version, value) => {
  const validate = getValidator(schema, version);
  if (!validate || validate(value)) {
    return [];
  }

  const alt = getAltNodes(schema);
  const errors = (validate.errors || []).filter((err) => KEPT_KEYWORDS.has(err.keyword) && !passesThroughDroppedKeyword(err.schemaPath) && !alt.has(err.parentSchema));
  const typeErrorPaths = new Set(errors.filter((err) => err.keyword === 'type').map((err) => err.instancePath));

  const result = [];
  const seen = new Set();
  const requiredByPath = new Map();
  const push = (entry) => {
    const key = JSON.stringify(entry);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(entry);
    }
  };
  for (const err of errors) {
    if (err.keyword === 'required') {
      let entry = requiredByPath.get(err.instancePath);
      if (!entry) {
        entry = { kind: 'required', instancePath: err.instancePath, missing: [] };
        requiredByPath.set(err.instancePath, entry);
        result.push(entry);
      }
      if (!entry.missing.includes(err.params.missingProperty)) {
        entry.missing.push(err.params.missingProperty);
      }
    } else if (err.keyword === 'enum') {
      if (!typeErrorPaths.has(err.instancePath)) {
        // null counts as absent, so it is not offered as a choice unless it is the only one.
        const allowed = err.params.allowedValues.filter((v) => v !== null);
        push({ kind: 'enum', instancePath: err.instancePath, allowed: allowed.length ? allowed : [null] });
      }
    } else {
      const types = [].concat(err.params.type).flatMap((t) => String(t).split(','));
      const expected = types.filter((t) => t !== 'null').join(' or ') || 'null';
      push({ kind: 'type', instancePath: err.instancePath, expected, actual: typeOf(valueAt(value, err.instancePath)) });
    }
  }
  return result;
};

module.exports = { validateValue };
