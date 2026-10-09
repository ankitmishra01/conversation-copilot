// api/transcribe.js
// Cloud speech-to-text for the terminal listener (scripts/listen.js), through the AI Gateway (beta REST API).
// Key-gated and expiry-gated exactly like /api/translate.
const { keyOk, accessState, reserveGuard, rateLimit } = require("./_access");
const profile = require("./_profile");

const ENDPOINT = "https://ai-gateway.vercel.sh/v4/ai/transcription-model";
const MAX_AUDIO_BASE64 = 3 * 1024 * 1024;
const MODELS = process.env.AI_GATEWAY_STT_MODEL ? [process.env.AI_GATEWAY_STT_MODEL] : ["openai/gpt-4o-mini-transcribe", "openai/gpt-4o-transcribe", "openai/whisper-1", "google/gemini-3.5-transcribe"];

const strip = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Domain vocabulary comes from the active scenario's config, not a hardcoded list, so speech recognition
// gets a useful hint whatever the user's business is.
function hintFor(scenarioKey) {
  const scenario = profile.getScenario(scenarioKey);
  const terms = (scenario && scenario.domainVocabulary) || [];
  return terms.join(", ");
}
function hintTokensFor(scenarioKey) {
  const terms = hintFor(scenarioKey);
  return new Set(strip(terms).split(/[^a-z]+/).filter((w) => w.length >= 3));
}

// Speech models invent text on silence or noise: they echo the vocabulary hint, or emit stock subtitle
// phrases. Anything like that is treated as "no speech" instead of being shown as if someone said it.
function isHallucination(text, hintTokens) {
  const norm = strip(text);
  if (!norm.trim()) return true;
  if (/^\s*context:/.test(norm)) return true;
  if (/(sous-titr|amara\.org|merci d'avoir regarde|thanks for watching|thank you for watching|subtitles? by|abonnez-vous)/.test(norm)) return true;
  const tokens = norm.split(/[^a-z]+/).filter((w) => w.length >= 3);
  if (tokens.length >= 5 && hintTokens && hintTokens.size) {
    const inHint = tokens.filter((w) => hintTokens.has(w));
    // A small domainVocabulary (a plausible, even common, user config) can never produce 5 unique hint
    // matches, so the "echoed the hint" threshold scales down to the vocabulary's own size instead of a
    // fixed 5 — otherwise this filter would be permanently unreachable for anyone with a short vocabulary.
    const requiredUnique = Math.min(5, hintTokens.size);
    if (new Set(inHint).size >= requiredUnique && inHint.length / tokens.length >= 0.7) return true;
  }
  return false;
}

function normalizeLanguage(value) {
  const v = String(value || "").toLowerCase();
  if (/^(en|eng)/.test(v)) return "en";
  if (/^(fr|fre)/.test(v)) return "fr";
  return undefined;
}

async function callGateway(token, model, payload) {
  return fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "ai-gateway-protocol-version": "0.0.1",
      "ai-transcription-model-specification-version": "4",
      "ai-model-id": model,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

// Models that just returned 429 are skipped until their retry window ends (per warm function instance), so a
// rate-limited model does not cost a failed round trip on every chunk.
const cooling = new Map();

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const send = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
  if (req.method !== "POST") return send(405, { error: "method_not_allowed" });
  const limited = rateLimit(req, "transcribe", 60);
  if (!limited.ok) { res.setHeader("Retry-After", String(limited.retryAfter)); return send(429, { error: "rate_limited", retryAfter: limited.retryAfter }); }
  try {
    const state = accessState();
    if (!state.active) return send(200, { error: "copilot_expired" });
    if (!keyOk(req)) return send(200, { error: "key_required", keyRequired: true });
    const body = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}");
    const audio = String(body.audio || "");
    if (!audio) return send(200, { error: "no_audio" });
    if (audio.length > MAX_AUDIO_BASE64) return send(200, { error: "audio_too_large" });
    const oidcHeader = req.headers && (req.headers["x-vercel-oidc-token"] || req.headers["X-Vercel-Oidc-Token"]);
    const token = oidcHeader || process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY;
    if (!token) return send(200, { error: "missing_gateway_auth" });
    const guard = await reserveGuard(token, body.reserveTest);
    if (!guard.ok) return send(200, { error: "reserve_protected", reserve: guard });
    const language = body.language === "en" ? "en" : body.language === "fr" ? "fr" : "auto";
    const mediaType = body.mediaType || "audio/wav";
    const hint = hintFor(body.role);
    const hintTokens = hintTokensFor(body.role);
    const chain = body.model && MODELS.indexOf(body.model) !== -1 ? [body.model] : MODELS;
    let last = { status: 0, detail: "" };
    const usable = chain.filter((m) => !(cooling.get(m) > Date.now()));
    for (const model of usable.length ? usable : chain) {
      const provider = model.split("/")[0];
      const options = provider === "openai" && hint ? { openai: language === "auto" ? { prompt: hint } : { language, prompt: hint } } : provider === "openai" && language !== "auto" ? { openai: { language } } : undefined;
      let response = await callGateway(token, model, options ? { audio, mediaType, providerOptions: options } : { audio, mediaType });
      if (!response.ok && response.status >= 400 && response.status < 500 && ![401, 403, 429].includes(response.status) && options) {
        response = await callGateway(token, model, { audio, mediaType });
      }
      if (response.ok) {
        const json = await response.json();
        const text = String(json.text || "").trim();
        if (!text || isHallucination(text, hintTokens)) return send(200, { text: "", filtered: Boolean(text), language: normalizeLanguage(json.language), model });
        return send(200, { text, language: normalizeLanguage(json.language), durationInSeconds: json.durationInSeconds, model });
      }
      let detail = "";
      try { detail = (await response.text()).slice(0, 200); } catch (e) { /* ignore */ }
      last = { status: response.status, detail, model };
      if (response.status === 429) {
        const hintMatch = /retry after (\d+)s/i.exec(detail);
        cooling.set(model, Date.now() + Math.min(Number(hintMatch ? hintMatch[1] : 20), 60) * 1000);
      }
    }
    return send(200, { error: "gateway_http_" + last.status, detail: last.detail, model: last.model });
  } catch (e) {
    return send(200, { error: "transcribe_exception" });
  }
};

module.exports.hintFor = hintFor;
module.exports.hintTokensFor = hintTokensFor;
module.exports.isHallucination = isHallucination;
