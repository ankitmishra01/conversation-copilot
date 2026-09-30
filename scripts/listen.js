#!/usr/bin/env node
// Terminal interview listener: microphone (or a file) -> cloud transcription -> live transcript with English,
// what to say next, and a separate COACH panel that reads how the conversation is going and says where to step in.
// Uses the same private API as the web app (/api/transcribe, /api/translate), so the interview memory,
// the fixed salary/location lines and the model fallbacks all apply.
//
//   npm run listen                            listen on the default microphone, using the first scenario in data/profile.json
//   npm run listen -- --role <scenarioKey>    listen using a specific scenario
//   npm run listen -- --list-devices     show audio inputs (pick one with --device N)
//   npm run listen -- --file talk.aiff   rehearse with an audio file, played in real time
//   npm run listen -- --save             also write the transcript to transcripts/<time>.md (git-ignored)
//   npm run listen -- --lang fr|en       force a language (default: auto-detect per chunk, so it follows the call)
//   npm run listen -- --debug            heartbeat with counters (plain mode)
//   npm run listen -- --jd               start on the full-screen job snapshot
//   keys: p pause/resume (while you speak), c clear, j job snapshot, q quit
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf("--" + name); return i !== -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback; };
const flag = (name) => args.indexOf("--" + name) !== -1;

function loadKey() {
  if (opt("key")) return opt("key");
  if (process.env.COPILOT_KEY) return process.env.COPILOT_KEY;
  try {
    const env = fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
    const m = /^COPILOT_KEY=(.+)$/m.exec(env);
    if (m) return m[1].trim();
  } catch (e) { /* no file */ }
  return "";
}

const profile = require("../api/_profile");
const BASE = (opt("url", process.env.COPILOT_URL || "http://localhost:3000")).replace(/\/$/, "");
const KEY = loadKey();
const scenarioKeys = Object.keys(profile.listScenarios());
const ROLE = opt("role", scenarioKeys[0] || "general");
// Language follows the call: "auto" (default) detects the scenario's source vs target language for every
// chunk; --lang <code> forces one.
const LANG_MODE = opt("lang", "auto");
const DEVICE = opt("device", "0");
const FILE = opt("file", "");
const PLAIN = flag("plain") || !process.stdout.isTTY;
const SAVE = flag("save") ? path.join(__dirname, "..", "transcripts", new Date().toISOString().replace(/[:.]/g, "-") + ".md") : "";
const activeScenario = profile.getScenario(ROLE);
const ROLE_LABEL = (activeScenario && activeScenario.label) || ROLE;
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
function saveLine(text) { if (!SAVE) return; try { fs.mkdirSync(path.dirname(SAVE), { recursive: true }); fs.appendFileSync(SAVE, text + "\n"); } catch (e) { /* not fatal */ } }

