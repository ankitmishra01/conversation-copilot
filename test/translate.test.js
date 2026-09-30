// test/translate.test.js
const assert = require("assert");

async function run() {
  delete require.cache[require.resolve("../api/_profile")];
  delete require.cache[require.resolve("../api/translate")];
  const profile = require("../api/_profile");
  profile.resetCache();
  const translate = require("../api/translate");

  // Pure helpers, no network.
  const notes = translate.scenarioLanguages({ language: { source: "en", target: "en" } });
  assert.strictEqual(notes.notesMode, true);
  const trans = translate.scenarioLanguages({ language: { source: "es", target: "en" } });
  assert.strictEqual(trans.notesMode, false);

  assert.strictEqual(translate.activeScenarioKey({ role: "job-interview-example" }), "job-interview-example");
  assert.strictEqual(translate.activeScenarioKey({ role: "no-such-key" }), "job-interview-example", "unknown role should fall back to the first scenario key");

  const prompt = translate.systemPrompt("job-interview-example", "MEMORY TEXT");
  assert.ok(prompt.includes("Jordan Rivera"), "prompt should use the configured name, not a hardcoded one");
  assert.ok(!/Ankit/i.test(prompt), "prompt must never contain a hardcoded personal name");
  assert.ok(prompt.includes("MEMORY TEXT"));

  // fallback() must never suggest translation happened in a notes-mode scenario.
  const fb = translate.fallback({ role: "sales-call-notes-example", useAi: true }, "missing_gateway_auth");
  assert.strictEqual(fb.translation, "", "notes-mode fallback must not show a translation placeholder");
  assert.ok(fb.focus.includes("AI coaching needs AI_GATEWAY_API_KEY"));

  const fbTranslate = translate.fallback({ role: "client-call-translation-example", useAi: true }, "missing_gateway_auth");
  assert.ok(fbTranslate.translation.includes("AI_GATEWAY_API_KEY"), "translation-mode fallback should say why there's no translation");

  // gateway() with a stubbed AI Gateway response: verify the watch-out fixed line wins over the model's own answer.
  const realFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({ questionLang: "en", translation: "", isQuestion: true, say: "a model-generated answer", topic: "pay" }) } }] })
  });
  try {
    const result = await translate.gateway({ role: "job-interview-example", text: "What's your salary expectation?", useAi: true, reserveTest: 0 }, { headers: { "x-vercel-oidc-token": "fake" } });
    assert.strictEqual(result.mode, "ai-gateway");
    assert.ok(result.phrase.includes("140 to 160K"), "a watch-out topic must return the fixed line, not the model's own answer");
  } finally {
    global.fetch = realFetch;
  }

  console.log("translate.test.js OK");
}

module.exports = { run };
if (require.main === module) run();
