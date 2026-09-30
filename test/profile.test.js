// test/profile.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..");
// Use the synced-file slot (api/_data/profile.json) for the scratch write, never data/profile.json —
// that's the user's own real config and must never be touched by a test run. Back up and restore
// whatever is already there (e.g. from a real `npm run sync-memory`) so a test run never loses it.
const SCRATCH_PATH = path.join(REPO_ROOT, "api", "_data", "profile.json");

function withScratchFile(content, fn) {
  const existed = fs.existsSync(SCRATCH_PATH);
  const backup = existed ? fs.readFileSync(SCRATCH_PATH) : null;
  fs.mkdirSync(path.dirname(SCRATCH_PATH), { recursive: true });
  fs.writeFileSync(SCRATCH_PATH, content);
  delete require.cache[SCRATCH_PATH];
  try {
    fn();
  } finally {
    if (existed) fs.writeFileSync(SCRATCH_PATH, backup);
    else fs.unlinkSync(SCRATCH_PATH);
    delete require.cache[SCRATCH_PATH];
  }
}

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

  // A synced api/_data/profile.json takes priority over the example, and demo flips to false.
  withScratchFile(JSON.stringify({ you: { name: "Real User" }, scenarios: { "real-one": { label: "Real scenario" } } }), () => {
    profile.resetCache();
    assert.strictEqual(profile.isDemo(), false, "expected demo mode to be false once a synced profile exists");
    assert.strictEqual(profile.getYou().name, "Real User");
    assert.strictEqual(profile.getScenario("real-one").label, "Real scenario");
  });
  profile.resetCache();

  console.log("profile.test.js OK");
}

module.exports = { run, withScratchFile, SCRATCH_PATH };
if (require.main === module) run();
