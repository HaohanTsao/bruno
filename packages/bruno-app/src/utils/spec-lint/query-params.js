// Pure helpers for the spec hints of the query params table. A spec parameter is what the
// renderer:spec-lint-query-params channel returns: { name, required, deprecated, type, valueType, enum, default, description }.

/** The values a parameter allows, as text: its enum, or true and false for a boolean. Empty when any value goes. */
export const valueChoices = (param) => {
  if (!param) {
    return [];
  }
  if (param.enum.length) {
    return param.enum.map((value) => (value === null ? 'null' : String(value)));
  }
  return param.valueType === 'boolean' ? ['true', 'false'] : [];
};

/** Required parameters that no enabled row sets. */
export const missingRequired = (specParams, rows) =>
  specParams.filter((param) => param.required && !rows.some((row) => row.enabled && row.name === param.name));

/**
 * Rows with every missing required parameter added: a disabled row of that name is enabled, otherwise a row is
 * appended with the spec default as its value (empty when there is none).
 */
export const withRequiredAdded = (specParams, rows) => {
  const missing = new Set(missingRequired(specParams, rows).map((param) => param.name));
  const enabled = new Set();
  const updated = rows.map((row) => {
    if (missing.has(row.name) && !row.enabled && !enabled.has(row.name)) {
      enabled.add(row.name);
      return { ...row, enabled: true };
    }
    return row;
  });
  const added = specParams
    .filter((param) => missing.has(param.name) && !enabled.has(param.name))
    .map((param) => ({
      name: param.name,
      value: param.default === undefined || param.default === null ? '' : String(param.default),
      description: '',
      enabled: true,
      type: 'query'
    }));
  return [...updated, ...added];
};

/** Spec parameters no row uses yet, the ones a name cell can still offer. */
export const unusedParams = (specParams, rows, ownName = '') =>
  specParams.filter((param) => param.name === ownName || !rows.some((row) => row.name === param.name));
