const fs = require('fs');
const os = require('os');
const path = require('path');
const { getSpec, clearSpecCache } = require('../../src/utils/spec-lint/spec-cache');

const spec = (title) => `openapi: 3.0.0\ninfo: {title: ${title}, version: "1"}\npaths: {}\n`;
let file;
beforeEach(() => {
  clearSpecCache();
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'slc-')), 's.yaml');
  fs.writeFileSync(file, spec('A'));
});

it('returns the same parsed object while the file is unchanged', () => {
  expect(getSpec(file)).toBe(getSpec(file));
});
it('re-parses when the mtime changes', () => {
  expect(getSpec(file).title).toBe('A');
  fs.writeFileSync(file, spec('B'));
  const t = new Date(Date.now() + 5000);
  fs.utimesSync(file, t, t);
  expect(getSpec(file).title).toBe('B');
});
it('reports a missing file', () => {
  expect(getSpec(file + '.gone')).toEqual({ ok: false, error: `Spec file not found: ${file}.gone` });
});
