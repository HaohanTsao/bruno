let mockStoreData = {};

jest.mock('electron-store', () => jest.fn().mockImplementation(() => ({
  get: (key, fallback) => (key in mockStoreData ? mockStoreData[key] : fallback),
  set: (key, value) => {
    mockStoreData[key] = value;
  }
})));

const { getPreferences, savePreferences } = require('../../src/store/preferences');

beforeEach(() => {
  mockStoreData = {};
});

test('spec-lint defaults to on', () => {
  expect(getPreferences().beta['spec-lint']).toBe(true);
});

// Regression guard (expected to pass even before the change: savePreferences keeps unknown beta keys today).
// The Yup entry is added for consistency with 'openapi-sync', not because saving needs it.
test('turning spec-lint off survives save and validation', async () => {
  const p = getPreferences();
  await savePreferences({ ...p, beta: { ...p.beta, 'spec-lint': false } });
  expect(getPreferences().beta['spec-lint']).toBe(false);
});
