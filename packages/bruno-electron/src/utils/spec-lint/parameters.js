const { resolveRefChain, typeLabel } = require('./schema');

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isPrimitive = (value) => value === null || ['string', 'number', 'boolean'].includes(typeof value);

// The schema of a parameter: `schema`, or the schema of its first `content` entry.
const parameterSchema = (root, parameter) => {
  if (parameter.schema !== undefined) {
    return resolveRefChain(root, parameter.schema);
  }
  const media = isObject(parameter.content) ? Object.values(parameter.content)[0] : undefined;
  return isObject(media) ? resolveRefChain(root, media.schema) : undefined;
};

// Merges a schema with its allOf members, first one wins, so that type, enum, default and description are found.
const flatten = (root, schema, seen = new Set()) => {
  if (!isObject(schema) || seen.has(schema)) {
    return {};
  }
  seen.add(schema);
  const out = { ...schema };
  for (const member of Array.isArray(schema.allOf) ? schema.allOf : []) {
    const flat = flatten(root, resolveRefChain(root, member), seen);
    for (const key of ['type', 'enum', 'default', 'description', 'items']) {
      if (out[key] === undefined && flat[key] !== undefined) {
        out[key] = flat[key];
      }
    }
  }
  return out;
};

const primitiveEnum = (values) => (Array.isArray(values) ? values.filter(isPrimitive) : []);

const describeParameter = (root, parameter) => {
  const schema = flatten(root, parameterSchema(root, parameter));
  const items = schema.type === 'array' ? flatten(root, resolveRefChain(root, schema.items)) : null;
  const type = items ? `array<${typeLabel(items.type)}>` : typeLabel(schema.type);
  const values = primitiveEnum(items ? items.enum : schema.enum);
  const description = typeof parameter.description === 'string' ? parameter.description : typeof schema.description === 'string' ? schema.description : '';
  return {
    name: parameter.name,
    required: parameter.required === true,
    deprecated: parameter.deprecated === true,
    type,
    // The type of one value, which is what a single query parameter row holds.
    valueType: typeLabel(items ? items.type : schema.type),
    enum: values,
    default: isPrimitive(schema.default) ? schema.default : undefined,
    description
  };
};

/**
 * Lists the query parameters of an operation, path-level ones overridden by operation-level ones of the
 * same name, in declaration order. Returns null when the operation does not exist.
 */
const listQueryParams = (spec, method, path) => {
  const pathItem = isObject(spec.paths) ? spec.paths[path] : undefined;
  const operation = isObject(pathItem) ? pathItem[String(method).toLowerCase()] : undefined;
  if (!isObject(operation)) {
    return null;
  }
  const byName = new Map();
  for (const raw of [...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []), ...(Array.isArray(operation.parameters) ? operation.parameters : [])]) {
    const parameter = resolveRefChain(spec, raw);
    if (isObject(parameter) && parameter.in === 'query' && typeof parameter.name === 'string' && parameter.name !== '') {
      byName.delete(parameter.name);
      byName.set(parameter.name, parameter);
    }
  }
  return [...byName.values()].map((parameter) => describeParameter(spec, parameter));
};

module.exports = { listQueryParams };
