// test/run.js
require("./profile.test").run();
require("./memory.test").run();
require("./transcribe.test").run();
require("./sync-memory.test").run();
Promise.resolve()
  .then(() => require("./access.test").run())
  .then(() => require("./translate.test").run())
  .then(() => require("./profile-endpoint.test").run())
  .then(() => require("./close-loop.test").run())
  .then(() => require("./eval-ledger.test").run())
  .then(() => require("./view-controller.test").run())
  .then(() => require("./close-loop-ui.test").run())
  .catch((e) => { console.error(e); process.exit(1); });
