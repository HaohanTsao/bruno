const { urlDiffers } = require('../../src/utils/spec-lint/url-hint');

it.each([
  ['{{SVC_A}}/v4/example-transfer', '/v4/example-transfer', false],
  ['{{SVC_A}}/v3/example-transfer?internal-ref={{internal-ref}}', '/v3/example-transfer', false],
  ['{{SVC_B}}/v2/account/42/{{dbtr-acnt}}', '/v2/account/{entity}/{account-number}', false],
  ['{{SVC_C}}/v2/loan-account/:id/early-settlement', '/v2/loan-account/{account-number}/early-settlement', false],
  ['https://api.example.test/fx-contracts/api/contracts', '/contracts', false],
  ['{{SVC_F}}/automated-limit/', '/automated-limit', false],
  ['{{SVC_A}}/v4/example-transfer', '/v3/example-transfer', true],
  ['{{SVC_D}}/v3/limit', '/v3/limit/{id}', true],
  ['', '/v3/limit', false],
  ['{{baseUrl}}{{limitPath}}', '/v3/limit', false],
  ['{{url}}', '/v3/limit', false],
  ['{{host}}/{{svcPath}}', '/v3/limit', false]
])('urlDiffers(%s, %s) is %s', (url, specPath, expected) => {
  expect(urlDiffers(url, specPath)).toBe(expected);
});
