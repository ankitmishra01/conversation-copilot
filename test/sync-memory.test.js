// test/sync-memory.test.js
const assert = require("assert");
const { execFileSync } = require("child_process");
const path = require("path");

function run() {
  const scriptPath = path.join(__dirname, "..", "scripts", "sync-memory.js");
  let threw = false;
  try {
    execFileSync("node", [scriptPath], { env: Object.assign({}, process.env, { MEMORY_REPO: "" }), stdio: "pipe" });
  } catch (e) {
    threw = true;
    assert.strictEqual(e.status, 1, "missing MEMORY_REPO should exit non-zero");
    assert.ok(String(e.stderr).includes("MEMORY_REPO"), "the error should explain which env var to set");
  }
  assert.ok(threw, "running without MEMORY_REPO should exit non-zero, not silently succeed");
  console.log("sync-memory.test.js OK");
}

module.exports = { run };
if (require.main === module) run();