if (flag("list-devices")) {
  const out = spawnSync("ffmpeg", ["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""], { encoding: "utf8" });
  console.log((out.stderr || "").split("\n").filter((l) => /AVFoundation audio|\[\d+\]/.test(l) && !/video|Camera|Capture screen/.test(l)).join("\n"));
  process.exit(0);
}
if (!KEY) { console.error("No private key found. Set COPILOT_KEY, pass --key, or keep .env.local next to the repo."); process.exit(1); }

// ---------- state ----------
const startedAt = Date.now();
const feed = [];            // { fr, en, failed, at }
const convo = [];           // { t, fr } full running record for the coach
let say = null;             // latest full answer payload
let coach = null;           // latest coach advice
let jd = null;              // job snapshot card { job, align, keys }
const langLog = [];         // language of the last chunks ("fr" | "en"), newest last
let currentLang = null;     // language of the most recent chunk
let view = flag("jd") ? "jd" : "main";
let status = "Starting...";
let level = 0;
let paused = false;
let lastFullAt = 0, fullBusy = false, pendingText = "", pendingItems = [];
let coachBusy = false, lastCoachAt = 0, coachWords = 0;
let seq = 0, nextToShow = 0; const arrived = new Map();
let inflight = 0, endedInput = false;
let reserveHold = false;    // true while the credit reserve is protecting the configured budget (no AI calls are being made)
// The server refuses AI calls while the balance is at or below the reserved amount.
function noteReserve(r) {
  if (!(r && (r.error === "reserve_protected" || r.reserveProtected || r.gatewayStatus === "reserve_protected"))) return false;
  const g = r.reserve || r.reserveProtected;
  const bal = g && Number.isFinite(g.balance) ? "$" + g.balance.toFixed(2) : "the balance";
  const reopens = g && g.until ? " It reopens " + new Date(g.until).toLocaleString() + "." : "";
  status = "PAUSED TO PROTECT RESERVED CREDIT: " + bal + " is at or below the $" + ((g && g.reserve) || 0).toFixed(2) + " reserve. Nothing was spent." + reopens;
  if (!reserveHold) plainLog("!!!", status);
  reserveHold = true;
  return true;
}
const stats = { chunks: 0, sttOk: 0, sttErr: 0, fastErr: 0, fullErr: 0, coachErr: 0, restarts: 0, lastAudioAt: Date.now(), lastSpeechAt: 0, lastSttOkAt: 0, lastErr: "" };
process.on("unhandledRejection", (e) => { stats.lastErr = String((e && e.stack) || e); status = "Recovered from an error: " + String((e && e.message) || e); plainLog("ERR", stats.lastErr.split("\n").slice(0, 3).join(" | ")); render(); });
process.on("uncaughtException", (e) => { stats.lastErr = String((e && e.stack) || e); status = "Recovered from an error: " + String((e && e.message) || e); plainLog("ERR", stats.lastErr.split("\n").slice(0, 3).join(" | ")); render(); });

const headers = { "Content-Type": "application/json", "x-copilot-key": KEY };
async function post(pathname, body) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 30000);
  try {
    // COPILOT_RESERVE_TEST=10 makes the server behave as if 10 dollars were reserved (only ever stricter): a safe way to test the pause.
    const payload = process.env.COPILOT_RESERVE_TEST ? Object.assign({ reserveTest: Number(process.env.COPILOT_RESERVE_TEST) }, body) : body;
    const res = await fetch(BASE + pathname, { method: "POST", headers, body: JSON.stringify(payload), signal: ctl.signal });
    return await res.json();
  } finally { clearTimeout(timer); }
}
const FR_WORDS = new Set("le la les des du de un une et est que qui pour dans vous nous je ce cette pas sur avec mais ou au aux en ont sont votre notre comment pourquoi quels quelles etre avez avons peut faire tres plus bien alors donc ete il elle ils elles ca cela son sa ses leur leurs ici deja aussi tout tous toute chez entre depuis quand vos nos mon ma mes ai as a suis es sommes etes".split(" "));
const EN_WORDS = new Set("the and is are of to in that it you your we for with on this have has how what why would could can do does about our they be been was were at as from or if so not my me i an a will there their them these those which who when where than then just also very more some any into over out up his her its yes no okay well".split(" "));
// French vs English from the words themselves (fast, offline); the transcriber's own language tag breaks ties.
function detectLang(text, apiLang) {
  if (LANG_MODE === "fr" || LANG_MODE === "en") return LANG_MODE;
  const words = String(text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z']+/).filter(Boolean);
  let fr = 0, en = 0;
  words.forEach((w) => { if (FR_WORDS.has(w)) fr += 1; if (EN_WORDS.has(w)) en += 1; });
  if (fr > en) return "fr";
  if (en > fr) return "en";
  if (apiLang === "fr" || apiLang === "en") return apiLang;
  return /[àâçéèêëîïôûùüÿœ]/i.test(text) ? "fr" : "en";
}
function langSummary() {
  const recent = langLog.slice(-8); const fr = recent.filter((l) => l === "fr").length, en = recent.length - fr;
  return { fr, en, text: recent.length ? en + " English and " + fr + " French of the last " + recent.length + " chunks" : "" };
}
const mmss = (sec) => String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(Math.floor(sec % 60)).padStart(2, "0");
const elapsed = () => (Date.now() - startedAt) / 1000;

// ---------- rendering ----------
const C = { dim: "\x1b[2m", bold: "\x1b[1m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m", magenta: "\x1b[35m", reset: "\x1b[0m" };
// Visible width of a glyph: combining marks 0, CJK/emoji/warning-sign style glyphs 2, everything else 1.
function glyphWidth(ch) {
  const cp = ch.codePointAt(0);
  if (cp >= 0x300 && cp <= 0x36f) return 0;
  if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe6f) || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0x1f300 && cp <= 0x1faff) || cp === 0x26a0 || cp === 0x25b6) return 2;
  return 1;
}
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
const visLen = (s) => { let n = 0; for (const ch of stripAnsi(s)) n += glyphWidth(ch); return n; };
// Cut a line to `max` visible columns without breaking colour codes.
function clip(line, max) {
  let out = "", used = 0, i = 0;
  while (i < line.length) {
    if (line[i] === "\x1b") { const m = /^\x1b\[[0-9;?]*[A-Za-z]/.exec(line.slice(i)); if (m) { out += m[0]; i += m[0].length; continue; } }
    const ch = String.fromCodePoint(line.codePointAt(i));
    const w = glyphWidth(ch);
    if (used + w > max) break;
    out += ch; used += w; i += ch.length;
  }
  return out + C.reset;
}
const splitLong = (w, n) => { if (w.length <= n) return [w]; const parts = []; for (let i = 0; i < w.length; i += n) parts.push(w.slice(i, i + n)); return parts; };
const pad = (s, w) => s + " ".repeat(Math.max(0, w - visLen(s)));
function wrap(text, width, indent, style) {
  const room = Math.max(8, width - indent.length);
  const words = String(text || "").split(/\s+/).filter(Boolean).flatMap((w) => splitLong(w, room)); const lines = []; let cur = "";
  for (const w of words) { if ((cur + " " + w).trim().length > room) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); }
  if (cur) lines.push(cur);
  return lines.map((l) => (style || "") + indent + l + (style ? C.reset : ""));
}

