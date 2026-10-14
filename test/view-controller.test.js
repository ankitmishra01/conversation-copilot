const assert = require("assert");

function run() {
  const views = require("../view-controller");

  assert.strictEqual(views.resolveView(""), "live");
  assert.strictEqual(views.resolveView("?view=coach"), "coach");
  assert.strictEqual(views.resolveView("?view=loop"), "loop");
  assert.strictEqual(views.resolveView("?view=evals"), "evals");
  assert.strictEqual(views.resolveView("?demo=commitment-loop"), "loop");
  assert.strictEqual(views.resolveView("?view=coach&demo=commitment-loop"), "coach", "an explicit view must override the legacy demo alias");
  assert.strictEqual(views.resolveView("?view=unknown"), "live");

  assert.strictEqual(views.viewHref("coach", "?mode=recording&role=interview"), "?mode=recording&role=interview&view=coach");
  assert.strictEqual(views.viewHref("loop", "?demo=commitment-loop"), "?demo=commitment-loop&view=loop");
  assert.strictEqual(views.viewHref("evals", "?demo=commitment-loop"), "?demo=commitment-loop&view=evals");

  const state = views.viewState("coach");
  assert.deepStrictEqual(state, {
    live: false,
    coach: true,
    loop: false,
    evals: false,
    title: "Answer coach"
  });

  assert.strictEqual(views.startHereVisible("live", false), true, "first-time visitors on the live view must see the start-here path");
  assert.strictEqual(views.startHereVisible("evals", false), true);
  assert.strictEqual(views.startHereVisible("loop", false), false, "the loop view already exposes the replay, so the strip must hide");
  assert.strictEqual(views.startHereVisible("live", true), false, "a dismissed strip must stay dismissed");
  assert.ok(typeof views.START_HERE_KEY === "string" && views.START_HERE_KEY.length > 0);

  console.log("view-controller.test.js OK");
}

module.exports = { run };
if (require.main === module) run();
