/**
 * Resolves an internal JSON pointer reference (`#/a/b`) against `root`. Returns undefined when the
 * reference is external, malformed or does not lead anywhere. Never walks the prototype chain.
 */
const resolvePointer = (root, ref) => {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) {
    return undefined;
  }
  let cur = root;
  try {
    for (const raw of ref.slice(2).split('/')) {
      const part = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~');
      if (cur === null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, part)) {
        return undefined;
      }
      cur = cur[part];
    }
  } catch {
    return undefined;
  }
  return cur;
};

module.exports = { resolvePointer };