function langBadge() {
  const sm = langSummary();
  if (LANG_MODE !== "auto") return "language: " + (LANG_MODE === "fr" ? "French (forced)" : "English (forced)");
  if (!currentLang) return "language: detecting";
  const name = currentLang === "fr" ? C.yellow + "FRENCH" + C.reset : C.green + "ENGLISH" + C.reset;
  return "language: " + name + (sm.fr && sm.en ? C.dim + " (mixed " + sm.en + "/" + sm.fr + ")" + C.reset : "");
}

function langShort() {
  if (LANG_MODE !== "auto") return LANG_MODE.toUpperCase();
  if (!currentLang) return "--";
  const sm = langSummary();
  return sm.fr && sm.en ? currentLang.toUpperCase() + "+" : currentLang.toUpperCase();
}

function headerLines(w) {
  const bars = "▁▂▃▄▅▆▇█"; const lv = Math.min(7, Math.floor(level * 30));
  const state = paused ? C.yellow + "PAUSED" + C.reset : C.green + "LISTENING " + bars[lv] + C.reset;
  const variants = [
    `${C.bold}Interview copilot${C.reset} · ${ROLE_LABEL} · ${langBadge()} · ${mmss(elapsed())}  ${state}`,
    `${ROLE_LABEL} · ${langShort()} · ${mmss(elapsed())}  ${state}`,
    `${langShort()} ${mmss(elapsed())} ${state}`
  ];
  const title = variants.find((v) => visLen(v) <= w) || variants[variants.length - 1];
  return [title, ...wrap(status, w, "", C.dim)];
}

function transcriptLines(w, k) {
  const out = [`${C.cyan}LIVE TRANSCRIPT${C.reset}`];
  const shown = feed.slice(-k);
  if (!shown.length) out.push(`${C.dim}  waiting for speech...${C.reset}`);
  shown.forEach((f, i) => {
    const latest = i === shown.length - 1;
    if (f.lang === "en") { wrap(f.fr, w, "  EN ", latest ? C.bold : "").forEach((l) => out.push(l)); return; }
    wrap(f.fr, w, "  FR ", C.dim).forEach((l) => out.push(l));
    wrap(f.en || (f.failed ? "(could not translate this line yet; retrying)" : "..."), w, "  EN ", latest ? C.bold : "").forEach((l) => out.push(l));
  });
  return out;
}

function sayLines(w, compact) {
  const out = [];
  if (!say) return [`${C.green}SAY THIS${C.reset}`, `${C.dim}  The suggested answer appears here after the first few seconds.${C.reset}`];
  out.push(`${C.green}SAY THIS (${say.phraseLang === "en" ? "English" : "French"})${C.reset}`);
  if (say.replyingTo && !compact) wrap("Replying to: “" + say.replyingTo + "”", w, "  ", C.dim).slice(0, 2).forEach((l) => out.push(l));
  wrap(say.phrase, w, "  ", C.bold).forEach((l) => out.push(l));
  if (!compact) {
    (say.bulletsFr || []).forEach((b) => wrap("• " + b, w, "    ").forEach((l) => out.push(l)));
    if (say.phraseOther && say.phraseLang !== "en") wrap("In English: " + say.phraseOther, w, "  ", C.dim).forEach((l) => out.push(l));
    if (say.followup) wrap("Ask back: " + say.followup, w, "  ", C.cyan).forEach((l) => out.push(l));
  }
  if (say.watch) wrap("! " + say.watch, w, "  ", C.yellow).forEach((l) => out.push(l));
  return out;
}

