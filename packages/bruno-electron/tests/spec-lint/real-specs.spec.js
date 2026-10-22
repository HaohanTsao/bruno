const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { getSpec } = require('../../src/utils/spec-lint/spec-cache');
const { getRequestSchema } = require('../../src/utils/spec-lint/schema');
const { lintBody } = require('../../src/utils/spec-lint');

const SPECS = process.env.SPEC_LINT_REAL_SPECS;
const COLL = process.env.SPEC_LINT_REAL_COLLECTION;
// Opt-in: point SPEC_LINT_REAL_SPECS at a folder of real specs and SPEC_LINT_REAL_COLLECTION at a
// collection whose request files match the entries below. Both are skipped otherwise.
(SPECS && COLL ? describe : describe.skip)('real specs', () => {
  it.each([
    ['example-a.yaml', 'POST', '/v3/limit', 'folder-a/request-a.yml'],
    ['example-b.yaml', 'POST', '/v2/customer', 'folder-a/request-c.yml'],
    ['example-c.yaml', 'POST', '/v4/example-transfer/create', 'folder-b/request-d.yml']
  ])('%s %s %s', (file, method, p, requestFile) => {
    const t0 = performance.now();
    const s = getSpec(path.join(SPECS, file));
    const ctx = { schema: getRequestSchema(s.spec, s.version, method, p), version: s.version };
    const body = yaml.load(fs.readFileSync(path.join(COLL, requestFile), 'utf8')).http.body.data;
    let errors = lintBody(body, ctx);
    const coldMs = performance.now() - t0;
    const t1 = performance.now();
    for (let i = 0; i < 20; i++) errors = lintBody(body, ctx);
    const warmMs = (performance.now() - t1) / 20;
    console.log(file, `cold ${coldMs.toFixed(0)} ms, warm ${warmMs.toFixed(1)} ms`, errors.map((e) => `${body.slice(e.from, e.to)} → ${e.message}`));
    expect(coldMs).toBeLessThan(1500);
    expect(warmMs).toBeLessThan(50);
    expect(errors.filter((e) => /got null/.test(e.message))).toEqual([]);
  });
});
