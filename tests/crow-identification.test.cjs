const test = require('node:test');
const assert = require('node:assert/strict');

test('a cached visit can load the former bird picker without a document or event handlers', async () => {
  const {enableCrowNames} = await import('../yard/crow-identification.js');
  assert.doesNotThrow(() => enableCrowNames());
});