function coachLines(w, compact) {
  const out = [`${C.magenta}COACH${C.reset}${coach ? C.dim + "  " + coach.phase + " · updated " + Math.round((Date.now() - coach.at) / 1000) + "s ago" + C.reset : ""}`];
  if (!coach) return out.concat([`${C.dim}  Starts after the first few sentences: it tracks how the conversation is going and says when to step in.${C.reset}`]);
  wrap(coach.read, w, "  ").slice(0, compact ? 2 : 99).forEach((l) => out.push(l));
  const badge = coach.intervene === "now" ? C.red + C.bold + ">> STEP IN NOW" : coach.intervene === "at-next-pause" ? C.yellow + C.bold + ">> STEP IN AT THE NEXT PAUSE" : C.green + "== HOLD: keep listening";
  out.push("  " + badge + C.reset);
  if (coach.move) wrap("Move: " + coach.move, w, "  ").slice(0, compact ? 3 : 99).forEach((l) => out.push(l));
  if (coach.line && coach.intervene !== "hold") wrap("Say: “" + coach.line + "”", w, "  ", C.bold).forEach((l) => out.push(l));
  if (coach.avoid) wrap("Avoid: " + coach.avoid, w, "  ", C.yellow).forEach((l) => out.push(l));
  if (!compact) {
    if (coach.next && coach.next.length) wrap("Likely next: " + coach.next.join("  ·  "), w, "  ", C.dim).forEach((l) => out.push(l));
    if (coach.ask) wrap("You could ask: " + coach.ask, w, "  ", C.cyan).forEach((l) => out.push(l));
  }
  return out;
}

const trunc = (t, n) => (String(t).length > n ? String(t).slice(0, Math.max(1, n - 1)).trimEnd() + "…" : String(t));

// Job snapshot: what the job is / how your skills align / key points. `dense` = one line per item, fewer items.
function jdLines(w, dense) {
  const out = [`${C.cyan}JOB SNAPSHOT${C.reset}${jd && jd.title ? C.dim + " · " + trunc(jd.title, Math.max(10, w - 18)) + C.reset : ""}`];
  if (!jd) return out.concat([`${C.dim}  ${jdState}${C.reset}`]);
  const put = (lines, style) => lines.forEach((l) => out.push(style ? style + l + C.reset : l));
  out.push(`${C.bold}${C.cyan}1 · WHAT THE JOB IS${C.reset}`);
  (dense ? jd.job.slice(0, 3) : jd.job).forEach((b) => put(dense ? ["  • " + trunc(b, w - 4)] : wrap("• " + b, w, "  ")));
  out.push(`${C.bold}${C.green}2 · HOW YOUR SKILLS ALIGN${C.reset}`);
  (dense ? jd.align.slice(0, 5) : jd.align).forEach((a) => {
    if (dense) out.push("  " + C.bold + trunc(a.need, Math.floor((w - 6) * 0.42)) + C.reset + C.dim + " → " + trunc(a.proof, Math.floor((w - 6) * 0.58)) + C.reset);
    else { wrap(a.need, w, "  ", C.bold).forEach((l) => out.push(l)); wrap("→ " + a.proof, w, "    ", C.dim).forEach((l) => out.push(l)); }
  });
  out.push(`${C.bold}${C.yellow}3 · KEY POINTS${C.reset}`);
  (dense ? jd.keys.slice(0, 4) : jd.keys).forEach((k) => put(dense ? ["  • " + trunc(k, w - 4)] : wrap("• " + k, w, "  ")));
  return out;
}

let jdState = "Loading the job snapshot...";
async function loadSnapshot(attempt) {
  try {
    const r = await post("/api/translate", { snapshot: true, useAi: true, role: ROLE });
    if (r.title && r.job) { jd = r; render(); return; }
    jdState = "Job snapshot unavailable (" + (r.error || "no data") + ").";
  } catch (e) { jdState = "Job snapshot request failed; retrying..."; }
  render();
  if ((attempt || 0) < 5) setTimeout(() => loadSnapshot((attempt || 0) + 1), 6000);
}

