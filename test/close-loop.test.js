// test/close-loop.test.js
const assert = require("assert");

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: "" };
  res.status = (code) => { res.statusCode = code; return res; };
  res.setHeader = (key, value) => { res.headers[key] = value; };
  res.json = (value) => { res.body = JSON.stringify(value); return res; };
  res.end = (value) => { res.body = value || ""; return res; };
  return res;
}

async function run() {
  delete require.cache[require.resolve("../api/close-loop")];
  const closeLoop = require("../api/close-loop");

  const transcript = "Maya: I will send the security packet by Friday. Leo: We should revisit the analytics add-on next quarter.";
  const normalized = closeLoop.normalizeAnalysis({
    summary: "Security follow-up and expansion interest.",
    commitments: [
      {
        id: "c1",
        party: "seller",
        owner: "Maya",
        action: "Send the security packet",
        dueDate: "Friday",
        confidence: 0.92,
        sourceQuote: "I will send the security packet by Friday."
      },
      {
        id: "c2",
        party: "customer",
        owner: "Leo",
        action: "Approve an enterprise expansion immediately",
        dueDate: "",
        confidence: 0.99,
        sourceQuote: "We approved the enterprise expansion."
      }
    ],
    blockers: [{ label: "Security review", sourceSpeaker: "Maya", sourceDate: "2026-10-02", sourceType: "call transcript", sourceQuote: "security packet" }],
    expansionSignals: [{ label: "Analytics add-on", sourceSpeaker: "Leo", sourceDate: "2026-10-02", sourceType: "call transcript", sourceQuote: "analytics add-on" }],
    followUp: { subject: "Next steps", body: "Hi Leo,\n\nI will send the security packet by Friday.\n\nBest,\nMaya" },
    crm: { summary: "Security review remains open.", nextStep: "Send packet", nextStepDate: null, stageSuggestion: "" }
  }, transcript);

  assert.strictEqual(normalized.commitments[0].verified, true, "an exact transcript quote must be verified");
  assert.strictEqual(normalized.commitments[1].verified, false, "an invented quote must never be verified");
  assert.ok(normalized.warnings.some((warning) => warning.includes("c2")), "unsupported commitments must produce a visible warning");
  assert.strictEqual(normalized.blockers[0].verified, true, "a source fragment present in the transcript is supported");
  assert.strictEqual(normalized.blockers[0].sourceSpeaker, "Maya");
  assert.strictEqual(normalized.blockers[0].sourceDate, "2026-10-02");
  assert.strictEqual(normalized.blockers[0].sourceType, "call transcript");
  assert.strictEqual(normalized.expansionSignals[0].verified, true, "expansion evidence present in the transcript is supported");
  assert.ok(normalized.followUp.body.includes("\n\n"), "email paragraph breaks must survive response normalization");

  const emptyRes = fakeRes();
  await closeLoop.handler({ method: "POST", headers: {}, body: { transcript: "   " } }, emptyRes);
  assert.strictEqual(emptyRes.statusCode, 400, "empty transcripts must be rejected");
  assert.strictEqual(JSON.parse(emptyRes.body).error, "transcript_required");

  const methodRes = fakeRes();
  await closeLoop.handler({ method: "GET", headers: {}, body: {} }, methodRes);
  assert.strictEqual(methodRes.statusCode, 405, "non-POST requests must be rejected");

  const realFetch = global.fetch;
  let gatewayRequest;
  global.fetch = async (_url, options) => {
    gatewayRequest = JSON.parse(options.body);
    return ({
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            summary: "Security follow-up.",
            commitments: [{ id: "c1", party: "seller", owner: "Maya", action: "Send packet", dueDate: "Friday", confidence: 0.9, sourceQuote: "I will send the security packet by Friday." }],
            blockers: [],
            expansionSignals: [],
            followUp: { subject: "Next steps", body: "I will send the packet by Friday." },
            crm: { summary: "Security review pending.", nextStep: "Send packet", nextStepDate: null, stageSuggestion: "" }
          })
        }
      }]
    })
    });
  };
  try {
    const okRes = fakeRes();
    await closeLoop.handler({ method: "POST", headers: { "x-vercel-oidc-token": "fake" }, body: { transcript } }, okRes);
    assert.strictEqual(okRes.statusCode, 200);
    const body = JSON.parse(okRes.body);
    assert.strictEqual(body.commitments[0].verified, true, "the endpoint must return normalized evidence, not raw model output");
    assert.strictEqual(body.model, "openai/gpt-6.1-sol-fast");
    assert.strictEqual(gatewayRequest.response_format.type, "json_schema", "extraction must request schema-constrained output");
    assert.strictEqual(gatewayRequest.response_format.json_schema.strict, true);
  } finally {
    global.fetch = realFetch;
  }

  await groundingTests(closeLoop, transcript);
  console.log("close-loop.test.js OK");
}

function gatewayReply(content) {
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(content) } }] }) };
}

