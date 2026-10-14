// test/vaada.test.js
const assert = require("assert");
const V = require("../vaada.js");
const fx = require("../data/vaada-demo.json");

exports.run = function () {
  const r = V.rightsCheck(fx);
  assert.strictEqual(r.reversalDue, "2026-10-11", "UPI P2P reversal due T+1");
  assert.strictEqual(r.daysLate, 4);
  assert.strictEqual(r.compensation, 400, "₹100 per day beyond T+1");
  const ps = V.promiseStatus(fx);
  assert.ok(ps[0].overdue, "24-hour promise is overdue by the as-of date");
  const ev = V.verifyEvidence(fx);
  ev.forEach(e => assert.ok(e.ok, "evidence quote must appear verbatim in its line: " + e.id));
  const plan = V.escalationPlan(fx, "2026-10-15");
  assert.strictEqual(plan.ombudsmanEligible, "2026-11-14", "Ombudsman after 30 days");
  const d = V.drafts(fx);
  assert.ok(d.en.includes("₹400") && d.en.includes("SR4471902") && d.en.includes(fx.promises[0].quote));
  assert.ok(d.hi.includes("₹400") && d.hi.includes("SR4471902"));
  assert.ok(!/[—–]/.test(d.en), "no em/en dashes in drafts");
  console.log("vaada tests passed");
};
