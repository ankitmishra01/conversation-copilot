const assert = require("assert");

function run() {
  const views = require("../view-controller");

  assert.strictEqual(views.resolveView(""), "live");
  assert.strictEqual(views.resolveView("?view=coach"), "coach");
  assert.strictEqual(views.resolveView("?view=loop"), "loop");
  assert.strictEqual(views.resolveView("?demo=commitment-loop"), "loop");
  assert.strictEqual(views.resolveView("?view=coach&demo=commitment-loop"), "coach", "an explicit view must override the legacy demo alias");
  assert.strictEqual(views.resolveView("?view=unknown"), "live");

  assert.strictEqual(views.viewHref("coach", "?mode=recording&role=interview"), "?mode=recording&role=interview&view=coach");
  assert.strictEqual(views.viewHref("loop", "?demo=commitment-loop"), "?demo=commitment-loop&view=loop");

  const state = views.viewState("coach");
  assert.deepStrictEqual(state, {
    live: false,
    coach: true,
    loop: false,
    title: "Answer coach"
  });

  console.log("view-controller.test.js OK");
}

module.exports = { run };
if (require.main === module) run();
