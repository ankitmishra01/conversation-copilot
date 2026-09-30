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

  const emptyWatchOuts = memory.watchFor("sales-call-notes-example", "unrelated text with no triggers");
  assert.strictEqual(emptyWatchOuts, "", "no trigger match should return an empty string, not throw");

  const c = memory.card("job-interview-example");
  assert.ok(c.title.includes("Head of Growth"));
  assert.ok(c.keys.some((k) => k.startsWith("Gap:")));

  // A scenario with no `watchOuts` key at all must not crash watchFor/overrideFor.
  const fs = require("fs");
  const path = require("path");
  const realProfilePath = path.join(__dirname, "..", "data", "profile.json");
  fs.writeFileSync(realProfilePath, JSON.stringify({
    you: { name: "No Watchouts" },
    scenarios: { bare: { label: "Bare scenario", goal: "Test", proofBank: [] } }
  }));
  profile.resetCache();
  try {
    assert.strictEqual(memory.watchFor("bare", "anything at all"), "", "missing watchOuts array must return empty string, not throw");
    assert.strictEqual(memory.overrideFor("bare", "anything at all", "source"), null, "missing watchOuts array must return null, not throw");
  } finally {
    fs.unlinkSync(realProfilePath);
    delete require.cache[realProfilePath];
    profile.resetCache();
  }

  console.log("memory.test.js OK");
}

module.exports = { run };
if (require.main === module) run();