let renderTimer = null;
function render() {
  if (PLAIN) return;
  clearTimeout(renderTimer);
  renderTimer = setTimeout(draw, 80);
}
function draw() {
  const cols = process.stdout.columns || 100, rows = process.stdout.rows || 40;
  const foot = C.dim + "p pause · c clear · j " + (view === "jd" ? "back to live view" : "job snapshot") + " · q quit" + C.reset;
  let screen;
  if (view === "jd") {
    // full-screen job snapshot (toggle with j): the same three sections, un-truncated
    const w = Math.min(cols, 110) - 2;
    screen = [...headerLines(w), "", ...jdLines(w, false)].slice(0, rows - 2);
  } else if (cols >= 175) {
    // three corners: transcript + answer | coach | job snapshot
    const inner = cols - 8, aW = Math.floor(inner * 0.4), bW = Math.floor(inner * 0.28), cW = inner - aW - bW;
    const A = [...headerLines(aW), "", ...transcriptLines(aW, 6), "", ...sayLines(aW, false)];
    const B = coachLines(bW, false), Cc = jdLines(cW, false);
    const n = Math.min(rows - 2, Math.max(A.length, B.length, Cc.length));
    const sep = C.dim + " │ " + C.reset;
    screen = Array.from({ length: n }, (_, i) => pad(A[i] || "", aW) + sep + pad(B[i] || "", bW) + sep + (Cc[i] || ""));
  } else if (cols >= 120) {
    // two columns: transcript + answer on the left, coach above the job snapshot on the right
    const leftW = Math.floor((cols - 5) * 0.5), rightW = cols - 5 - leftW;
    const left = [...headerLines(leftW), "", ...transcriptLines(leftW, 5), "", ...sayLines(leftW, false)];
    const coachPart = coachLines(rightW, true);
    const room = Math.max(8, rows - 2 - coachPart.length - 1);
    const right = [...coachPart, "", ...jdLines(rightW, true).slice(0, room)];
    const n = Math.min(rows - 2, Math.max(left.length, right.length));
    screen = Array.from({ length: n }, (_, i) => pad(left[i] || "", leftW) + C.dim + "  │  " + C.reset + (right[i] || ""));
  } else {
    // narrow window: stacked, shrunk step by step until it fits the height (j shows the job snapshot)
    const w = Math.min(cols, 110) - 2;
    const plans = [[4, false], [3, false], [2, false], [2, true], [1, true]];
    for (const [k, compact] of plans) {
      screen = [...headerLines(w), "", ...transcriptLines(w, k), "", ...sayLines(w, compact), "", ...coachLines(w, compact)];
      if (screen.length <= rows - 2) break;
    }
    if (screen.length > rows - 2) screen = screen.slice(0, rows - 2);
  }
  // Hard guarantee against overrun: nothing wider than the window, nothing taller than the window, no auto-wrap.
  const room = Math.max(1, rows - 1);
  const lines = screen.slice(0, room - 1).concat([foot]).slice(0, room).map((l) => clip(l, Math.max(1, cols - 1)));
  process.stdout.write("\x1b[?7l\x1b[H\x1b[2J" + lines.join("\n"));
}
function plainLog(tag, text) { if (PLAIN) console.log(`[${new Date().toLocaleTimeString("en-GB")}] ${tag} ${text}`); }

