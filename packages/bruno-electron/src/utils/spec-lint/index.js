const { findNodeAtOffset, findNodeAtLocation, getLocation, getNodePath, parseTree } = require('jsonc-parser');
const { prepareBody, neutralize } = require('./prepare-body');
const { validateValue } = require('./validate');
const { findFieldSchema, listProperties, typeLabel } = require('./schema');
const { urlDiffers } = require('./url-hint');

const unescapePointerSegment = (segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~');

// Walks the parse tree along a JSON pointer. Returns null when a segment has no matching node.
const findNode = (tree, instancePath) => {
  let node = tree;
  if (instancePath === '') {
    return node;
  }
  for (const raw of instancePath.slice(1).split('/')) {
    const segment = unescapePointerSegment(raw);
    if (node.type === 'object') {
      // With duplicate keys the last one wins, as in JSON.parse.
      const property = [...node.children].reverse().find((prop) => prop.children[0].value === segment);
      node = property && property.children[1];
    } else if (node.type === 'array') {
      node = /^\d+$/.test(segment) ? node.children[Number(segment)] : undefined;
    } else {
      node = undefined;
    }
    if (!node) {
      return null;
    }
  }
  return node;
};

const isSkipped = (skipped, node) => skipped.some(([start, end]) => node.offset >= start && node.offset < end);

const formatPath = (jsonPath) =>
  jsonPath.reduce((acc, segment) => (typeof segment === 'number' ? `${acc}[${segment}]` : acc ? `${acc}.${segment}` : segment), '');

const formatValue = (value) => (typeof value === 'string' ? value : JSON.stringify(value));

// CodeMirror drops annotations with the same message on one line, so every message names the field it is about.
const withPath = (message, node) => {
  const label = formatPath(getNodePath(node));
  return label ? `${message} (${label})` : message;
};

const toLintError = (error, node) => {
  if (error.kind === 'required') {
    return { from: node.offset, to: node.offset + 1, message: withPath(`Spec requires: ${error.missing.join(', ')}`, node) };
  }
  const message = error.kind === 'enum' ? `Spec allows: ${error.allowed.map(formatValue).join(', ')}` : `Spec expects ${error.expected}, got ${error.actual}`;
  return { from: node.offset, to: node.offset + node.length, message: withPath(message, node) };
};

/**
 * Checks a JSON request body against a request schema and returns the problems as text ranges.
 * Returns [] when the body does not parse; the editor already shows the syntax error.
 */
const lintBody = (text, ctx) => {
  const prepared = prepareBody(text);
  if (!prepared.ok) {
    return [];
  }

  const { value, tree, skipped } = prepared;
  const errors = [];
  for (const error of validateValue(ctx.schema, ctx.version, value)) {
    const node = findNode(tree, error.instancePath);
    if (!node || isSkipped(skipped, node)) {
      continue;
    }
    if (error.kind !== 'required' && node.type === 'null') {
      continue;
    }
    errors.push(toLintError(error, node));
  }
  return errors.sort((a, b) => a.from - b.from);
};

/**
 * Describes the spec field whose property key is under `offset`.
 * Returns null when the body does not parse, the offset is not on a key, or the spec does not describe the field.
 */
const describeField = (text, offset, ctx) => {
  const prepared = prepareBody(text);
  if (!prepared.ok) {
    return null;
  }

  const keyNode = findNodeAtOffset(prepared.tree, offset);
  if (!keyNode || keyNode.type !== 'string' || !keyNode.parent || keyNode.parent.type !== 'property' || keyNode.parent.children[0] !== keyNode) {
    return null;
  }

  const jsonPath = getNodePath(keyNode);
  const field = findFieldSchema(ctx.schema, jsonPath);
  if (!field) {
    return null;
  }

  const { type, description } = field.schema;
  return {
    from: keyNode.offset,
    to: keyNode.offset + keyNode.length,
    path: formatPath(jsonPath),
    type: typeLabel(type),
    required: field.required,
    description: typeof description === 'string' ? description : ''
  };
};

/**
 * Lists the spec fields that can be typed as a property key at `offset`: the properties of the object the
 * cursor is in, minus the keys that object already has. The body may be half typed. Returns null when
 * `offset` is not where a key goes, or the spec does not describe that object.
 */
const completeKeys = (text, offset, ctx) => {
  const { neutral } = neutralize(text);
  const location = getLocation(neutral, offset);
  if (!location.isAtPropertyKey) {
    return null;
  }
  const objectPath = location.path.slice(0, -1);
  const items = listProperties(ctx.schema, objectPath);
  if (!items) {
    return null;
  }

  // The key being typed is not taken yet; every other key of the object is.
  const tree = parseTree(neutral, [], { allowTrailingComma: true });
  const objectNode = tree ? findNodeAtLocation(tree, objectPath) : undefined;
  const taken = new Set();
  if (objectNode && objectNode.type === 'object') {
    for (const property of objectNode.children || []) {
      const keyNode = property.children && property.children[0];
      if (keyNode && !(offset >= keyNode.offset && offset <= keyNode.offset + keyNode.length)) {
        taken.add(keyNode.value);
      }
    }
  }
  return items.filter((item) => !taken.has(item.name));
};

module.exports = { lintBody, describeField, completeKeys, urlDiffers };
