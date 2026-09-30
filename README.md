# Conversation Copilot

A live-conversation copilot you configure for your own business need: an interview, a sales call, a
negotiation, a client check-in. It listens through your microphone, transcribes in real time, translates
if your scenario spans two languages, and gives you tactical "what to say next" coaching grounded in your
own background and goal — never in anything the model invents.

## Quickstart

```bash
git clone https://github.com/ankitmishra01/conversation-copilot.git
cd conversation-copilot
npm install
cp data/profile.example.json data/profile.json   # then edit it — see "Configuring your profile" below
cp .env.example .env.local                         # then fill in AI_GATEWAY_API_KEY at minimum
python3 -m http.server 4174                        # local static preview at http://localhost:4174
```

Deploy for real use (the browser needs HTTPS for microphone access, and `/api/*` needs a serverless
runtime):

```bash
npm install -g vercel
vercel --prod
```

## Configuring your profile

Everything personal lives in `data/profile.json` (git-ignored — never committed). Start from
`data/profile.example.json`, which has three worked examples: a same-language interview, a same-language
sales-call notes scenario, and a Spanish-to-English translation scenario.

```jsonc
{
  "you": {
    "name": "Your Name",
    "role": "candidate",              // the noun the AI prompts use for you: "candidate", "account executive", ...
    "positioning": "One paragraph pitch.",
    "background": [
      { "label": "Company or context", "proofPoints": ["..."], "usefulFor": ["all"] }
    ]
  },
  "scenarios": {
    "your-scenario-key": {
      "label": "Shown in the UI dropdown",
      "goal": "What you're trying to achieve",
      "language": { "source": "en", "target": "en" },   // equal = notes-only mode, no translation
      "domainVocabulary": ["term1", "term2"],             // helps speech recognition and the AI understand your domain
      "fitSummary": "How to position yourself.",
      "proofBank": ["Short quotable proof points."],
      "honestGap": "A gap to acknowledge, plus the bridge.",
      "questionsToAsk": ["A question you can ask back."],
      "settledAnswers": ["Facts to state literally, never improvised."],
      "neverSay": ["Things the AI must never say for you."],
      "watchOuts": [
        {
          "topic": "Compensation",
          "triggers": ["salary", "compensation"],
          "fixedLine": { "primary": "Your exact words, never generated." },
          "tip": "Why this line, so you remember the strategy."
        }
      ]
    }
  },
  "style": {
    "preferredVerbs": ["clarify", "prioritize", "align"],
    "safeSentenceStarters": ["I'd start by...", "..."],
    "fillerWords": ["um", "like", "you know"],
    "avoid": ["Do not claim a result you don't actually have."]
  }
}
```

Pick as many `scenarios` as you want. Anything with `language.source === language.target` runs in
**notes mode** (live transcript + coaching, no translation panel). Anything else translates both ways.

**What the browser can see:** the UI fetches a redacted view of your profile from `/api/profile` — it
never sees `settledAnswers`, `neverSay`, `honestGap`, or `watchOuts`. Those stay server-side, read only
by `/api/translate`, so the other party on a call (even over a shared screen) can't open devtools and
read your negotiation stance. `data/profile.json` itself is also never served as a static file.

## Live use

Open the deployed site, pick your scenario from the **Scenario** dropdown, press **Start listening**, and
allow microphone access. Press **Mini window** for a small display-only window you can park beside a video
call (listening stays in the main tab).

For the most accurate transcription, use the terminal listener instead of the browser:

```bash
npm run listen -- --role your-scenario-key --save
```

Once deployed, set `COPILOT_URL` in `.env.local` (or pass `--url`) to your deployed URL — the terminal
listener and `npm run credits` otherwise talk to `http://localhost:3000`, where nothing is listening
unless you're running `vercel dev`.

Duplicate `Copilot Launcher.command.template`, rename it, set its `--role` to a scenario key, and
`chmod +x` it for a one-click launcher per scenario.

## Optional features (all off by default)

- **Access window.** Set `COPILOT_ACTIVE_UNTIL` (an ISO timestamp) to make the copilot stop responding
  after a given time; `COPILOT_RECALL=enabled` reopens it. Leave both unset for a copilot that never
  expires.
- **Credit reserve.** Set `COPILOT_RESERVE_USD` and `COPILOT_RESERVE_UNTIL` to refuse AI calls once your
  AI Gateway balance is at or below that amount, until that time — useful if you're protecting budget for
  a specific upcoming call. Leave unset (or `0`) to disable.
- **Private-repo config sync.** Set `MEMORY_REPO` (and optionally `MEMORY_PATH`, default `profile.json`)
  to pull your real `profile.json` from a private GitHub repo instead of keeping it locally:
  `npm run sync-memory` (uses your local `gh` login; no token is stored). `npm run deploy` runs this then
  `vercel --prod`.
- **Access key.** Set `COPILOT_KEY` to require a shared secret; open the deployed site once with
  `?k=<value>` per device.

## Cost

AI calls go through Vercel's AI Gateway. `npm run credits` shows your current balance and which models
and credential this deployment is using. Cost depends on which models you configure — check your AI
Gateway usage dashboard for your own numbers.

## Limitations

A browser page cannot silently capture all system audio — this listens through the microphone, so play
the other party's audio through your speakers (or use a loopback device like BlackHole with the terminal
listener). A microphone also cannot reliably separate your own voice from the other person's, which is
why there's a **Pause my voice** / **Resume incoming** control. This is built as a practice and
accessibility aid — it does not join calls, control meeting software, or bypass another party's
visibility or consent.
