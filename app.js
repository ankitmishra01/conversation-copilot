(function () {
  var channel = null;
  try { channel = new BroadcastChannel("interview-copilot"); } catch (e) { channel = null; }
  var MIRROR_TEXT_IDS = ["status", "translation", "direct", "phraseLabel", "phrase", "phraseGloss", "phraseWatch", "followup", "topic"];

  // The mini window only DISPLAYS: listening stays in the main tab (Chrome 153 crashes or reloads pages that
  // run speech recognition next to a Picture-in-Picture window). Buttons here just send commands back.
  function runMirror() {
    function el(id) { return document.getElementById(id); }
    document.body.classList.add("overlay-mode", "compact", "pip", "mirror");
    document.title = "Interview copilot";
    el("status").textContent = "Waiting for the copilot tab...";
    if (!channel) {
      el("status").textContent = "This browser cannot link the two windows.";
      return;
    }
    var lastSeen = Date.now();
    channel.onmessage = function (e) {
      var m = e.data || {};
      if (m.type !== "state") return;
      lastSeen = Date.now();
      MIRROR_TEXT_IDS.forEach(function (id) { if (m.text && m.text[id] !== undefined) el(id).textContent = m.text[id]; });
      el("phraseGloss").hidden = !!(m.hidden && m.hidden.phraseGloss);
      el("phraseWatch").hidden = !!(m.hidden && m.hidden.phraseWatch);
      var list = el("sayPoints");
      list.innerHTML = "";
      (m.points || []).forEach(function (t) { var li = document.createElement("li"); li.textContent = t; list.appendChild(li); });
      var flow = el("flow");
      if (flow) {
        flow.innerHTML = "";
        (m.flow || []).forEach(function (f) { var p = document.createElement("p"); p.className = f.cls; p.textContent = f.text; flow.appendChild(p); });
      }
      document.body.classList.toggle("paused-for-answer", !!m.paused);
      document.body.classList.toggle("expired", !!m.expired);
      el("pauseMine").textContent = m.paused ? "Resume incoming" : "Pause my voice";
      el("autoAnswer").checked = !!m.auto;
    };
    ["start", "pauseMine", "stop", "clear", "translate"].forEach(function (id) {
      el(id).addEventListener("click", function () { channel.postMessage({ type: "cmd", cmd: id }); });
    });
    el("autoAnswer").addEventListener("change", function () { channel.postMessage({ type: "cmd", cmd: "auto", checked: el("autoAnswer").checked }); });
    channel.postMessage({ type: "hello" });
    setInterval(function () {
      if (Date.now() - lastSeen > 15000) el("status").textContent = "The copilot tab is closed or asleep. Reopen it and press Start listening.";
    }, 3000);
  }
  if (new URLSearchParams(window.location.search || "").get("mirror") === "1") {
    runMirror();
    return;
  }

  var profileData = null;

  function activeScenario() {
    if (!profileData || !profileData.scenarios) return null;
    var keys = Object.keys(profileData.scenarios);
    return profileData.scenarios[roleEl.value] || (keys.length ? profileData.scenarios[keys[0]] : null);
  }

  var SPEECH_LOCALES = { en: "en-US", fr: "fr-CA", es: "es-ES", de: "de-DE", pt: "pt-BR", it: "it-IT" };
  function speechLocaleFor(code) {
    return SPEECH_LOCALES[code] || (code ? code + "-US" : "en-US");
  }

  var modeEl = document.getElementById("mode");
  var roleEl = document.getElementById("role");
  var startBtn = document.getElementById("start");
  var pauseMineBtn = document.getElementById("pauseMine");
  var stopBtn = document.getElementById("stop");
  var clearBtn = document.getElementById("clear");
  var compactBtn = document.getElementById("compact");
  var overlayBtn = document.getElementById("overlay");
  var translateBtn = document.getElementById("translate");
  var transcriptEl = document.getElementById("transcript");
  var transcriptTitle = document.getElementById("transcriptTitle");
  var accessNotice = document.getElementById("accessNotice");
  var translationEl = document.getElementById("translation");
  var translationTitle = document.getElementById("translationTitle");
  var topicEl = document.getElementById("topic");
  var focusSummaryEl = document.getElementById("focusSummary");
  var focusBulletsEl = document.getElementById("focusBullets");
  var intentEl = document.getElementById("intent");
  var directEl = document.getElementById("direct");
  var proofEl = document.getElementById("proof");
  var phraseEl = document.getElementById("phrase");
  var phraseLabel = document.getElementById("phraseLabel");
  var followupEl = document.getElementById("followup");
  var profileStatus = document.getElementById("profileStatus");
  var fitSummary = document.getElementById("fitSummary");
  var proofBank = document.getElementById("proofBank");
  var verbBank = document.getElementById("verbBank");
  var answerEl = document.getElementById("answer");
  var answerTitle = document.getElementById("answerTitle");
  var scoreBtn = document.getElementById("score");
  var copyBtn = document.getElementById("copy");
  var scoreText = document.getElementById("scoreText");
  var feedbackEl = document.getElementById("feedback");
  var statusEl = document.getElementById("status");
  var autoAnswerEl = document.getElementById("autoAnswer");
  var popoutBtn = document.getElementById("popout");
  var phraseGlossEl = document.getElementById("phraseGloss");
  var phraseWatchEl = document.getElementById("phraseWatch");
  var mainEl = document.querySelector("main");
  var flowEl = document.getElementById("flow");
  var copilotKey = "";
  var lastPayload = null;
  var autoTimer = null;
  var autoOffset = 0;
  var autoBusy = false;
  var autoPending = false;
  var reqSeq = 0;
  var flowItems = [];
  var flowSeq = 0;
  var lastReqAt = 0;
  var pendingText = "";
  var lastFullAt = 0;
  var recognition = null;
  var translateTimer = null;
  var pausedForAnswer = false;
  var conversationHistory = [];
  var currentTopic = "listening";
  var lastHistoryText = "";
  var wantListening = false;
  var restartTimer = null;
  var failStreak = 0;

  var timerWorker = null;
  var timerCallbacks = {};
  var timerSeq = 0;

  // setTimeout that keeps its pace in a background tab (page timers are throttled there, a worker's are not).
  function bgTimeout(fn, ms) {
    try {
      if (!timerWorker) {
        var src = "self.onmessage=function(e){var id=e.data.id;setTimeout(function(){self.postMessage(id)},e.data.ms)}";
        timerWorker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
        timerWorker.onmessage = function (e) {
          var cb = timerCallbacks[e.data];
          delete timerCallbacks[e.data];
          if (cb) cb();
        };
      }
      var id = ++timerSeq;
      timerCallbacks[id] = fn;
      timerWorker.postMessage({ id: id, ms: ms });
      return { worker: id };
    } catch (e) {
      return { timeout: setTimeout(fn, ms) };
    }
  }

  function clearBgTimeout(handle) {
    if (!handle) return;
    if (handle.worker) delete timerCallbacks[handle.worker];
    if (handle.timeout) clearTimeout(handle.timeout);
  }

  function toggleBodyClass(name, on) {
    document.body.classList.toggle(name, on);
  }

  var accessActive = true;
  function renderAccessState(state) {
    if (state) accessActive = state.active !== false;
    toggleBodyClass("expired", !accessActive);
    if (accessNotice) accessNotice.textContent = (state && state.message) || (accessActive ? "" : "Copilot access window closed.");
    startBtn.disabled = !accessActive;
    if (pauseMineBtn) pauseMineBtn.disabled = !accessActive;
    translateBtn.disabled = !accessActive;
    return accessActive;
  }

  function setAnswerPause(paused) {
    pausedForAnswer = Boolean(paused);
    toggleBodyClass("paused-for-answer", pausedForAnswer);
    if (pauseMineBtn) {
      pauseMineBtn.textContent = pausedForAnswer ? "Resume incoming" : "Pause my voice";
      pauseMineBtn.setAttribute("aria-pressed", pausedForAnswer ? "true" : "false");
    }
  }

  function normalize(text) {
    return String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function words(text) {
    return String(text || "").trim().split(/\s+/).filter(Boolean);
  }

  // Keep the most recent speech: continuous recognition piles everything into one textarea.
  function latest(text, limit) {
    var t = String(text || "").replace(/\s+/g, " ").trim();
    if (t.length <= limit) return t;
    var tail = t.slice(-limit);
    var space = tail.indexOf(" ");
    return space > 0 && space < 40 ? tail.slice(space + 1) : tail;
  }

  // Word-aware matching: short terms must be whole words ("ai", "je", "90" no longer hit inside other words);
  // longer terms match from a word start on a trimmed stem so conjugations count ("clarifie" ~ "clarifier").
  function hits(text, terms) {
    var padded = " " + normalize(text).replace(/[^a-z0-9']+/g, " ").trim() + " ";
    return (terms || []).filter(function (term) {
      var t = normalize(term).replace(/[^a-z0-9']+/g, " ").trim();
      if (!t) return false;
      if (t.indexOf(" ") !== -1) return padded.indexOf(" " + t) !== -1;
      if (t.length <= 3) return padded.indexOf(" " + t + " ") !== -1;
      return padded.indexOf(" " + t.slice(0, Math.max(4, t.length - 2))) !== -1;
    });
  }

  function inferTopic(text) {
    var norm = normalize(latest(text, 400));
    if (!norm) return currentTopic || "listening";
    var scenario = activeScenario();
    var vocabulary = (scenario && scenario.domainVocabulary) || [];
    if (vocabulary.length && hits(norm, vocabulary).length) return "scenario topic";
    if (hits(norm, ["salary", "compensation", "pay", "rate", "price", "discount", "cost"]).length) return "compensation or pricing";
    if (norm.split(/\s+/).length > 3) return "current question";
    return currentTopic || "listening";
  }

  function setTopic(topic) {
    currentTopic = topic || currentTopic || "listening";
    if (topicEl) topicEl.textContent = "Topic: " + currentTopic;
  }

  function rememberSnippet(text, source) {
    var cleanText = latest(text, 420);
    if (!cleanText || cleanText === lastHistoryText) return;
    lastHistoryText = cleanText;
    var topic = inferTopic(cleanText);
    setTopic(topic);
    conversationHistory.push({
      source: source || "transcript",
      role: roleEl.value,
      topic: topic,
      text: cleanText,
      at: new Date().toISOString()
    });
    if (conversationHistory.length > 8) conversationHistory = conversationHistory.slice(-8);
  }

  function conversationContext() {
    return {
      currentTopic: currentTopic,
      recent: conversationHistory.slice(-5)
    };
  }

  function preferredVerbs() {
    if (profileData && profileData.style && Array.isArray(profileData.style.preferredVerbs) && profileData.style.preferredVerbs.length) {
      return profileData.style.preferredVerbs;
    }
    return ["clarify", "prioritize", "align", "ship", "measure"];
  }

  function renderContextPanel() {
    var scenario = activeScenario();
    var verbs = preferredVerbs();
    if (profileStatus) profileStatus.textContent = profileData ? (profileData.you ? "Profile loaded" : "Profile has no 'you' section yet") : "Profile fallback";
    if (verbBank) verbBank.textContent = verbs.join(", ");
    if (!fitSummary || !proofBank) return;
    proofBank.innerHTML = "";
    if (!scenario) {
      fitSummary.textContent = "No scenario configured yet. Add one under \"scenarios\" in data/profile.json.";
      return;
    }
    fitSummary.textContent = scenario.fitSummary || "Use one direct answer, one proof point, and a link back to your goal.";
    (scenario.proofBank || []).forEach(function (item) {
      var li = document.createElement("li");
      li.textContent = item;
      proofBank.appendChild(li);
    });
  }

  function renderFocusBullets(items) {
    var bullets = Array.isArray(items) && items.length ? items : ["Answer directly.", "Give one concrete example.", "Link it back to your goal."];
    var sayPoints = document.getElementById("sayPoints");
    focusBulletsEl.innerHTML = "";
    if (sayPoints) sayPoints.innerHTML = "";
    bullets.slice(0, 4).forEach(function (item) {
      var li = document.createElement("li");
      li.textContent = item;
      focusBulletsEl.appendChild(li);
      if (sayPoints) {
        var copy = document.createElement("li");
        copy.textContent = item;
        sayPoints.appendChild(copy);
      }
    });
  }

  function updateAnswerBlock(text, payload) {
    text = latest(text, 400);
    var scenario = activeScenario();
    var style = (profileData && profileData.style) || {};
    translationEl.textContent = payload && payload.translation ? payload.translation : (text ? "Waiting for the AI translation..." : "Translation or notes will appear here.");
    focusSummaryEl.textContent = payload && payload.focus ? payload.focus : "Configure AI_GATEWAY_API_KEY for live coaching, or write your own notes here.";
    renderFocusBullets(payload && payload.bullets ? payload.bullets : null);
    if (payload && payload.topic) setTopic(payload.topic);
    else if (text) setTopic(inferTopic(text));
    intentEl.textContent = payload && payload.intent ? payload.intent : "";
    directEl.textContent = payload && payload.direct ? payload.direct : "";
    proofEl.textContent = payload && payload.proof ? payload.proof : (scenario && scenario.proofBank ? scenario.proofBank.slice(0, 2).join(" ") : "Add proofBank entries to your scenario in data/profile.json.");
    phraseEl.textContent = payload && payload.phrase ? payload.phrase : ((style.safeSentenceStarters && style.safeSentenceStarters[0]) || "Waiting for AI input.");
    renderSayExtras(payload);
    followupEl.textContent = payload && payload.followup ? payload.followup : (scenario && scenario.questionsToAsk ? scenario.questionsToAsk[0] : "");
    renderContextPanel();
  }

  function renderSayExtras(payload) {
    var ai = payload && payload.mode === "ai-gateway";
    if (ai) {
      var lang = payload.phraseLang === "en" ? "English" : "French";
      phraseLabel.textContent = "Say this (" + lang + ")";
    }
    if (phraseGlossEl) {
      var other = ai && payload.phraseOther ? (payload.phraseLang === "en" ? "En français : " : "In English: ") + payload.phraseOther : "";
      phraseGlossEl.textContent = other;
      phraseGlossEl.hidden = !other;
    }
    if (phraseWatchEl) {
      var watch = ai && payload.watch ? "Careful: " + payload.watch : "";
      phraseWatchEl.textContent = watch;
      phraseWatchEl.hidden = !watch;
    }
  }

  function renderScenarioLabels() {
    var scenario = activeScenario();
    var lang = (scenario && scenario.language) || { source: "en", target: "en" };
    var notesMode = lang.source === lang.target;
    transcriptTitle.textContent = notesMode ? "Live transcript" : (lang.source.toUpperCase() + " transcript");
    translationTitle.textContent = notesMode ? "Notes" : (lang.target.toUpperCase() + " meaning");
    phraseLabel.textContent = "Suggested answer";
    answerTitle.textContent = "Your practice answer";
    transcriptEl.placeholder = "Live transcript appears here. You can also paste text manually.";
    answerEl.placeholder = "Draft your answer here, then score it.";
    if (!wantListening) statusEl.textContent = "Ready.";
    lastPayload = null;
    updateAnswerBlock(transcriptEl.value.trim(), null);
    if (wantListening && recognition) openRecognizer();
  }

  function applyLaunchParams() {
    var params = new URLSearchParams(window.location.search || "");
    var requestedRole = params.get("role");
    var requestedMode = params.get("mode");
    if (requestedRole && profileData && profileData.scenarios && profileData.scenarios[requestedRole]) roleEl.value = requestedRole;
    if (requestedMode && ["conversation", "recording"].indexOf(requestedMode) !== -1) modeEl.value = requestedMode;
    if (params.get("compact") === "1") {
      document.body.classList.add("compact");
      compactBtn.textContent = "Full";
    }
    if (params.get("overlay") === "1") {
      document.body.classList.add("overlay-mode", "compact");
      compactBtn.textContent = "Full";
      overlayBtn.textContent = "Exit overlay";
    }
    if (params.get("desktop") === "1") {
      document.body.classList.add("desktop-shell");
      ensureDesktopControls();
    }
  }

  function ensureDesktopControls() {
    if (document.getElementById("desktopClose")) return;
    var handle = document.createElement("div");
    handle.id = "dragHandle";
    handle.className = "drag-handle";
    handle.textContent = "Drag here to move";
    document.body.insertBefore(handle, document.body.firstChild);
    var closeBtn = document.createElement("button");
    closeBtn.id = "desktopClose";
    closeBtn.type = "button";
    closeBtn.className = "desktop-close";
    closeBtn.setAttribute("aria-label", "Close desktop overlay");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", function () {
      if (window.desktopOverlay && typeof window.desktopOverlay.close === "function") window.desktopOverlay.close();
      else window.close();
    });
    document.body.appendChild(closeBtn);
  }

  function flowClass(item, index) {
    return "flow-item" + (item.en ? "" : " pending") + (index === flowItems.length - 1 ? " latest" : "");
  }

  function flowSnapshot() {
    return flowItems.map(function (item, index) { return { cls: flowClass(item, index), text: item.en || "..." }; });
  }

  function renderFlow() {
    if (!flowEl) return;
    flowEl.innerHTML = "";
    flowItems.forEach(function (item, index) {
      var p = document.createElement("p");
      p.className = flowClass(item, index);
      p.textContent = item.en || "...";
      flowEl.appendChild(p);
    });
    flowEl.scrollTop = flowEl.scrollHeight;
  }

  function addFlow(source) {
    var item = { id: ++flowSeq, source: source, en: "" };
    flowItems.push(item);
    if (flowItems.length > 6) flowItems.shift();
    renderFlow();
    return item;
  }

  function apiHeaders() {
    var headers = { "Content-Type": "application/json" };
    if (copilotKey) headers["x-copilot-key"] = copilotKey;
    return headers;
  }

  // Fast path: just the translation, so the English shows up in about a second.
  function fastTranslate(item, text, attempt) {
    var index = flowItems.indexOf(item);
    var previous = index > 0 ? flowItems[index - 1].source : "";
    fetch("/api/translate", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ text: latest(text, 900), previous: previous, role: roleEl.value, fast: true, useAi: true })
    }).then(function (res) { return res.json(); }).then(function (payload) {
      renderAccessState(payload.access);
      if (payload.keyRequired) {
        statusEl.textContent = "This copy needs your private link (the one ending in ?k=...). Open it once on this device.";
        return;
      }
      if (payload.error === "reserve_protected") {
        statusEl.textContent = "Paused to protect reserved credit. Nothing was spent.";
        item.en = "(paused: credit reserve)";
        renderFlow();
        return;
      }
      if (payload.mode === "ai-fast" && payload.translation) {
        item.en = payload.translation;
        if (flowItems[flowItems.length - 1] === item) translationEl.textContent = payload.translation;
      } else if (!item.en) {
        if (!attempt) { bgTimeout(function () { fastTranslate(item, text, 1); }, 1500); return; }
        item.en = "(translation unavailable)";
      }
      renderFlow();
    }).catch(function () {
      if (!item.en && !attempt) { bgTimeout(function () { fastTranslate(item, text, 1); }, 1500); return; }
      if (!item.en) item.en = "(translation unavailable)";
      renderFlow();
    });
  }

  // Full path: translation plus what to say, from the interview memory.
  function fullGapMs() {
    return typeof window.__FULL_GAP_MS === "number" ? window.__FULL_GAP_MS : 5000;
  }

  function flushPending() {
    if (!autoPending || autoBusy) return;
    var wait = fullGapMs() - (Date.now() - lastFullAt);
    if (wait > 0) {
      bgTimeout(flushPending, wait + 30);
      return;
    }
    autoPending = false;
    var queued = pendingText;
    pendingText = "";
    if (queued) fullAnswer(queued);
  }

  function fullAnswer(text) {
    var seq = ++reqSeq;
    autoBusy = true;
    lastFullAt = Date.now();
    fetch("/api/translate", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        text: latest(text, 1200),
        mode: modeEl.value,
        role: roleEl.value,
        conversation: conversationContext(),
        useAi: true
      })
    }).then(function (res) { return res.json(); }).then(function (payload) {
      if (seq !== reqSeq) return;
      renderAccessState(payload.access);
      if (payload.keyRequired) {
        statusEl.textContent = "This copy needs your private link (the one ending in ?k=...). Open it once on this device.";
        return;
      }
      if (payload.reserveProtected) {
        statusEl.textContent = "Paused to protect reserved credit. Nothing was spent.";
        return;
      }
      if (payload.mode === "ai-gateway") {
        lastPayload = payload;
        updateAnswerBlock(text, payload);
        statusEl.textContent = wantListening ? "Answer ready. Listening for the next question." : "AI answer ready.";
      } else if (lastPayload && wantListening) {
        statusEl.textContent = "The last answer could not be refreshed; the previous one stays on screen.";
      } else {
        lastPayload = null;
        updateAnswerBlock(text, payload);
        statusEl.textContent = "Rough fallback only.";
      }
    }).catch(function () {
      if (seq === reqSeq) statusEl.textContent = lastPayload ? "Connection hiccup; the previous answer stays on screen." : "Local fallback active.";
    }).then(function () {
      if (seq !== reqSeq) return;
      autoBusy = false;
      flushPending();
    });
  }

  function translateNow(opts) {
    opts = opts || {};
    if (!renderAccessState()) {
      statusEl.textContent = accessNotice.textContent || "Copilot access window closed.";
      return;
    }
    var full = transcriptEl.value.trim();
    var text = opts.text || full;
    rememberSnippet(text, opts.auto ? "auto" : "manual");
    autoOffset = transcriptEl.value.length;
    lastReqAt = Date.now();
    if (!opts.auto) updateAnswerBlock(text, null);
    if (!text) return;
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      statusEl.textContent = "Local static fallback active.";
      return;
    }
    statusEl.textContent = opts.auto ? "Translating what they just said..." : "Translating...";
    fastTranslate(addFlow(text), text);
    if (autoBusy || (opts.auto && Date.now() - lastFullAt < fullGapMs())) {
      // One full answer at a time, at most one per few seconds (the gateway rate-limits bursts).
      // The English feed above is unaffected; the newest speech is answered as soon as allowed.
      autoPending = true;
      pendingText = (pendingText ? pendingText + " " : "") + text;
      if (!autoBusy) flushPending();
      return;
    }
    fullAnswer(text);
  }

  // Answer on their own: after a short pause, or every ~10 words / 3.5 seconds of continuous speech.
  function scheduleAuto() {
    clearBgTimeout(autoTimer);
    if (!autoAnswerEl || !autoAnswerEl.checked || !wantListening) return;
    autoTimer = bgTimeout(runAuto, 1000);
    var value = transcriptEl.value;
    var count = words(value.slice(autoOffset < value.length ? autoOffset : 0)).length;
    if (count >= 10 || (count >= 5 && Date.now() - lastReqAt > 3500)) {
      clearBgTimeout(autoTimer);
      runAuto();
    }
  }

  function runAuto() {
    if (!wantListening || !autoAnswerEl || !autoAnswerEl.checked) return;
    var value = transcriptEl.value;
    if (value.length < autoOffset) autoOffset = 0;
    var fresh = value.slice(autoOffset).trim();
    if (words(fresh).length < 4) return;
    translateNow({ auto: true, text: fresh });
  }

  function listeningStatus() {
    return autoAnswerEl && autoAnswerEl.checked ? "Listening. I will answer when they pause." : "Listening. Press Translate now for an answer.";
  }

  function scheduleTranslate() {
    clearBgTimeout(translateTimer);
    translateTimer = bgTimeout(function () {
      var text = transcriptEl.value.trim();
      rememberSnippet(text, "live");
      var holdAi = wantListening && lastPayload && autoAnswerEl && autoAnswerEl.checked;
      if (!holdAi) updateAnswerBlock(text, null);
      // Don't bury listening / error / pause messages under a generic hint.
      var sticky = /^(Microphone|Speech error|Reconnecting|Paused|Copilot expired|Translating|This copy needs)/.test(statusEl.textContent);
      if (!sticky) statusEl.textContent = wantListening ? listeningStatus() : "Live rough meaning. Press Translate now for AI.";
    }, 300);
  }

  function listeningMessage() {
    var scenario = activeScenario();
    var source = scenario && scenario.language ? scenario.language.source : "en";
    return "Listening for " + source.toUpperCase() + ". " + (autoAnswerEl && autoAnswerEl.checked ? "I will answer when they pause." : "Press Translate now for an answer.");
  }

  function scheduleRestart() {
    clearBgTimeout(restartTimer);
    failStreak += 1;
    if (failStreak > 6) {
      wantListening = false;
      statusEl.textContent = "Listening stopped after repeated speech errors. Press Start listening.";
      return;
    }
    statusEl.textContent = "Reconnecting to the microphone...";
    restartTimer = bgTimeout(function () {
      if (!wantListening || recognition) return;
      if (!renderAccessState()) {
        wantListening = false;
        statusEl.textContent = accessNotice.textContent || "Copilot access window closed.";
        return;
      }
      openRecognizer();
    }, Math.min(300 * failStreak, 2000));
  }

  // Opens a fresh recognizer. Handlers are tied to their own instance so a late onend from an
  // older one (after Pause/Resume, Clear, or a language switch) can never clobber the live one.
  function openRecognizer() {
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      wantListening = false;
      statusEl.textContent = "Speech recognition is not supported in this browser. Paste French text instead.";
      return;
    }
    stopListening();
    var rec = new SpeechRecognition();
    var base = transcriptEl.value.trim().slice(-6000);
    var pendingChars = Math.max(0, transcriptEl.value.length - autoOffset);
    if (transcriptEl.value !== base) transcriptEl.value = base;
    autoOffset = Math.max(0, base.length - pendingChars);
    rec.startedAt = Date.now();
    recognition = rec;
    var scenarioForSpeech = activeScenario();
    rec.lang = speechLocaleFor(scenarioForSpeech && scenarioForSpeech.language ? scenarioForSpeech.language.source : "en");
    rec.continuous = true;
    rec.interimResults = true;
    statusEl.textContent = listeningMessage();
    rec.onresult = function (event) {
      if (rec.dead) return;
      failStreak = 0;
      var chunks = [];
      for (var i = 0; i < event.results.length; i += 1) chunks.push(event.results[i][0].transcript.trim());
      var heard = chunks.filter(Boolean).join(" ");
      transcriptEl.value = base && heard ? base + " " + heard : base || heard;
      scheduleTranslate();
      scheduleAuto();
    };
    rec.onerror = function (event) {
      if (recognition !== rec) return;
      var code = event && event.error ? event.error : "unknown";
      if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") {
        rec.fatal = true;
        wantListening = false;
        statusEl.textContent = "Microphone blocked (" + code + "). Allow mic access for this site, then press Start listening.";
        return;
      }
      if (code === "network" && window.desktopOverlay) {
        // Electron ships no speech-recognition backend, so this can never recover by retrying.
        rec.fatal = true;
        wantListening = false;
        statusEl.textContent = "The desktop overlay cannot hear audio (Electron has no speech service). Listen in Chrome at the live site instead.";
        return;
      }
      statusEl.textContent = "Speech error: " + code + ". Reconnecting...";
    };
    rec.onend = function () {
      if (recognition !== rec) return;
      recognition = null;
      if (rec.fatal) return;
      if (Date.now() - rec.startedAt > 5000) failStreak = 0;
      if (wantListening) {
        scheduleRestart();
        return;
      }
      statusEl.textContent = pausedForAnswer ? "Paused while you answer. Resume when the interviewer speaks." : "Stopped.";
    };
    try { rec.start(); } catch (e) {
      recognition = null;
      wantListening = false;
      statusEl.textContent = "Microphone did not start. Try again.";
    }
  }

  function startListening() {
    if (!renderAccessState()) {
      statusEl.textContent = accessNotice.textContent || "Copilot access window closed.";
      return;
    }
    setAnswerPause(false);
    wantListening = true;
    failStreak = 0;
    autoOffset = transcriptEl.value.length;
    lastReqAt = Date.now();
    openRecognizer();
  }

  function stopListening() {
    clearBgTimeout(restartTimer);
    if (recognition) {
      var rec = recognition;
      recognition = null;
      try { rec.stop(); } catch (e) {}
    }
  }

  function pauseMyVoice() {
    if (!renderAccessState()) {
      statusEl.textContent = accessNotice.textContent || "Copilot access window closed.";
      return;
    }
    wantListening = false;
    setAnswerPause(true);
    stopListening();
    statusEl.textContent = "Paused while you answer. Resume when the interviewer speaks.";
  }

  function stopByUser() {
    wantListening = false;
    setAnswerPause(false);
    stopListening();
    statusEl.textContent = "Stopped.";
  }

  function scoreAnswer() {
    var answer = answerEl.value.trim();
    if (!answer) {
      scoreText.textContent = "Write an answer first.";
      return;
    }
    var scenario = activeScenario();
    var verbs = preferredVerbs();
    var style = (profileData && profileData.style) || {};
    var fillerWords = Array.isArray(style.fillerWords) && style.fillerWords.length ? style.fillerWords : ["um", "uh", "like", "you know", "basically", "sort of", "kind of"];
    var signals = (scenario && scenario.domainVocabulary) || [];
    var count = words(answer).length;
    var signalHits = hits(answer, signals);
    var verbHits = hits(answer, verbs);
    var structureHits = hits(answer, ["i", "example", "result", "so", "because", "kpi", "measurable"].concat(verbs));
    var fillers = hits(answer, fillerWords);
    var lengthScore = count >= 45 ? 25 : count >= 25 ? 18 : 9;
    var signalScore = Math.min(35, signalHits.length * 6);
    var structureScore = Math.min(25, structureHits.length * 4);
    var clarityScore = Math.max(0, 15 - (fillers.length * 4) - (count > 170 ? 5 : 0));
    var total = Math.min(100, lengthScore + signalScore + structureScore + clarityScore);
    scoreText.textContent = "Score: " + total + "/100. Words: " + count + ".";
    feedbackEl.innerHTML = "";
    [
      "Scenario signals detected: " + (signalHits.join(", ") || "none yet") + ".",
      "Structure signals detected: " + (structureHits.join(", ") || "add example, result, and a link back to your goal") + ".",
      fillers.length ? "Reduce fillers: " + fillers.join(", ") + "." : "Filler control looks clean.",
      "Preferred verbs detected: " + (verbHits.join(", ") || "none yet") + ". Try: " + verbs.slice(0, 6).join(", ") + ".",
      "Easy sentence starter: " + ((style.safeSentenceStarters && style.safeSentenceStarters[1]) || (style.safeSentenceStarters && style.safeSentenceStarters[0]) || "I'd start by..."),
      "Best next version: direct answer, one proof point, one sentence linking back to your goal."
    ].forEach(function (item) {
      var li = document.createElement("li");
      li.textContent = item;
      feedbackEl.appendChild(li);
    });
  }

  startBtn.addEventListener("click", startListening);
  pauseMineBtn.addEventListener("click", function () {
    if (pausedForAnswer) startListening();
    else pauseMyVoice();
  });
  stopBtn.addEventListener("click", stopByUser);
  clearBtn.addEventListener("click", function () {
    if (recognition) recognition.dead = true;
    reqSeq += 1;
    autoBusy = false;
    autoPending = false;
    autoOffset = 0;
    lastPayload = null;
    pendingText = "";
    lastReqAt = 0;
    lastFullAt = 0;
    flowItems = [];
    renderFlow();
    clearBgTimeout(autoTimer);
    transcriptEl.value = "";
    conversationHistory = [];
    lastHistoryText = "";
    setTopic("listening");
    focusSummaryEl.textContent = "Listen for the question, then anchor your answer in one proof point.";
    renderFocusBullets(["Expliquez le besoin.", "Donnez une preuve concrète.", "Faites le lien avec le rôle."]);
    translationEl.textContent = "Translation will appear here.";
    intentEl.textContent = "The response plan will appear here.";
    updateAnswerBlock("", null);
    if (wantListening) openRecognizer();
    else statusEl.textContent = pausedForAnswer ? "Paused while you answer. Resume when the interviewer speaks." : "Ready.";
  });
  translateBtn.addEventListener("click", translateNow);
  transcriptEl.addEventListener("input", scheduleTranslate);
  function refreshLocal() {
    lastPayload = null;
    renderContextPanel();
    updateAnswerBlock(transcriptEl.value.trim(), null);
    if (!wantListening) statusEl.textContent = "Rough meaning updated. Press Translate now for AI.";
  }
  modeEl.addEventListener("change", refreshLocal);
  roleEl.addEventListener("change", function () { renderScenarioLabels(); refreshLocal(); });
  compactBtn.addEventListener("click", function () {
    document.body.classList.toggle("compact");
    compactBtn.textContent = document.body.classList.contains("compact") ? "Full" : "Compact";
  });
  overlayBtn.addEventListener("click", function () {
    document.body.classList.toggle("overlay-mode");
    document.body.classList.add("compact");
    compactBtn.textContent = "Full";
    overlayBtn.textContent = document.body.classList.contains("overlay-mode") ? "Exit overlay" : "Corner overlay";
  });
  scoreBtn.addEventListener("click", scoreAnswer);
  copyBtn.addEventListener("click", function () {
    var text = phraseEl.textContent;
    function blocked() { statusEl.textContent = "Copy blocked. Phrase: " + text; }
    try {
      var copied = navigator.clipboard.writeText(text);
      if (copied && typeof copied.then === "function") {
        copied.then(function () { statusEl.textContent = "Phrase copied."; }, blocked);
      } else {
        statusEl.textContent = "Phrase copied.";
      }
    } catch (e) { blocked(); }
  });

  function restorePrefs() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      var k = params.get("k");
      if (k) {
        localStorage.setItem("copilotKey", k);
        params.delete("k");
        var qs = params.toString();
        history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : "") + window.location.hash);
      }
      copilotKey = localStorage.getItem("copilotKey") || "";
      var pref = localStorage.getItem("autoAnswer");
      if (pref === "off") autoAnswerEl.checked = false;
    } catch (e) {}
  }

  autoAnswerEl.addEventListener("change", function () {
    try { localStorage.setItem("autoAnswer", autoAnswerEl.checked ? "on" : "off"); } catch (e) {}
    if (wantListening) statusEl.textContent = listeningStatus();
    if (autoAnswerEl.checked) scheduleAuto();
  });

  // Mini window: a second, display-only copy of the interface that follows this tab.
  var mirrorWindow = null;
  var publishTimer = null;

  function statePayload() {
    var text = {};
    MIRROR_TEXT_IDS.forEach(function (id) { text[id] = document.getElementById(id).textContent; });
    return {
      type: "state",
      text: text,
      hidden: { phraseGloss: phraseGlossEl.hidden, phraseWatch: phraseWatchEl.hidden },
      points: [].map.call(document.querySelectorAll("#sayPoints li"), function (li) { return li.textContent; }),
      flow: flowSnapshot(),
      paused: pausedForAnswer,
      expired: document.body.classList.contains("expired"),
      auto: autoAnswerEl.checked
    };
  }

  function publish() {
    if (!channel) return;
    clearBgTimeout(publishTimer);
    publishTimer = bgTimeout(function () { try { channel.postMessage(statePayload()); } catch (e) {} }, 80);
  }

  function openMirror() {
    if (mirrorWindow && !mirrorWindow.closed) {
      mirrorWindow.focus();
      return;
    }
    var w = 440;
    var h = 640;
    var left = Math.max(0, (screen.availLeft || 0) + screen.availWidth - w - 24);
    var top = (screen.availTop || 0) + 72;
    mirrorWindow = window.open(window.location.pathname + "?mirror=1", "interviewCopilotMirror", "popup=yes,width=" + w + ",height=" + h + ",left=" + left + ",top=" + top);
    if (!mirrorWindow) {
      statusEl.textContent = "The browser blocked the mini window. Allow pop-ups for this site, then try again.";
      return;
    }
    publish();
  }

  if (channel) {
    new MutationObserver(publish).observe(mainEl, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden", "class"] });
    setInterval(publish, 5000);
    channel.onmessage = function (e) {
      var m = e.data || {};
      if (m.type === "hello") { publish(); return; }
      if (m.type !== "cmd") return;
      if (m.cmd === "auto") {
        autoAnswerEl.checked = !!m.checked;
        autoAnswerEl.dispatchEvent(new Event("change"));
      } else {
        var button = { start: startBtn, pauseMine: pauseMineBtn, stop: stopBtn, clear: clearBtn, translate: translateBtn }[m.cmd];
        if (button && !button.disabled) button.click();
      }
    };
  }

  popoutBtn.hidden = false;
  popoutBtn.addEventListener("click", openMirror);
  restorePrefs();

  function populateScenarioOptions() {
    roleEl.innerHTML = "";
    var scenarios = (profileData && profileData.scenarios) || {};
    var keys = Object.keys(scenarios);
    if (!keys.length) {
      var opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No scenarios configured — edit data/profile.json";
      roleEl.appendChild(opt);
      return;
    }
    keys.forEach(function (key) {
      var opt = document.createElement("option");
      opt.value = key;
      opt.textContent = scenarios[key].label || key;
      roleEl.appendChild(opt);
    });
  }

  fetch("/data/profile.json", { cache: "no-store" }).then(function (res) {
    if (!res.ok) throw new Error("profile");
    return res.json();
  }).then(function (profile) {
    profileData = profile;
    populateScenarioOptions();
    renderAccessState(null);
    applyLaunchParams();
    renderContextPanel();
    renderScenarioLabels();
  }).catch(function () {
    if (profileStatus) profileStatus.textContent = "Profile fallback";
    populateScenarioOptions();
    renderAccessState(null);
    applyLaunchParams();
    renderContextPanel();
    renderScenarioLabels();
  });
})();
