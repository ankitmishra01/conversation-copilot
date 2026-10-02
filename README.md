# Conversation Copilot

A live-conversation copilot you configure for your own business need: an interview, a sales call, a
negotiation, a client check-in. It listens through your microphone, transcribes in real time, translates
if your scenario spans two languages, and gives you tactical "what to say next" coaching grounded in your
own background and goal — never in anything the model invents.

It also includes **Close the Loop**, a post-call workspace that turns a transcript into source-backed
commitments, an editable follow-up email, and a CRM update. Approvals, edits, and rejections become a
local evaluation ledger so you can see whether the agent is improving rather than merely generating.

## Quickstart

```bash
git clone https://github.com/ankitmishra01/conversation-copilot.git
cd conversation-copilot
npm install
cp data/profile.example.json data/profile.json   # then edit it — see "Configuring your profile" below
cp .env.example .env.local                         # then fill in AI_GATEWAY_API_KEY at minimum
python3 -m http.server 4174                        # local static preview at http://localhost:4174
```

Open `http://localhost:4174/?demo=commitment-loop#closeLoop` to load the bundled fictional renewal-call
demo without an API key. The static server can show the verified snapshot and the complete approval/eval
flow; use a Vercel deployment or `vercel dev` for live model analysis through `/api/close-loop`.

Deploy for real use (the browser needs HTTPS for microphone access, and `/api/*` needs a serverless
runtime):

```bash
npm install -g vercel
vercel --prod
```

## Close the Loop

The post-call workflow is deliberately narrow:

1. Paste a transcript, copy the live transcript, or load the verified demo.
2. Run live analysis to extract commitments, blockers, and expansion signals. Every claim includes a
   verbatim source quote and is checked against the submitted transcript before it is marked verified.
3. Review and edit the follow-up email and CRM update.
4. Approve an artifact to complete it in the clearly labeled demo outbox/account record, or reject it
   with a reason.
5. Inspect or export the browser-local evaluation ledger: approval rate, editing required, decision
   time, and completed actions.

The bundled transcript and snapshot live in `data/commitment-loop-demo.json`. They are fictional and
safe to present. The live endpoint uses Vercel AI Gateway and defaults to `openai/gpt-6.1-sol-fast`;
set `AI_GATEWAY_LOOP_MODEL` to override it. The endpoint also honors the existing `COPILOT_KEY`, access
window, and credit-reserve controls.

### Trust and privacy boundaries

- Unsupported source quotes remain visible as unsupported warnings; they are never silently promoted
  to facts.
- Live transcripts are sent to the configured model only when **Run live analysis** is pressed.
- Evaluation events are stored in local browser storage. They leave the browser only when the user
  explicitly exports the JSON file.
- Email and CRM completion happens in a demo sandbox. The interface never claims to have contacted a
  customer or written to a real CRM.

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
