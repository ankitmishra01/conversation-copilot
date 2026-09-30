// test/memory.test.js
const assert = require("assert");

function run() {
  delete require.cache[require.resolve("../api/_profile")];
  delete require.cache[require.resolve("../api/_memory")];
  const profile = require("../api/_profile");
  profile.resetCache();
  const memory = require("../api/_memory");

  const mem = memory.forScenario("job-interview-example");
  assert.ok(mem.includes("Get the offer"), "memory text should include the scenario goal");
  assert.ok(mem.includes("4x signups"), "memory text should include background proof marked usefulFor: all");

  const watch = memory.watchFor("job-interview-example", "What salary are you looking for?");
  assert.ok(watch.includes("Compensation"), "asking about salary should trigger the Compensation watch-out");

  const fixed = memory.overrideFor("job-interview-example", "What is your expected pay?", "source");
  assert.ok(fixed && fixed.say.includes("140 to 160K"), "salary question should return the fixed line, not a generated one");

  const noHit = memory.overrideFor("job-interview-example", "Tell me about your background.", "source");
  assert.strictEqual(noHit, null, "a non-watch-out question should not return a fixed line");

  // Regression: substring matching once let "rate" fire on "strategy"/"integrate", swapping the answer
  // for a fixed compensation line on unrelated questions.
  const falsePositive1 = memory.overrideFor("job-interview-example", "What's your growth strategy for the first year?", "source");
  assert.strictEqual(falsePositive1, null, "'strategy' must not trigger the 'rate' compensation watch-out");
  const falsePositive2 = memory.overrideFor("job-interview-example", "How would you integrate with our existing tools?", "source");
  assert.strictEqual(falsePositive2, null, "'integrate' must not trigger the 'rate' compensation watch-out");
  const watchFalsePositive = memory.watchFor("job-interview-example", "Tell me about your team's growth strategy.");
  assert.strictEqual(watchFalsePositive, "", "'strategy' must not trigger the Compensation watch-out warning either");

  const emptyWatchOuts = memory.watchFor("sales-call-notes-example", "unrelated text with no triggers");
  assert.strictEqual(emptyWatchOuts, "", "no trigger match should return an empty string, not throw");

  const c = memory.card("job-interview-example");
  assert.ok(c.title.includes("Head of Growth"));
  assert.ok(c.keys.some((k) => k.startsWith("Gap:")));

  // A scenario with no `watchOuts` key at all must not crash watchFor/overrideFor. Uses the same safe
  // scratch-file helper as profile.test.js (api/_data/profile.json, backed up and restored), never
  // data/profile.json.
  const { withScratchFile } = require("./profile.test");
  withScratchFile(JSON.stringify({
    you: { name: "No Watchouts" },
    scenarios: { bare: { label: "Bare scenario", goal: "Test", proofBank: [] } }
  }), () => {
    profile.resetCache();
    assert.strictEqual(memory.watchFor("bare", "anything at all"), "", "missing watchOuts array must return empty string, not throw");
    assert.strictEqual(memory.overrideFor("bare", "anything at all", "source"), null, "missing watchOuts array must return null, not throw");
  });
  profile.resetCache();

  console.log("memory.test.js OK");
}

module.exports = { run };
if (require.main === module) run();
