// test/profile-endpoint.test.js
const assert = require("assert");

function fakeRes() {
  const res = { statusCode: 0, headers: {}, body: "" };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = (b) => { res.body = b || ""; };
  return res;
}

async function run() {
  delete require.cache[require.resolve("../api/_profile")];
  delete require.cache[require.resolve("../api/profile")];
  delete process.env.COPILOT_KEY;
  const profile = require("../api/_profile");
  profile.resetCache();
  const handler = require("../api/profile");

  // No COPILOT_KEY configured: the endpoint serves the safe subset.
  const res1 = fakeRes();
  await handler({ method: "GET", headers: {} }, res1);
  const body1 = JSON.parse(res1.body);
  assert.ok(body1.scenarios["job-interview-example"], "expected the example scenario in the response");

  // Regression: none of the fields that must never reach the browser are present anywhere in the response.
  const forbidden = ["settledAnswers", "neverSay", "honestGap", "watchOuts", "140 to 160K", "fixedLine"];
  forbidden.forEach((needle) => {
    assert.ok(!res1.body.includes(needle), "the /api/profile response must never contain '" + needle + "'");
  });

  // A required COPILOT_KEY without the header is refused, not served.
  process.env.COPILOT_KEY = "secret123";
  delete require.cache[require.resolve("../api/_access")];
  delete require.cache[require.resolve("../api/profile")];
  const gatedHandler = require("../api/profile");
  const res2 = fakeRes();
  await gatedHandler({ method: "GET", headers: {} }, res2);
  const body2 = JSON.parse(res2.body);
  assert.strictEqual(body2.error, "key_required", "a configured COPILOT_KEY must be enforced on /api/profile too");
  delete process.env.COPILOT_KEY;

  console.log("profile-endpoint.test.js OK");
}

module.exports = { run };
if (require.main === module) run();