async function groundingTests(closeLoop, transcript) {
  const realFetch = global.fetch;
  const extraction = {
    summary: "Security follow-up.",
    commitments: [
      { id: "c1", party: "seller", owner: "Maya", action: "Send the security packet", dueDate: "Friday", confidence: 0.9, sourceQuote: "I will send the security packet by Friday." },
      { id: "c2", party: "customer", owner: "Leo", action: "Sign the contract", dueDate: "Monday", confidence: 0.8, sourceQuote: "We should revisit the analytics add-on next quarter." }
    ],
    blockers: [], expansionSignals: [],
    followUp: { subject: "Next steps", body: "I will send the packet and Leo will sign the contract Monday." },
    crm: { summary: "Packet and contract.", nextStep: "Send packet", nextStepDate: null, stageSuggestion: null }
  };
  const calls = [];
  global.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    const name = request.response_format && request.response_format.json_schema.name;
    calls.push({ model: request.model, name });
    if (name === "close_loop_analysis") return gatewayReply(extraction);
    if (name === "grounding_check") return gatewayReply({ results: [
      { id: "commitment:c1", supported: true, ownerSupported: true, dueDateSupported: true },
      { id: "commitment:c2", supported: false, ownerSupported: true, dueDateSupported: false }
    ] });
    if (name === "grounded_drafts") {
      assert.ok(!JSON.stringify(request.messages).includes("contract"), "regenerated drafts must not see unsupported items");
      return gatewayReply({ followUp: { subject: "Next steps", body: "I will send the security packet by Friday." }, crm: { summary: "Packet pending.", nextStep: "Send packet", nextStepDate: null, stageSuggestion: null } });
    }
    throw new Error("unexpected call " + name);
  };
  try {
    const res = fakeRes();
    await closeLoop.handler({ method: "POST", headers: { "x-vercel-oidc-token": "fake" }, body: { transcript } }, res);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.commitments[0].supported, true);
    assert.strictEqual(body.commitments[1].supported, false, "a quote that exists but does not support the claim must be flagged");
    assert.strictEqual(body.commitments[1].dueDate, null, "an ungrounded due date must be cleared");
    assert.ok(!body.followUp.body.includes("contract"), "drafts must not restate unsupported items");
    assert.strictEqual(body.draftsRegrounded, true);
    assert.deepStrictEqual(calls.map((c) => c.name), ["close_loop_analysis", "grounding_check", "grounded_drafts"]);

    // Draft regeneration fails: drafts are withheld, never passed through.
    global.fetch = async (_url, options) => {
      const name = JSON.parse(options.body).response_format.json_schema.name;
      if (name === "close_loop_analysis") return gatewayReply(extraction);
      if (name === "grounding_check") return gatewayReply({ results: [{ id: "commitment:c1", supported: true, ownerSupported: true, dueDateSupported: true }, { id: "commitment:c2", supported: false, ownerSupported: true, dueDateSupported: true }] });
      return { ok: false, status: 500, json: async () => ({}) };
    };
    const withheld = fakeRes();
    await closeLoop.handler({ method: "POST", headers: { "x-vercel-oidc-token": "fake" }, body: { transcript } }, withheld);
    const withheldBody = JSON.parse(withheld.body);
    assert.strictEqual(withheldBody.draftsWithheld, true);
    assert.strictEqual(withheldBody.followUp.body, "");

    // Judge unavailable: extraction still returns, only exact-quote matching applies.
    global.fetch = async (_url, options) => {
      const name = JSON.parse(options.body).response_format.json_schema.name;
      if (name === "close_loop_analysis") return gatewayReply(Object.assign({}, extraction, { commitments: [extraction.commitments[0]] }));
      return { ok: false, status: 500, json: async () => ({}) };
    };
    const noJudge = fakeRes();
    await closeLoop.handler({ method: "POST", headers: { "x-vercel-oidc-token": "fake" }, body: { transcript } }, noJudge);
    const noJudgeBody = JSON.parse(noJudge.body);
    assert.strictEqual(noJudge.statusCode, 200);
    assert.strictEqual(noJudgeBody.commitments[0].supported, null);
    assert.ok(noJudgeBody.warnings.some((w) => w.includes("Semantic grounding check")));

    // Model fallback + response_format rejection.
    const attempts = [];
    global.fetch = async (_url, options) => {
      const request = JSON.parse(options.body);
      attempts.push([request.model, Boolean(request.response_format)]);
      if (request.model === closeLoop.DEFAULT_MODEL) return { ok: false, status: request.response_format ? 400 : 503, json: async () => ({}) };
      if (request.response_format && request.response_format.json_schema.name !== "close_loop_analysis") return gatewayReply({ results: [] });
      return gatewayReply(Object.assign({}, extraction, { commitments: [extraction.commitments[0]] }));
    };
    const fallback = fakeRes();
    await closeLoop.handler({ method: "POST", headers: { "x-vercel-oidc-token": "fake" }, body: { transcript } }, fallback);
    assert.strictEqual(fallback.statusCode, 200);
    assert.strictEqual(JSON.parse(fallback.body).model, closeLoop.modelChain()[1], "a failing primary model must fall back");
    assert.deepStrictEqual(attempts.slice(0, 3), [[closeLoop.DEFAULT_MODEL, true], [closeLoop.DEFAULT_MODEL, false], [closeLoop.modelChain()[1], true]]);
  } finally {
    global.fetch = realFetch;
  }
}

module.exports = { run };
if (require.main === module) run();
