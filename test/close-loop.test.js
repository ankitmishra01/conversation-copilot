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
    assert.strictEqual(gatewayRequest.response_format, undefined, "gateway requests must not force response_format because supported models differ");
  } finally {
    global.fetch = realFetch;
  }

  assert.deepStrictEqual(closeLoop.modelCandidates({ AI_GATEWAY_LOOP_MODEL: " gone/model ", AI_GATEWAY_FALLBACK_MODEL: "openai/gpt-6.1-sol-fast" }), ["gone/model", "openai/gpt-6.1-sol-fast"], "candidates are trimmed and de-duplicated");
  assert.deepStrictEqual(closeLoop.modelCandidates({}), ["openai/gpt-6.1-sol-fast"]);

  // A withdrawn model (gateway 404) must fall through to the next candidate.
  const prevLoop = process.env.AI_GATEWAY_LOOP_MODEL;
  process.env.AI_GATEWAY_LOOP_MODEL = "gone/model";
  const tried = [];
  global.fetch = async (_url, options) => {
    const m = JSON.parse(options.body).model; tried.push(m);
    if (m === "gone/model") return { ok: false, status: 404, json: async () => ({ error: { message: "model not found" } }) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ summary: "ok", commitments: [], blockers: [], expansionSignals: [], followUp: { subject: "", body: "" }, crm: { summary: "", nextStep: "", nextStepDate: null, stageSuggestion: "" } }) } }] }) };
  };
  try {
    const fbRes = fakeRes();
    await closeLoop.handler({ method: "POST", headers: { "x-vercel-oidc-token": "fake" }, body: { transcript } }, fbRes);
    assert.strictEqual(fbRes.statusCode, 200, "a 404 on the first model must not fail the request");
    const fb = JSON.parse(fbRes.body);
    assert.deepStrictEqual(tried, ["gone/model", "openai/gpt-6.1-sol-fast"]);
    assert.strictEqual(fb.model, "openai/gpt-6.1-sol-fast");
    assert.strictEqual(fb.fallbackFrom, "gone/model");
    // Capacity errors (503) on the first model fall through; a 401 does not.
    const tried503 = [];
    global.fetch = async (_url, options) => {
      const m = JSON.parse(options.body).model; tried503.push(m);
      if (m === "gone/model") return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ summary: "ok", commitments: [], blockers: [], expansionSignals: [], followUp: { subject: "", body: "" }, crm: { summary: "", nextStep: "", nextStepDate: null, stageSuggestion: "" } }) } }] }) };
    };
    const capRes = fakeRes();
    await closeLoop.handler({ method: "POST", headers: { "x-vercel-oidc-token": "fake" }, body: { transcript } }, capRes);
    assert.strictEqual(capRes.statusCode, 200, "a 503 on the first model must fall through");
    assert.deepStrictEqual(tried503, ["gone/model", "openai/gpt-6.1-sol-fast"]);
    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
    const errRes = fakeRes();
    await closeLoop.handler({ method: "POST", headers: { "x-vercel-oidc-token": "fake" }, body: { transcript } }, errRes);
    assert.strictEqual(errRes.statusCode, 502);
    assert.strictEqual(JSON.parse(errRes.body).status, 401, "auth failures surface immediately");
  } finally {
    global.fetch = realFetch;
    if (prevLoop === undefined) delete process.env.AI_GATEWAY_LOOP_MODEL; else process.env.AI_GATEWAY_LOOP_MODEL = prevLoop;
  }

  assert.strictEqual(closeLoop.extractContent({ choices: [{ message: { content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] } }] }), "ab", "array content parts are joined");
  assert.strictEqual(closeLoop.extractContent({ choices: [{ message: { content: "", reasoning_content: " {\"x\":1} " } }] }), '{"x":1}', "reasoning field is used when content is empty");
  assert.strictEqual(closeLoop.extractContent({}), "");

  // An empty answer from the first model must fall through to the next one.
  process.env.AI_GATEWAY_LOOP_MODEL = "quiet/model";
  const tried2 = [];
  global.fetch = async (_url, options) => {
    const m = JSON.parse(options.body).model; tried2.push(m);
    if (m === "quiet/model") return { ok: true, json: async () => ({ choices: [{ message: { content: "" } }] }) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ summary: "ok", commitments: [], blockers: [], expansionSignals: [], followUp: { subject: "", body: "" }, crm: { summary: "", nextStep: "", nextStepDate: null, stageSuggestion: "" } }) } }] }) };
  };
  try {
    const qRes = fakeRes();
    await closeLoop.handler({ method: "POST", headers: { "x-vercel-oidc-token": "fake" }, body: { transcript } }, qRes);
    assert.strictEqual(qRes.statusCode, 200);
    assert.deepStrictEqual(tried2, ["quiet/model", "openai/gpt-6.1-sol-fast"]);
    assert.strictEqual(JSON.parse(qRes.body).fallbackFrom, "quiet/model");
  } finally {
    global.fetch = realFetch;
    if (prevLoop === undefined) delete process.env.AI_GATEWAY_LOOP_MODEL; else process.env.AI_GATEWAY_LOOP_MODEL = prevLoop;
  }

  assert.strictEqual(closeLoop.looksLikeSchemaEcho({ summary: "string", commitments: [{ owner: "string", action: "string", dueDate: "string|null" }], followUp: { subject: "string", body: "string" } }), true, "schema echo detected");
  assert.strictEqual(closeLoop.looksLikeSchemaEcho({ summary: "Security follow-up.", commitments: [{ owner: "Maya", action: "Send packet", dueDate: null }] }), false, "real answers pass");

  // A schema echo from the first model must fall through too.
  process.env.AI_GATEWAY_LOOP_MODEL = "echo/model";
  const tried3 = [];
  global.fetch = async (_url, options) => {
    const m = JSON.parse(options.body).model; tried3.push(m);
    if (m === "echo/model") return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ summary: "string", commitments: [{ owner: "string", action: "string" }], followUp: { subject: "string", body: "string" }, crm: { summary: "string" } }) } }] }) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ summary: "ok", commitments: [], blockers: [], expansionSignals: [], followUp: { subject: "", body: "" }, crm: { summary: "", nextStep: "", nextStepDate: null, stageSuggestion: "" } }) } }] }) };
  };
  try {
    const eRes = fakeRes();
    await closeLoop.handler({ method: "POST", headers: { "x-vercel-oidc-token": "fake" }, body: { transcript } }, eRes);
    assert.strictEqual(eRes.statusCode, 200);
    assert.deepStrictEqual(tried3, ["echo/model", "openai/gpt-6.1-sol-fast"]);
    assert.strictEqual(JSON.parse(eRes.body).summary, "ok");
  } finally {
    global.fetch = realFetch;
    if (prevLoop === undefined) delete process.env.AI_GATEWAY_LOOP_MODEL; else process.env.AI_GATEWAY_LOOP_MODEL = prevLoop;
  }

  // A dropped connection or unreadable answer on the first model falls through as well.
  process.env.AI_GATEWAY_LOOP_MODEL = "flaky/model";
  process.env.AI_GATEWAY_FALLBACK_MODEL = "garbled/model";
  const tried4 = [];
  global.fetch = async (_url, options) => {
    const m = JSON.parse(options.body).model; tried4.push(m);
    if (m === "flaky/model") throw new Error("socket hang up");
    if (m === "garbled/model") return { ok: true, json: async () => ({ choices: [{ message: { content: "Sure! Here is my analysis without any JSON." } }] }) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ summary: "ok", commitments: [], blockers: [], expansionSignals: [], followUp: { subject: "", body: "" }, crm: { summary: "", nextStep: "", nextStepDate: null, stageSuggestion: "" } }) } }] }) };
  };
  try {
    const fRes = fakeRes();
    await closeLoop.handler({ method: "POST", headers: { "x-vercel-oidc-token": "fake" }, body: { transcript } }, fRes);
    assert.strictEqual(fRes.statusCode, 200, "thrown and unreadable answers must not end the chain");
    assert.deepStrictEqual(tried4, ["flaky/model", "garbled/model", "openai/gpt-6.1-sol-fast"]);
    assert.strictEqual(JSON.parse(fRes.body).fallbackFrom, "flaky/model");
    // When every candidate fails, the last failure is reported with its model.
    global.fetch = async () => { throw new Error("socket hang up"); };
    const allRes = fakeRes();
    await closeLoop.handler({ method: "POST", headers: { "x-vercel-oidc-token": "fake" }, body: { transcript } }, allRes);
    assert.strictEqual(allRes.statusCode, 502);
    assert.deepStrictEqual(JSON.parse(allRes.body), { model: "openai/gpt-6.1-sol-fast", error: "gateway_request_failed" });
  } finally {
    global.fetch = realFetch;
    delete process.env.AI_GATEWAY_FALLBACK_MODEL;
    if (prevLoop === undefined) delete process.env.AI_GATEWAY_LOOP_MODEL; else process.env.AI_GATEWAY_LOOP_MODEL = prevLoop;
  }

  console.log("close-loop.test.js OK");
}

module.exports = { run };
if (require.main === module) run();
