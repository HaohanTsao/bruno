const fs = require('fs');
const path = require('path');
const { loadSpec } = require('../../src/utils/spec-lint/spec-loader');
const { listQueryParams } = require('../../src/utils/spec-lint/parameters');

const { spec } = loadSpec(fs.readFileSync(path.join(__dirname, 'fixtures/demo-user-api.yml'), 'utf8'));

it('lists the query parameters of an operation', () => {
  expect(listQueryParams(spec, 'GET', '/users')).toEqual([
    { name: 'limit', required: false, deprecated: false, type: 'integer', valueType: 'integer', enum: [], default: 10, description: '' },
    { name: 'role', required: false, deprecated: false, type: 'string', valueType: 'string', enum: ['admin', 'editor', 'viewer'], default: undefined, description: '' }
  ]);
});
it('leaves out path parameters and answers null for an unknown operation', () => {
  expect(listQueryParams(spec, 'GET', '/users/{id}')).toEqual([]);
  expect(listQueryParams(spec, 'DELETE', '/users')).toBeNull();
  expect(listQueryParams(spec, 'GET', '/nope')).toBeNull();
});
it('resolves refs, merges path-level parameters and reads array item enums', () => {
  const s = {
    openapi: '3.0.3',
    components: {
      parameters: { Page: { name: 'page', in: 'query', required: true, description: 'Page number', schema: { $ref: '#/components/schemas/Int' } } },
      schemas: { Int: { type: 'integer', default: 1 }, Status: { type: 'string', enum: ['open', 'closed', { x: 1 }] } }
    },
    paths: {
      '/tickets': {
        parameters: [{ $ref: '#/components/parameters/Page' }, { name: 'sort', in: 'query', schema: { type: 'string' } }],
        get: {
          parameters: [
            { name: 'sort', in: 'query', deprecated: true, schema: { allOf: [{ type: 'string', enum: ['asc', 'desc'] }] } },
            { name: 'status', in: 'query', schema: { type: 'array', items: { $ref: '#/components/schemas/Status' } } },
            { name: 'X-Trace', in: 'header', schema: { type: 'string' } }
          ]
        }
      }
    }
  };
  expect(listQueryParams(s, 'get', '/tickets')).toEqual([
    { name: 'page', required: true, deprecated: false, type: 'integer', valueType: 'integer', enum: [], default: 1, description: 'Page number' },
    { name: 'sort', required: false, deprecated: true, type: 'string', valueType: 'string', enum: ['asc', 'desc'], default: undefined, description: '' },
    { name: 'status', required: false, deprecated: false, type: 'array<string>', valueType: 'string', enum: ['open', 'closed'], default: undefined, description: '' }
  ]);
});
