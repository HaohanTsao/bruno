const { resolvePointer } = require('./deref');

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isSchema = (value) => isObject(value) || typeof value === 'boolean';

const JSON_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null']);
const SCHEMA_LISTS = ['allOf', 'oneOf', 'anyOf'];
// Keywords whose errors the checker drops. Refs reached through them point at separate "__alt"
// definitions so that errors found there can be recognized by their schemaPath (see validate.js).
const ALT_CONTEXT_KEYWORDS = ['oneOf', 'anyOf', 'not', 'if', 'then', 'else'];
const ALT_SUFFIX = '__alt';
const NODE_BUDGET = 200000;

class BudgetExceeded extends Error {}

// Stable serialization, so that enum items that only differ in key order count as duplicates.
const canonical = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

const sanitizeType = (type) => {
  const list = Array.isArray(type) ? type : [type];
  if (list.length === 0 || !list.every((t) => typeof t === 'string' && JSON_TYPES.has(t))) {
    return undefined;
  }
  const unique = [...new Set(list)];
  return Array.isArray(type) ? unique : unique[0];
};

const sanitizeEnum = (values) => {
  if (!Array.isArray(values) || values.length === 0) {
    return undefined;
  }
  const seen = new Set();
  return values.filter((value) => {
    const key = canonical(value);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const createContext = (root, version) => ({
  root,
  version,
  container: version === '3.1' ? '$defs' : 'definitions',
  defs: {},
  // variant key -> def name
  defNames: new Map(),
  usedNames: new Set(),
  // def name (or '' for the root) -> refs that are applied in place, without descending into the value
  inPlaceRefs: new Map(),
  queue: [],
  nodes: 0,
  partsMemo: new Map(),
  readOnlyMemo: new Map(),
  readOnlyNamesMemo: new Map(),
  requiredNamesMemo: new Map()
});

const countNode = (ctx) => {
  ctx.nodes += 1;
  if (ctx.nodes > NODE_BUDGET) {
    throw new BudgetExceeded();
  }
};

// Follows a chain of `$ref`s. Returns the first node without one, or undefined when a ref does not
// resolve or the chain loops.
const resolveRefChain = (root, node) => {
  const seen = new Set();
  let cur = node;
  while (isObject(cur) && typeof cur.$ref === 'string') {
    if (seen.has(cur)) {
      return undefined;
    }
    seen.add(cur);
    cur = resolvePointer(root, cur.$ref);
  }
  return cur;
};

/**
 * The source schema plus everything that applies to the same value in place: the target of its
 * `$ref` (the node itself is kept for siblings of the ref) and every allOf member, recursively.
 */
const sourceParts = (ctx, node) => {
  if (ctx.partsMemo.has(node)) {
    return ctx.partsMemo.get(node);
  }
  const parts = [];
  const seen = new Set();
  const visit = (cur) => {
    if (!isObject(cur) || seen.has(cur)) {
      return;
    }
    seen.add(cur);
    parts.push(cur);
    if (typeof cur.$ref === 'string') {
      visit(resolvePointer(ctx.root, cur.$ref));
    }
    if (Array.isArray(cur.allOf)) {
      cur.allOf.forEach(visit);
    }
  };
  visit(node);
  ctx.partsMemo.set(node, parts);
  return parts;
};

const memoized = (memo, node, compute) => {
  if (!memo.has(node)) {
    memo.set(node, compute());
  }
  return memo.get(node);
};

const isReadOnly = (ctx, node) => isObject(node) && memoized(ctx.readOnlyMemo, node, () => sourceParts(ctx, node).some((part) => part.readOnly === true));

// Names of the properties that are readOnly, across the node and its in-place parts.
const readOnlyNames = (ctx, node) => memoized(ctx.readOnlyNamesMemo, node, () => {
  const names = new Set();
  for (const part of sourceParts(ctx, node)) {
    if (isObject(part.properties)) {
      for (const [name, child] of Object.entries(part.properties)) {
        if (isReadOnly(ctx, child)) {
          names.add(name);
        }
      }
    }
  }
  return names;
});

const requiredNames = (ctx, node) => memoized(ctx.requiredNamesMemo, node, () => {
  const names = new Set();
  for (const part of sourceParts(ctx, node)) {
    if (Array.isArray(part.required)) {
      part.required.forEach((name) => names.add(name));
    }
  }
  return names;
});

const allocateName = (ctx, ref, suffix) => {
  const last = ref.split('/').pop() || 'def';
  let base = decodeURIComponent(last.replace(/~1/g, '/').replace(/~0/g, '~')).replace(/[^A-Za-z0-9_.-]/g, '_') || 'def';
  if (base.endsWith(ALT_SUFFIX)) {
    base += '_';
  }
  let name = `${base}${suffix}`;
  for (let i = 2; ctx.usedNames.has(name); i++) {
    name = `${base}_${i}${suffix}`;
  }
  ctx.usedNames.add(name);
  return name;
};

/**
 * Returns the local ref ("#/definitions/X" or "#/$defs/X") for an internal ref, queueing the target
 * for conversion the first time a variant is seen. `alt` marks refs reached through a keyword whose
 * errors are dropped; `hiddenRequired` lists names the enclosing allOf makes readOnly.
 */
const localRef = (ctx, ref, alt, hiddenRequired) => {
  const hidden = [...hiddenRequired].sort();
  const key = `${alt ? 1 : 0}\u0000${ref}\u0000${hidden.join('\u0000')}`;
  let name = ctx.defNames.get(key);
  if (name === undefined) {
    const variant = hidden.length ? `__ro${ctx.defNames.size}` : '';
    name = allocateName(ctx, ref, `${variant}${alt ? ALT_SUFFIX : ''}`);
    ctx.defNames.set(key, name);
    ctx.queue.push({ name, ref, alt, hidden: new Set(hidden) });
  }
  return `#/${ctx.container}/${name}`;
};

/**
 * Converts one OpenAPI schema node into the JSON Schema subset the checker needs. Only structural
 * keywords are kept (type, enum, const, required, properties, items, prefixItems, additionalItems,
 * additionalProperties, allOf, oneOf, anyOf, not, if, then, else), plus description and title for the
 * hover card; everything else (pattern, format, bounds, examples, $id, unknown keywords) is dropped so
 * that one odd keyword cannot stop the operation from compiling. Internal `$ref`s become local refs.
 *
 * `state.owner` is the def being built ('' for the root), `state.inPlace` is true while the node
 * applies to the same value as the def, `state.alt` is true below a keyword whose errors are dropped,
 * and `state.hidden` holds required names an enclosing allOf declares readOnly.
 */
const convert = (ctx, schema, state) => {
  if (typeof schema === 'boolean') {
    return schema;
  }
  if (!isObject(schema)) {
    return {};
  }
  countNode(ctx);
  const { version } = ctx;
  const out = {};

  for (const key of ['title', 'description']) {
    if (typeof schema[key] === 'string') {
      out[key] = schema[key];
    }
  }

  const hasRef = typeof schema.$ref === 'string';
  if (hasRef && resolvePointer(ctx.root, schema.$ref) !== undefined) {
    const hidden = state.hidden.size ? [...state.hidden].filter((name) => requiredNames(ctx, resolvePointer(ctx.root, schema.$ref)).has(name)) : [];
    out.$ref = localRef(ctx, schema.$ref, state.alt, hidden);
    if (state.inPlace) {
      ctx.inPlaceRefs.get(state.owner).push({ node: out, target: out.$ref.split('/').pop() });
    }
  }
  // OpenAPI 3.0 ignores the siblings of a $ref; 3.1 (JSON Schema 2020-12) applies them.
  if (hasRef && version !== '3.1') {
    return out;
  }

  const type = schema.type === undefined ? undefined : sanitizeType(schema.type);
  if (type !== undefined) {
    out.type = type;
    if (version === '3.0' && schema.nullable === true && type !== 'null' && !(Array.isArray(type) && type.includes('null'))) {
      out.type = [...(Array.isArray(type) ? type : [type]), 'null'];
    }
  }
  const values = sanitizeEnum(schema.enum);
  if (values !== undefined) {
    out.enum = values;
  }
  if (Object.prototype.hasOwnProperty.call(schema, 'const')) {
    out.const = schema.const;
  }

  const child = (value, inPlace, alt = state.alt, hidden = new Set()) =>
    convert(ctx, value, { owner: state.owner, inPlace: state.inPlace && inPlace, alt, hidden });

  // Required names an allOf member must not demand: readOnly ones from anywhere in this allOf group.
  const hiddenHere = new Set([...state.hidden, ...readOnlyNames(ctx, schema)]);

  if (isObject(schema.properties)) {
    out.properties = {};
    for (const [name, value] of Object.entries(schema.properties)) {
      out.properties[name] = child(value, false);
    }
  }
  if (Array.isArray(schema.required)) {
    const names = [...new Set(schema.required.filter((name) => typeof name === 'string' && !hiddenHere.has(name)))];
    if (names.length) {
      out.required = names;
    }
  }

  if (Array.isArray(schema.items)) {
    // Tuple form: draft-07 keeps it; 2020-12 spells it prefixItems.
    const tuple = schema.items.map((value) => child(value, false));
    if (version === '3.1') {
      if (!Array.isArray(schema.prefixItems)) {
        out.prefixItems = tuple;
      }
    } else {
      out.items = tuple;
    }
  } else if (isSchema(schema.items)) {
    out.items = child(schema.items, false);
  }
  if (Array.isArray(schema.prefixItems)) {
    out.prefixItems = schema.prefixItems.map((value) => child(value, false));
  }
  if (version !== '3.1' && isSchema(schema.additionalItems)) {
    out.additionalItems = child(schema.additionalItems, false);
  }
  if (isSchema(schema.additionalProperties)) {
    out.additionalProperties = child(schema.additionalProperties, false);
  }

  for (const key of SCHEMA_LISTS) {
    if (Array.isArray(schema[key]) && schema[key].length) {
      const alt = state.alt || ALT_CONTEXT_KEYWORDS.includes(key);
      out[key] = schema[key].map((value) => child(value, true, alt, key === 'allOf' ? hiddenHere : new Set()));
    }
  }
  for (const key of ['not', 'if', 'then', 'else']) {
    if (isSchema(schema[key])) {
      out[key] = child(schema[key], true, true);
    }
  }

  return out;
};

// Turns ref cycles that never descend into the value (A: {allOf: [A]}) into unconstrained schemas;
// Ajv would otherwise recurse until the stack overflows.
const cutInPlaceCycles = (ctx) => {
  const state = new Map();
  const visit = (name) => {
    state.set(name, 'active');
    for (const edge of ctx.inPlaceRefs.get(name) || []) {
      const s = state.get(edge.target);
      if (s === 'active') {
        delete edge.node.$ref;
      } else if (s === undefined) {
        visit(edge.target);
      }
    }
    state.set(name, 'done');
  };
  for (const name of ctx.inPlaceRefs.keys()) {
    if (!state.has(name)) {
      visit(name);
    }
  }
};

const buildSchema = (ctx, schema) => {
  ctx.inPlaceRefs.set('', []);
  // A body schema that is a plain ref is unrolled once, so the root shows its own properties.
  const resolved = typeof schema.$ref === 'string' ? resolveRefChain(ctx.root, schema) : schema;
  const source = isObject(resolved) ? { ...resolved, description: resolved.description ?? schema.description } : {};
  const out = convert(ctx, source, { owner: '', inPlace: true, alt: false, hidden: new Set() });
  while (ctx.queue.length) {
    const { name, ref, alt, hidden } = ctx.queue.shift();
    ctx.inPlaceRefs.set(name, []);
    ctx.defs[name] = convert(ctx, resolvePointer(ctx.root, ref), { owner: name, inPlace: true, alt, hidden });
  }
  cutInPlaceCycles(ctx);
  if (Object.keys(ctx.defs).length) {
    out[ctx.container] = ctx.defs;
  }
  return out;
};

/**
 * Converts an OpenAPI schema into a JSON Schema Ajv can compile. `root` is the document internal
 * `$ref`s resolve against; their targets are attached under `definitions` (3.0) or `$defs` (3.1).
 * Never mutates `schema`.
 */
const toJsonSchema = (schema, version, root = {}) => {
  if (!isObject(schema)) {
    return schema;
  }
  return buildSchema(createContext(root, version), schema);
};

// WeakMap<spec, Map<`${METHOD} ${path}`, schema | null>>
const requestSchemas = new WeakMap();
// WeakMap<schema, spec>: lets validate.js keep one Ajv instance per loaded spec.
const schemaOwners = new WeakMap();
const ownerSpecOf = (schema) => schemaOwners.get(schema);

const isJsonMediaType = (key) => {
  const base = key.split(';')[0].trim().toLowerCase();
  return base === 'application/json' || base.endsWith('+json');
};

const pickJsonSchema = (root, requestBody) => {
  const body = resolveRefChain(root, requestBody);
  const content = isObject(body) && isObject(body.content) ? body.content : null;
  if (!content) {
    return null;
  }
  const keys = Object.keys(content).filter(isJsonMediaType);
  const key = keys.find((k) => k.split(';')[0].trim().toLowerCase() === 'application/json') ?? keys[0];
  const media = key === undefined ? null : content[key];
  return isObject(media) && isObject(media.schema) ? media.schema : null;
};

/**
 * Returns the JSON Schema converted request body schema of an operation, or null when the operation
 * does not exist, has no JSON body, or is too large to check. The same object is returned for
 * repeated calls.
 */
const getRequestSchema = (spec, version, method, path) => {
  let perSpec = requestSchemas.get(spec);
  if (!perSpec) {
    perSpec = new Map();
    requestSchemas.set(spec, perSpec);
  }
  const cacheKey = `${method} ${path}`;
  if (perSpec.has(cacheKey)) {
    return perSpec.get(cacheKey);
  }

  const pathItem = isObject(spec.paths) ? spec.paths[path] : undefined;
  const operation = isObject(pathItem) ? pathItem[String(method).toLowerCase()] : undefined;
  let result = null;
  if (isObject(operation) && operation.requestBody !== undefined) {
    const schema = pickJsonSchema(spec, operation.requestBody);
    try {
      result = schema ? toJsonSchema(schema, version, spec) : null;
      if (result) {
        schemaOwners.set(result, spec);
      }
    } catch (err) {
      if (!(err instanceof BudgetExceeded)) {
        throw err;
      }
      console.warn(`Spec lint: the request schema of ${cacheKey} is too large to check, skipping validation.`);
      result = null;
    }
  }
  perSpec.set(cacheKey, result);
  return result;
};

// The schema itself plus every node that applies to the same value: local ref targets and allOf members.
const collectParts = (root, schema) => {
  const parts = [];
  const seen = new Set();
  const visit = (node) => {
    if (!isObject(node) || seen.has(node)) {
      return;
    }
    seen.add(node);
    parts.push(node);
    if (typeof node.$ref === 'string') {
      visit(resolvePointer(root, node.$ref));
    }
    if (Array.isArray(node.allOf)) {
      node.allOf.forEach(visit);
    }
  };
  visit(schema);
  return parts;
};

const step = (root, schema, segment, seen = new Set()) => {
  const parts = collectParts(root, schema);

  if (typeof segment === 'number') {
    for (const part of parts) {
      if (Array.isArray(part.prefixItems) && segment < part.prefixItems.length) {
        return { schema: part.prefixItems[segment], required: false };
      }
      if (Array.isArray(part.items) && segment < part.items.length) {
        return { schema: part.items[segment], required: false };
      }
      if (isObject(part.items)) {
        return { schema: part.items, required: false };
      }
    }
    return null;
  }

  const required = parts.some((p) => Array.isArray(p.required) && p.required.includes(segment));
  const owner = parts.find((p) => isObject(p.properties) && Object.prototype.hasOwnProperty.call(p.properties, segment));
  if (owner) {
    return { schema: owner.properties[segment], required };
  }

  for (const part of parts) {
    for (const key of ['oneOf', 'anyOf']) {
      for (const branch of Array.isArray(part[key]) ? part[key] : []) {
        if (seen.has(branch)) {
          continue;
        }
        seen.add(branch);
        const found = step(root, branch, segment, seen);
        if (found) {
          return { schema: found.schema, required: required || found.required };
        }
      }
    }
  }
  return null;
};

// A field schema with its local ref resolved: the target's keywords, overridden by the ref's siblings.
const resolveForDisplay = (root, schema, seen = new Set()) => {
  if (!isObject(schema) || typeof schema.$ref !== 'string' || seen.has(schema)) {
    return schema;
  }
  seen.add(schema);
  const { $ref, ...siblings } = schema;
  const target = resolveForDisplay(root, resolvePointer(root, $ref), seen);
  return { ...(isObject(target) ? target : {}), ...siblings };
};

/**
 * Walks `jsonPath` (property names and array indexes) through `schema` (as returned by
 * getRequestSchema) and returns the schema of that field and whether its parent requires it, or null
 * when the path is not described.
 */
const findFieldSchema = (schema, jsonPath) => {
  let current = { schema, required: false };
  for (const segment of jsonPath) {
    current = step(schema, current.schema, segment);
    if (!current) {
      return null;
    }
  }
  return { schema: resolveForDisplay(schema, current.schema), required: current.required };
};

module.exports = { getRequestSchema, toJsonSchema, findFieldSchema, ownerSpecOf, ALT_SUFFIX };
