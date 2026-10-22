import { missingRequired, unusedParams, valueChoices, withRequiredAdded } from './query-params';

const param = (name, extra = {}) => ({ name, required: false, deprecated: false, type: 'string', valueType: 'string', enum: [], default: undefined, description: '', ...extra });

describe('valueChoices', () => {
  it('lists the enum as text, true and false for a boolean, nothing otherwise', () => {
    expect(valueChoices(param('role', { enum: ['admin', 1, null] }))).toEqual(['admin', '1', 'null']);
    expect(valueChoices(param('flag', { type: 'boolean', valueType: 'boolean' }))).toEqual(['true', 'false']);
    expect(valueChoices(param('q'))).toEqual([]);
    expect(valueChoices(undefined)).toEqual([]);
  });
});

describe('required parameters', () => {
  const specParams = [param('page', { required: true, default: 1 }), param('size', { required: true }), param('sort')];

  it('counts a required parameter as missing unless an enabled row sets it', () => {
    expect(missingRequired(specParams, [{ name: 'page', enabled: true }]).map((p) => p.name)).toEqual(['size']);
    expect(missingRequired(specParams, [{ name: 'page', enabled: false }]).map((p) => p.name)).toEqual(['page', 'size']);
  });

  it('enables a disabled row and appends the rest with the spec default as value', () => {
    const rows = [{ uid: 'a', name: 'size', value: '20', enabled: false, type: 'query' }, { uid: 'b', name: 'q', value: 'x', enabled: true, type: 'query' }];
    expect(withRequiredAdded(specParams, rows)).toEqual([
      { uid: 'a', name: 'size', value: '20', enabled: true, type: 'query' },
      { uid: 'b', name: 'q', value: 'x', enabled: true, type: 'query' },
      { name: 'page', value: '1', description: '', enabled: true, type: 'query' }
    ]);
  });

  it('adds an empty value when the spec has no default and changes nothing when all are set', () => {
    expect(withRequiredAdded([param('size', { required: true })], [])).toEqual([{ name: 'size', value: '', description: '', enabled: true, type: 'query' }]);
    const rows = [{ name: 'page', enabled: true }, { name: 'size', enabled: true }];
    expect(withRequiredAdded(specParams, rows)).toEqual(rows);
  });
});

it('unusedParams leaves out names other rows use, but keeps the cell\'s own', () => {
  const specParams = [param('page'), param('size'), param('sort')];
  const rows = [{ name: 'page' }, { name: 'size' }];
  expect(unusedParams(specParams, rows).map((p) => p.name)).toEqual(['sort']);
  expect(unusedParams(specParams, rows, 'size').map((p) => p.name)).toEqual(['size', 'sort']);
});
