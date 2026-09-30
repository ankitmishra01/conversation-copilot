// test/profile.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..");
const REAL_PROFILE_PATH = path.join(REPO_ROOT, "data", "profile.json");

function run() {
  delete require.cache[require.resolve("../api/_profile")];
  const profile = require("../api/_profile");
  profile.resetCache();

  // With only the example present, the loader falls back to it and reports demo mode.
  assert.strictEqual(profile.isDemo(), true, "expected demo mode with only profile.example.json present");
  const you = profile.getYou();
  assert.strictEqual(you.name, "Jordan Rivera");
  const scenarios = profile.listScenarios();
  assert.ok(scenarios["job-interview-example"], "expected the example scenario to be present");
  assert.strictEqual(profile.getScenario("no-such-key").label, scenarios["job-interview-example"].label, "unknown key should fall back to the first scenario");

  // A real data/profile.json takes priority over the example, and demo flips to false.
  fs.writeFileSync(REAL_PROFILE_PATH, JSON.stringify({ you: { name: "Real User" }, scenarios: { "real-one": { label: "Real scenario" } } }));
  profile.resetCache();
  try {
    assert.strictEqual(profile.isDemo(), false, "expected demo mode to be false once data/profile.json exists");
    assert.strictEqual(profile.getYou().name, "Real User");
    assert.strictEqual(profile.getScenario("real-one").label, "Real scenario");
  } finally {
    fs.unlinkSync(REAL_PROFILE_PATH);
    delete require.cache[REAL_PROFILE_PATH];
    profile.resetCache();
  }

  console.log("profile.test.js OK");
}

module.exports = { run };
if (require.main === module) run();
