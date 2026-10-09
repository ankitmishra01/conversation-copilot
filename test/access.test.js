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

  // A reserve set without an expiry applies indefinitely, not "never" (a $5 reserve with no expiry
  // must actually reject a request against a $1 balance, not silently no-op).
  process.env.COPILOT_RESERVE_USD = "5";
  access.resetReserveCache();
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ balance: 1 }) });
  try {
    const guard2 = await access.reserveGuard("fake-token");
    assert.strictEqual(guard2.ok, false, "a reserve set without COPILOT_RESERVE_UNTIL must still apply");
  } finally {
    global.fetch = realFetch;
    delete process.env.COPILOT_RESERVE_USD;
    access.resetReserveCache();
  }

  // keyOk: no COPILOT_KEY configured means every request passes.
  delete process.env.COPILOT_KEY;
  assert.strictEqual(access.keyOk({ headers: {} }), true);
  process.env.COPILOT_KEY = "secret123";
  assert.strictEqual(access.keyOk({ headers: { "x-copilot-key": "secret123" } }), true);
  assert.strictEqual(access.keyOk({ headers: { "x-copilot-key": "wrong" } }), false);
  delete process.env.COPILOT_KEY;

  // Closed by default outside local development.
  process.env.VERCEL_ENV = "production";
  assert.strictEqual(access.keyOk({ headers: {} }), false, "production with no key configured must reject everything");
  assert.strictEqual(access.authenticate({ headers: {} }).reason, "key_not_configured");
  process.env.COPILOT_ALLOW_OPEN = "1";
  assert.strictEqual(access.keyOk({ headers: {} }), true, "COPILOT_ALLOW_OPEN is the explicit opt-out");
  delete process.env.COPILOT_ALLOW_OPEN;
  process.env.VERCEL_ENV = "preview";
  assert.strictEqual(access.keyOk({ headers: {} }), false, "preview deployments are closed too");

  // Keys map to workspaces; a key never reaches another workspace.
  process.env.COPILOT_KEYS = "acme:key-a, globex:key-g";
  assert.strictEqual(access.authenticate({ headers: { "x-copilot-key": "key-a" } }).workspace, "acme");
  assert.strictEqual(access.authenticate({ headers: { "x-copilot-key": "key-g" } }).workspace, "globex");
  assert.strictEqual(access.authenticate({ headers: { "x-copilot-key": "nope" } }).ok, false);
  delete process.env.COPILOT_KEYS;
  delete process.env.VERCEL_ENV;

  // reserveTest from a request body is ignored unless the deployment opts in.
  access.resetReserveCache();
  global.fetch = async () => ({ ok: true, json: async () => ({ balance: 1 }) });
  try {
    const ignored = await access.reserveGuard("fake-token", 50);
    assert.strictEqual(ignored.ok, true, "a caller-supplied reserve must be ignored by default");
    process.env.COPILOT_ALLOW_RESERVE_TEST = "1";
    const honoured = await access.reserveGuard("fake-token", 50);
    assert.strictEqual(honoured.ok, false);
  } finally {
    global.fetch = realFetch;
    delete process.env.COPILOT_ALLOW_RESERVE_TEST;
    access.resetReserveCache();
  }

  // Rate limiter: per bucket and per client, with Retry-After.
  access.resetRateLimits();
  const req = { headers: { "x-forwarded-for": "203.0.113.9" } };
  for (let i = 0; i < 3; i += 1) assert.strictEqual(access.rateLimit(req, "t", 3).ok, true);
  const blocked = access.rateLimit(req, "t", 3);
  assert.strictEqual(blocked.ok, false);
  assert.ok(blocked.retryAfter >= 1);
  assert.strictEqual(access.rateLimit({ headers: { "x-forwarded-for": "203.0.113.10" } }, "t", 3).ok, true, "another client is unaffected");
  assert.strictEqual(access.rateLimit(req, "other", 3).ok, true, "buckets are independent");
  access.resetRateLimits();

  console.log("access.test.js OK");
}

module.exports = { run };
if (require.main === module) run();
