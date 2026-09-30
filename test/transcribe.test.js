// test/transcribe.test.js
const assert = require("assert");

function run() {
  delete require.cache[require.resolve("../api/_profile")];
  delete require.cache[require.resolve("../api/transcribe")];
  const profile = require("../api/_profile");
  profile.resetCache();
  const transcribe = require("../api/transcribe");

  assert.strictEqual(transcribe.hintFor("job-interview-example"), "growth, retention, activation, funnel");
  const tokens = transcribe.hintTokensFor("job-interview-example");
  assert.ok(tokens.has("growth") && tokens.has("retention"));

  assert.strictEqual(transcribe.isHallucination("", tokens), true, "empty text is always a hallucination");
  assert.strictEqual(transcribe.isHallucination("thanks for watching everyone", tokens), true, "stock subtitle phrase is filtered");
  assert.strictEqual(transcribe.isHallucination("growth retention activation funnel growth retention", tokens), true, "an echo of the hint vocabulary is filtered");
  assert.strictEqual(transcribe.isHallucination("let's talk about the renewal timeline for next quarter", tokens), false, "ordinary speech is not filtered");

  console.log("transcribe.test.js OK");
}

module.exports = { run };
if (require.main === module) run();