// ---------- pipeline ----------
function wav(pcm) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(16000, 24); h.writeUInt32LE(32000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const FILLER = /^(merci\.?|merci d'avoir regardé.*|sous-titr.*|thank you\.?|thanks for watching.*|\.+|…)$|^\s*context:/i;

// Never drop audio: a busy or rate-limited gateway is retried (honouring its "retry after N s" hint) for ~45 s.
async function transcribe(pcm) {
  const body = { audio: wav(pcm).toString("base64"), mediaType: "audio/wav", language: LANG_MODE, role: ROLE };
  const started = Date.now();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let wait = Math.min(2000 * (attempt + 1), 8000);
    try {
      const r = await post("/api/transcribe", body);
      if (r.keyRequired) { status = "The private key was rejected."; return { text: "" }; }
      if (noteReserve(r)) return { text: "" };
      if (!r.error) { stats.sttOk += 1; stats.lastSttOkAt = Date.now(); return { text: (r.text || "").trim(), apiLang: r.language }; }
      stats.sttErr += 1; stats.lastErr = r.error; sttErrTimes.push(Date.now());
      const hint = /retry after (\d+)s/i.exec(r.detail || "");
      if (hint) wait = Math.min(Number(hint[1]) * 1000, 15000) + 300;
      status = "Transcription rate-limited (" + r.error + "); retrying in " + Math.round(wait / 1000) + "s...";
    } catch (e) { stats.sttErr += 1; stats.lastErr = e.message; status = "Transcription request failed (" + e.message + "); retrying..."; }
    if (Date.now() - started + wait > 45000) break;
    await sleep(wait);
  }
  return null;
}

// Transcription queue: a few requests at a time. When audio backs up behind a rate limit, neighbouring chunks are
// merged into one bigger request instead of failing, so the free-tier limit slows things down but never loses speech.
const sttQueue = []; let sttActive = 0;
const STT_CONCURRENCY = 3;
function pumpStt() {
  while (sttActive < STT_CONCURRENCY && sttQueue.length) {
    const batch = [sttQueue.shift()];
    while (sttQueue.length && batch.length < 3) batch.push(sttQueue.shift());
    sttActive += 1;
    runBatch(batch).finally(() => { sttActive -= 1; pumpStt(); });
  }
}
async function runBatch(batch) {
  const result = await transcribe(Buffer.concat(batch.map((b) => b.pcm)));
  arrived.set(batch[0].id, result);
  batch.slice(1).forEach((b) => arrived.set(b.id, { text: "" }));
  while (arrived.has(nextToShow)) {
    const t = arrived.get(nextToShow); arrived.delete(nextToShow); nextToShow += 1;
    if (t === null) { feed.push({ fr: "(a few seconds of audio could not be transcribed: gateway busy)", en: "(skipped)", lang: "en", failed: false, at: Date.now() }); status = "Some audio was skipped: transcription unavailable."; plainLog("!!!", status); }
    else if (t.text && !FILLER.test(t.text)) onText(t.text, t.apiLang);
  }
  inflight -= batch.length; render(); maybeExit();
}

function onText(text, apiLang) {
  const lang = detectLang(text, apiLang);
  const switched = currentLang && currentLang !== lang && langLog.slice(-2).every((l) => l !== lang);
  langLog.push(lang); if (langLog.length > 30) langLog.shift(); currentLang = lang;
  plainLog(lang === "fr" ? "FR " : "EN ", text);
  const item = { fr: text, en: lang === "en" ? text : "", lang, failed: false, at: Date.now() };
  feed.push(item); if (feed.length > 30) feed.shift();
  convo.push({ t: elapsed(), fr: text, lang }); if (convo.length > 80) convo.shift();
  coachWords += text.split(/\s+/).length;
  if (switched) { status = lang === "fr" ? "The call switched to FRENCH: translations and extra help are on." : "The call switched to ENGLISH: plain English transcript and suggestions."; plainLog("!!!", status); }
  else status = lang === "fr" ? "Translating..." : "Listening...";
  if (lang === "fr") fastTranslate(item); else saveLine("- **EN** " + text);
  queueFull(text, item, lang);
  render();
}

async function fastTranslate(item) {
  inflight += 1;
  const waits = [1200, 2500];
  for (let attempt = 0; attempt <= waits.length && !item.en; attempt += 1) {
    try {
      const prev = feed[feed.indexOf(item) - 1];
      const r = await post("/api/translate", { text: item.fr, previous: prev ? prev.fr : "", direction: "fr-en", fast: true, useAi: true });
      if (noteReserve(r)) { item.en = "(paused: credit reserve)"; item.failed = false; break; }
      if (r.mode === "ai-fast" && r.translation) { reserveHold = false; item.en = r.translation; plainLog("EN ", r.translation); saveLine("- **FR** " + item.fr + "\n  **EN** " + r.translation); status = "Listening..."; break; }
      stats.fastErr += 1; stats.lastErr = r.error || "fast_failed";
    } catch (e) { stats.fastErr += 1; stats.lastErr = e.message; }
    if (attempt < waits.length) await sleep(waits[attempt]);
  }
  if (!item.en) { item.failed = true; scheduleLateRetry(item, 1); }
  inflight -= 1; render(); maybeExit();
}

// Still no English: keep trying quietly every 8 s (up to 4 more times); the full answer may also fill it in.
function scheduleLateRetry(item, n) {
  if (n > 4) return;
  setTimeout(async () => {
    if (item.en || !feed.includes(item)) return;
    try {
      const r = await post("/api/translate", { text: item.fr, direction: "fr-en", fast: true, useAi: true });
      if (r.mode === "ai-fast" && r.translation) { item.en = r.translation; item.failed = false; saveLine("- **FR** " + item.fr + "\n  **EN** " + r.translation); render(); return; }
    } catch (e) { /* try again */ }
    scheduleLateRetry(item, n + 1);
  }, 8000);
}

let pendingLang = "fr";
function queueFull(text, item, lang) {
  pendingText = (pendingText ? pendingText + " " : "") + text; pendingItems.push(item); pendingLang = lang || pendingLang;
  flushFull();
}
async function flushFull() {
  if (fullBusy || !pendingText) return;
  const wait = 5000 - (Date.now() - lastFullAt);
  if (wait > 0) { setTimeout(flushFull, wait + 30); return; }
  const text = pendingText, items = pendingItems, lang = pendingLang; pendingText = ""; pendingItems = []; fullBusy = true; lastFullAt = Date.now(); inflight += 1;
  try {
    const r = await post("/api/translate", { text, mode: "interview", role: ROLE, direction: lang === "fr" ? "fr-en" : "en-fr", conversation: { currentTopic: "", recent: feed.slice(-4).map((f) => ({ topic: "", text: f.fr })) }, useAi: true });
    if (noteReserve(r)) { /* nothing spent; the previous answer stays on screen */ }
    else if (r.mode === "ai-gateway") {
      reserveHold = false;
      // A real interview alternates question and small talk: keep the answer to the latest QUESTION on screen
      // (labelled with what it replies to) unless it is stale, instead of overwriting it with chatter.
      const stale = !say || Date.now() - say.at > 60000;
      if (r.isQuestion !== false || stale) say = Object.assign(r, { at: Date.now(), replyingTo: lang === "fr" ? (r.translation || text) : text });
      else say.holdNote = true;
      plainLog("SAY", r.phrase + (r.phraseOther && r.phraseLang !== "en" ? "\n           EN: " + r.phraseOther : "") + (r.watch ? "\n           WARNING: " + r.watch : ""));
      saveLine("  > **Say:** " + r.phrase + (r.watch ? "  \n  > _Warning: " + r.watch + "_" : ""));
      // The answer call also translated this text: use it to fill any line whose own translation failed.
      items.filter((it) => !it.en && r.translation && it.lang === "fr").forEach((it) => { it.en = "≈ " + r.translation; it.failed = false; });
    } else { stats.fullErr += 1; if (!say) status = "Answer unavailable (rough fallback only)."; }
  } catch (e) { stats.fullErr += 1; /* keep the previous answer on screen */ }
  fullBusy = false; inflight -= 1; render();
  if (pendingText) flushFull(); else maybeExit();
}

// ---------- coach ----------
async function coachTick() {
  if (paused || coachBusy || !convo.length) return;
  if (coachWords < 8 || Date.now() - lastCoachAt < 12000) return;
  coachBusy = true; lastCoachAt = Date.now(); coachWords = 0; inflight += 1;
  try {
    const transcript = convo.slice(-30).map((c) => "[" + mmss(c.t) + "] " + c.fr).join("\n");
    const r = await post("/api/translate", { coach: true, useAi: true, role: ROLE, transcript, elapsedSec: elapsed(), lastSay: say ? say.phrase : "", language: { latest: currentLang || "en", note: langSummary().text } });
    if (noteReserve(r)) { lastCoachAt = Date.now() + 45000; coachWords = 8; }
    else if (r.mode === "ai-coach") {
      coach = Object.assign(r, { at: Date.now() });
      plainLog("COACH", `[${r.phase}] ${r.intervene.toUpperCase()} | ${r.read}\n           move: ${r.move}${r.line ? "\n           say: " + r.line : ""}${r.avoid ? "\n           avoid: " + r.avoid : ""}`);
      saveLine("  > **Coach (" + r.phase + ", " + r.intervene + "):** " + r.read + " Move: " + r.move + (r.line ? " Say: " + r.line : ""));
    } else { stats.coachErr += 1; coachWords = 8; }
  } catch (e) { stats.coachErr += 1; coachWords = 8; }
  coachBusy = false; inflight -= 1; render(); maybeExit();
}
setInterval(coachTick, 3000);

function maybeExit() {
  if (!endedInput || inflight > 0 || fullBusy || pendingText || coachBusy) return;
  if (FILE && PLAIN) setTimeout(() => process.exit(0), 300);
}

// ---------- capture + chunking ----------
const inputArgs = FILE ? ["-re", "-i", FILE] : ["-f", "avfoundation", "-i", ":" + DEVICE];
const WINDOW = 3200; // 100 ms of 16 kHz 16-bit mono
let carry = Buffer.alloc(0), chunk = [], chunkPeak = 0, quietRun = 0, threshold = 0;
const recent = [];

function rms(buf) { let s = 0; const n = buf.length / 2; for (let i = 0; i < n; i++) { const v = buf.readInt16LE(i * 2) / 32768; s += v * v; } return Math.sqrt(s / n); }
function emit(windows) { const id = seq++; stats.chunks += 1; inflight += 1; sttQueue.push({ id, pcm: Buffer.concat(windows) }); pumpStt(); }

// No fixed loudness threshold (one that adapts to continuous sound can climb above the speech and silently stop
// everything). Audio goes out on a steady cadence: cut at the first relatively quiet moment once 3 s long, and
// always by 6 s. Only chunks that are essentially digital silence are skipped; the transcriber decides what is speech.
// Chunks whose loudest 0.1 s stays under this are silence or room hiss: never sent (the transcriber invents text on them).
const DEAD_SILENCE = 0.010;
// Under rate limiting, use longer chunks automatically (fewer requests per minute); back to normal when it clears.
const sttErrTimes = [];
function chunkTargets() {
  const now = Date.now();
  while (sttErrTimes.length && now - sttErrTimes[0] > 60000) sttErrTimes.shift();
  return sttErrTimes.length >= 2 ? { min: 50, max: 90 } : { min: 30, max: 60 };
}
function onWindow(win) {
  const r = rms(win); level = level * 0.6 + r * 0.4;
  stats.lastAudioAt = Date.now();
  if (r > DEAD_SILENCE) stats.lastSpeechAt = Date.now();
  recent.push(r); if (recent.length > 100) recent.shift();
  if (paused) { chunk = []; chunkPeak = 0; quietRun = 0; return; }
  chunk.push(win); chunkPeak = Math.max(chunkPeak, r);
  const loud = recent.slice().sort((x, y) => x - y)[Math.floor(recent.length * 0.9)] || r;
  threshold = Math.max(DEAD_SILENCE, loud * 0.3);
  quietRun = r < threshold ? quietRun + 1 : 0;
  const target = chunkTargets();
  if ((chunk.length >= target.min && quietRun >= 3) || chunk.length >= target.max) {
    if (chunkPeak > DEAD_SILENCE) emit(chunk);
    chunk = []; chunkPeak = 0; quietRun = 0;
  }
  render();
}

let ff = null, ffKilledOnPurpose = false;
function startCapture() {
  ffKilledOnPurpose = false;
  ff = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", ...inputArgs, "-ac", "1", "-ar", "16000", "-f", "s16le", "pipe:1"]);
  stats.lastAudioAt = Date.now();
  ff.stderr.on("data", (d) => { const m = String(d).trim(); if (m) { status = "ffmpeg: " + m.split("\n")[0]; render(); } });
  ff.on("error", (e) => { console.error("Could not start ffmpeg:", e.message); process.exit(1); });
  ff.stdout.on("data", (d) => {
    carry = Buffer.concat([carry, d]);
    while (carry.length >= WINDOW) { onWindow(carry.subarray(0, WINDOW)); carry = carry.subarray(WINDOW); }
  });
  ff.stdout.on("end", () => {
    if (ffKilledOnPurpose) return;
    if (FILE) { if (chunk.length >= 5 && chunkPeak > DEAD_SILENCE) emit(chunk); chunk = []; endedInput = true; status = "File finished."; maybeExit(); render(); return; }
    stats.restarts += 1; status = "Microphone stream stopped; reconnecting (" + stats.restarts + ")..."; plainLog("!!!", status); render();
    setTimeout(startCapture, 1000);
  });
}
function restartCapture(reason) {
  if (FILE) return;
  stats.restarts += 1; status = reason + " Reconnecting (" + stats.restarts + ")..."; plainLog("!!!", status);
  ffKilledOnPurpose = true; try { ff.kill(); } catch (e) { /* gone */ }
  setTimeout(startCapture, 800);
}

// Watchdog + honest status: a stalled stream is restarted, and the screen says when nothing is being heard.
setInterval(() => {
  const now = Date.now();
  if (!FILE && now - stats.lastAudioAt > 6000) restartCapture("No audio from the microphone for 6 s.");
  if (!PLAIN && !paused && !/busy|failed|skipped|Reconnecting|rejected|Recovered|Translating|ffmpeg|PAUSED TO PROTECT/i.test(status)) {
    const quietFor = stats.lastSpeechAt ? Math.round((now - stats.lastSpeechAt) / 1000) : Math.round((now - startedAt) / 1000);
    const lastOk = stats.lastSttOkAt ? Math.round((now - stats.lastSttOkAt) / 1000) + "s ago" : "none yet";
    status = quietFor > 15
      ? "NOT HEARING SOUND for " + quietFor + "s. Is the call playing through the speakers, and is the volume up? (mic level " + level.toFixed(3) + ")"
      : "Listening · sound " + level.toFixed(3) + " · last transcription " + lastOk + " · " + stats.sttOk + " chunks" + (stats.sttErr ? " · " + stats.sttErr + " retries" : "");
  }
  if (!PLAIN) render();
  if (flag("debug")) plainLog("hb ", `level=${level.toFixed(4)} thr=${threshold.toFixed(4)} win=${chunk.length} chunks=${stats.chunks} sttOk=${stats.sttOk} sttErr=${stats.sttErr} fastErr=${stats.fastErr} fullErr=${stats.fullErr} coachErr=${stats.coachErr} restarts=${stats.restarts} inflight=${inflight} lastErr=${stats.lastErr || "-"}`);
}, 5000);

// ---------- keys ----------
if (process.stdin.isTTY) {
  readline.emitKeypressEvents(process.stdin); process.stdin.setRawMode(true);
  process.stdin.on("keypress", (str, key) => {
    if (key && (key.name === "q" || (key.ctrl && key.name === "c"))) { ffKilledOnPurpose = true; try { ff.kill(); } catch (e) { /* gone */ } process.stdout.write("\x1b[?25h\n"); process.exit(0); }
    if (key && key.name === "p") { paused = !paused; status = paused ? "Paused: audio is ignored while you speak. Press p to resume." : "Listening..."; render(); }
    if (key && key.name === "j") { view = view === "jd" ? "main" : "jd"; render(); }
    if (key && key.name === "c") { feed.length = 0; convo.length = 0; say = null; coach = null; pendingText = ""; pendingItems = []; status = "Cleared."; render(); }
  });
}
process.on("exit", () => { try { ffKilledOnPurpose = true; ff.kill(); } catch (e) { /* already gone */ } if (!PLAIN) process.stdout.write("\x1b[?7h\x1b[?25h"); });
if (!PLAIN) process.stdout.write("\x1b[3J\x1b[H\x1b[2J\x1b[?25l");
process.stdout.on("resize", render);
startCapture();
loadSnapshot(0);
plainLog("···", `Interview copilot · ${ROLE_LABEL} · ${FILE ? "file " + FILE : "mic device " + DEVICE} · ${BASE}`);
render();
