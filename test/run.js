// test/run.js
require("./profile.test").run();
require("./memory.test").run();
require("./transcribe.test").run();
require("./access.test").run().catch((e) => { console.error(e); process.exit(1); });
