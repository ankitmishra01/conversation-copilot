// test/access.test.js
const assert = require("assert");

async function run() {
  delete process.env.COPILOT_ACTIVE_UNTIL;
  delete process.env.COPILOT_RECALL;
  delete process.env.COPILOT_RESERVE_USD;
  delete process.env.COPILOT_RESERVE_UNTIL;
  delete require.cache[require.resolve("../api/_access")];
  const access = require("../api/_access");

  // No env vars set: always active, reserve off (no network call attempted).
  const state1 = access.accessState();
  assert.strictEqual(state1.active, true);
  assert.ok(state1.message.includes("no access window configured"));
  const guard1 = await access.reserveGuard("fake-token");
  assert.strictEqual(guard1.ok, true);
  assert.strictEqual(guard1.balance, undefined, "reserve should short-circuit without ever checking a balance");

  // A past COPILOT_ACTIVE_UNTIL makes the copilot inactive.
  process.env.COPILOT_ACTIVE_UNTIL = "2020-01-01T00:00:00Z";
  access.resetReserveCache();
  const state2 = access.accessState();
  assert.strictEqual(state2.active, false);
  assert.ok(state2.message.includes("access window closed"));

  // COPILOT_RECALL=enabled overrides the expiry.
  process.env.COPILOT_RECALL = "enabled";
  const state3 = access.accessState();
  assert.strictEqual(state3.active, true);
  delete process.env.COPILOT_RECALL;
  delete process.env.COPILOT_ACTIVE_UNTIL;

  // keyOk: no COPILOT_KEY configured means every request passes.
  delete process.env.COPILOT_KEY;
  assert.strictEqual(access.keyOk({ headers: {} }), true);
  process.env.COPILOT_KEY = "secret123";
  assert.strictEqual(access.keyOk({ headers: { "x-copilot-key": "secret123" } }), true);
  assert.strictEqual(access.keyOk({ headers: { "x-copilot-key": "wrong" } }), false);
  delete process.env.COPILOT_KEY;

  console.log("access.test.js OK");
}

module.exports = { run };
if (require.main === module) run();
