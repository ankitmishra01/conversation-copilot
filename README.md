# Conversation Copilot

**A source-grounded copilot for live conversations and post-call follow-through.**

[Try the verified Close the Loop demo](https://conversation-copilot-three.vercel.app/?view=loop&demo=commitment-loop) · [Open Eval Control Tower](https://conversation-copilot-three.vercel.app/?view=evals) · [Open Live copilot](https://conversation-copilot-three.vercel.app/?view=live) · [Open Answer coach](https://conversation-copilot-three.vercel.app/?view=coach)

Conversation Copilot listens through your microphone, transcribes speech, and provides tactical coaching grounded in a configurable profile. After a call, **Close the Loop** converts the transcript into traceable commitments, an editable follow-up email, and a CRM update. Human approvals, edits, and rejections become evaluation data that can improve the next run.

This repository is an independent product concept by Ankit Mishra. The Ghost-branded interface demonstrates product and brand fluency; it is not an official Ghost product.

## What it demonstrates

| Mode | Purpose |
| --- | --- |
| **Live copilot** | Transcribes a conversation, translates when needed, and suggests what to say next. |
| **Answer coach** | Turns the current conversation into a concise answer, proof points, questions, and watch-outs. |
| **Close the Loop** | Extracts source-backed actions and risks, prepares follow-up artifacts, records human decisions, and traces those decisions into a later run. |
| **Eval Control Tower** | Persists explicitly saved runs and shows approval, editing, decision-time, evidence-quality, rejection-reason, and learned-rule analytics. |

Each mode has a shareable URL: `?view=live`, `?view=coach`, `?view=loop`, or `?view=evals`.

## Why this product

The prototype responds to Ghost's AI Builder brief with a narrow end-to-end workflow: turn a customer conversation into work that is grounded, reviewed, completed, measured, and improved. It demonstrates the full loop described in the brief:

```text
Context → Agent action → Human evaluation → Learned guidance → Attribution
```

The central product bet is that the human decision is not merely a UI event. An approval, edit, rejection, or ignored draft becomes structured evaluation data tied to the account, source evidence, artifact, agent run, and eventual outcome. That gives Ghost a path from useful daily workflow to a proprietary quality and trust layer.

The current build deliberately keeps CRM and email actions inside a labelled sandbox. Production integration would use Ghost's governed write layer while preserving the CRM as the revenue system of record.

## Try the verified demo

Open the [Close the Loop demo](https://conversation-copilot-three.vercel.app/?view=loop&demo=commitment-loop), then select **Present the full loop**.

The deterministic eight-step replay follows one customer claim through:

1. transcript evidence and exact source attribution;
2. a human edit to the proposed customer email;
3. approval and a browser-local evaluation event;
4. a scoped rule derived from the correction;
5. a second run shown with and without that rule; and
6. a clearly labelled fictional downstream outcome.

The demo uses the bundled fixture in [`data/commitment-loop-demo.json`](data/commitment-loop-demo.json). It does not require an API key or depend on model availability. **Run live analysis** is a separate path.

## How it works

```text
Microphone or transcript
          |
          v
  Speech-to-text API ------> Scenario profile and private memory
          |                              |
          +--------------+---------------+
                         v
             Translation and coaching
                         |
                         v
              Source-backed extraction
                         |
             +-----------+-----------+
             v                       v
      Follow-up email             CRM update
             +-----------+-----------+
                         v
             Human approve/edit/reject
                         |
                         v
        Local evaluation ledger and learned rule
```

The durable path adds a server-side data layer:

```text
Browser workflow
  ├─ transcript + exact source quotes
  ├─ editable follow-up and CRM artifacts
  └─ approve / edit / reject decisions
                 |
                 v
Vercel Functions: validation, idempotency, access boundary
                 |
                 v
Supabase Postgres
  ├─ conversations → agent_runs → artifacts
  ├─ evidence_items
  ├─ evaluation_events
  └─ learned_rules ↔ rule_applications
                 |
                 v
Eval Control Tower: quality, trust, friction, and traceability
```

The browser is a plain HTML, CSS, and JavaScript client. Vercel Functions provide the profile, transcription, coaching, close-loop, persistence, and analytics APIs. Model calls go through Vercel AI Gateway. The local evaluation ledger remains the offline-safe working copy; an explicit **Save to Control Tower** action persists the consented transcript, artifacts, source evidence, and decisions to Supabase.

## Local setup

### Prerequisites

- Node.js 22 or later
- npm
- A Vercel account for live API routes and deployment
- An AI Gateway credential for local model calls, or Vercel OIDC in a deployment

Clone and install:

```bash
git clone https://github.com/ankitmishra01/conversation-copilot.git
cd conversation-copilot
npm install
cp data/profile.example.json data/profile.json
cp .env.example .env.local
```

For the verified static demo, run:

```bash
python3 -m http.server 4174
```

Then open:

```text
http://localhost:4174/?view=loop&demo=commitment-loop
```

For live API routes, add `AI_GATEWAY_API_KEY` to `.env.local` and run:

```bash
npx vercel dev
```

Open `http://localhost:3000`. Microphone access requires `localhost` or HTTPS.

## Configure the copilot

Personal configuration belongs in `data/profile.json`, which is git-ignored. Start from [`data/profile.example.json`](data/profile.example.json).

```jsonc
{
  "you": {
    "name": "Your Name",
    "role": "account executive",
    "positioning": "The context the copilot should use when coaching you.",
    "background": [
      {
        "label": "Company or role",
        "proofPoints": ["A claim the copilot may safely use."],
        "usefulFor": ["all"]
      }
    ]
  },
  "scenarios": {
    "renewal-call": {
      "label": "Renewal call",
      "goal": "Leave with owners, dates, and the renewal blocker confirmed.",
      "language": { "source": "en", "target": "en" },
      "domainVocabulary": ["renewal", "data retention", "SSO"],
      "fitSummary": "How to position your value.",
      "proofBank": ["Short, quotable proof points."],
      "honestGap": "A gap to acknowledge and how to bridge it.",
      "questionsToAsk": ["What still blocks security approval?"],
      "settledAnswers": ["Facts to state literally."],
      "neverSay": ["Claims the copilot must not make."],
      "watchOuts": []
    }
  }
}
```

When `language.source` and `language.target` match, the app runs in notes mode. Different languages enable translation.

The browser receives only a redacted profile from `/api/profile`. Sensitive coaching fields such as `settledAnswers`, `neverSay`, `honestGap`, and `watchOuts` remain server-side.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `AI_GATEWAY_API_KEY` | Local AI use | Authenticates AI Gateway requests. Vercel OIDC can supply deployment authentication instead. |
| `COPILOT_KEY` | No | Protects API access with a shared secret. Visit once with `?k=<value>` to store it locally. |
| `COPILOT_URL` | CLI only | Base URL used by the listener and credit scripts. Defaults to `http://localhost:3000`. |
| `COPILOT_ACTIVE_UNTIL` | No | ISO timestamp after which AI routes stop responding. |
| `COPILOT_RECALL` | No | Set to `enabled` to reopen an expired access window. |
| `COPILOT_RESERVE_USD` | No | Preserves a minimum AI Gateway credit balance. |
| `COPILOT_RESERVE_UNTIL` | No | ISO timestamp that bounds the credit reserve. |
| `MEMORY_REPO` | No | Private GitHub repository containing a profile file. |
| `MEMORY_PATH` | No | Profile path inside `MEMORY_REPO`; defaults to `profile.json`. |
| `AI_GATEWAY_MODEL` | No | Overrides the main translation and coaching model. |
| `AI_GATEWAY_FAST_MODEL` | No | Overrides the low-latency translation model. |
| `AI_GATEWAY_FALLBACK_MODEL` | No | Overrides the configured fallback model. |
| `AI_GATEWAY_STT_MODEL` | No | Overrides the speech-to-text model chain. |
| `AI_GATEWAY_LOOP_MODEL` | No | Overrides the Close the Loop analysis model. |
| `SUPABASE_URL` | Control Tower | Hosted Supabase project URL used only by Vercel Functions. |
| `SUPABASE_SECRET_KEY` | Control Tower | Server-only Supabase secret; never expose it to browser code. |

See [`.env.example`](.env.example) for a copy-ready configuration.

## Terminal listener

For more reliable capture than browser speech recognition, use the terminal listener:

```bash
npm run listen -- --role renewal-call --save
```

Set `COPILOT_URL` to a deployed URL or run `vercel dev` locally. The listener records through the same `/api/transcribe` and `/api/translate` routes as the web client. `--save` writes a local Markdown transcript under `transcripts/`.

## Trust and privacy boundaries

- Extracted commitments, blockers, and expansion signals keep an exact source quote. Quotes missing from the transcript are marked unsupported.
- A transcript is sent to a model only when the user invokes an AI action such as **Run live analysis**.
- Evaluation events remain in browser storage unless the user explicitly saves the run to the Control Tower.
- Saved runs can be deleted with their transcript, artifacts, evidence, and decisions in one cascaded operation.
- Email and CRM completion occur only in a labelled demo sandbox. The interface does not claim to contact a customer or write to a real CRM.
- Profile fields that contain private strategy stay on the server and are omitted from the public browser payload.
- The app listens through the microphone. It does not join calls, control meeting software, or bypass participant consent.

## Commands

```bash
npm test          # run the complete Node test suite
npm run check     # syntax-check client, API, CLI, and desktop files
npm run listen    # start the terminal listener
npm run credits   # inspect AI Gateway balance and model configuration
npm run desktop   # open the Electron overlay
npm run deploy    # sync private profile data, then deploy to production
```

## API routes

| Route | Method | Role |
| --- | --- | --- |
| `/api/profile` | `GET` | Returns the public-safe profile and scenario list. |
| `/api/transcribe` | `POST` | Transcribes base64 audio and filters common silence hallucinations. |
| `/api/translate` | `POST` | Handles translation, answer generation, coaching, profile snapshots, and credit checks. |
| `/api/close-loop` | `POST` | Converts a transcript into verified evidence, a follow-up draft, and a CRM update. |
| `/api/runs` | `POST`, `DELETE` | Explicitly persists or deletes a transcript-backed agent run. |
| `/api/evaluations` | `POST` | Idempotently persists a server-validated human decision. |
| `/api/eval-dashboard` | `GET` | Returns filtered evaluation metrics and traceable recent runs. |

All routes honor the optional access key. AI routes also honor the access window and credit reserve.

## Repository map

```text
api/                         Vercel Functions and shared server-side profile/access logic
data/                        Example profile and deterministic Close the Loop fixture
supabase/                    Reproducible schema migrations and labelled demo seed data
desktop/                     Electron overlay wrapper
scripts/                     Terminal listener, profile sync, and credit utilities
test/                        Unit and integration-style Node tests
app.js                       Live copilot and answer coach client
close-loop.js                Post-call workflow and presentation replay
eval-ledger.js               Local decision events and evaluation metrics
eval-dashboard.js            Durable Control Tower client and source-trace rendering
view-controller.js           Shareable product-mode routing
index.html / styles.css       Product shell and Ghost-inspired visual system
DESIGN.md                    Design direction, interaction rules, and accessibility constraints
```

## Test and deploy

Run the quality gates before deploying:

```bash
npm run check
npm test
```

Deploy to Vercel:

```bash
vercel --prod
```

The production deployment needs HTTPS for microphone access and a serverless runtime for `/api/*`.

## Interview deck

[`docs/GENSPARK_DECK_PROMPT.md`](docs/GENSPARK_DECK_PROMPT.md) contains a detailed, source-grounded prompt for generating the CEO presentation in Genspark. It specifies the narrative, slide-by-slide content, architecture diagrams, visual system, speaker notes, and accuracy guardrails.

## Limitations

Browsers cannot silently capture all system audio. Play the other participant through speakers or use a loopback device such as BlackHole with the terminal listener. A shared microphone cannot reliably distinguish your voice from the other participant, so the interface includes **Pause my voice** and **Resume incoming** controls.

The bundled Close the Loop replay is a fictional, deterministic product demonstration. It shows the mechanics of evidence, evaluation, learned guidance, and attribution without claiming that the agent caused a real commercial outcome.
