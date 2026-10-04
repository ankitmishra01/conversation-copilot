# Genspark prompt: Ghost Close the Loop

Copy everything below the divider into Genspark. Upload `AI Builder Brief (2).pdf` when prompted and give Genspark access to the two URLs listed in the source pack.

---

Create a polished, executive-level 16:9 presentation for a live Monday conversation with the CEO of Ghost. This is not a generic sales pitch and not a summary of the supplied strategy brief. It is an AI Builder candidate's product response to the brief: a clear point of view, a working prototype, the technical architecture behind it, what it solves for Ghost and its customers, and the fastest path from prototype to a production experiment.

The candidate is Ankit Mishra. The product is called **Close the Loop**, built inside an independent **Conversation Copilot** prototype. The strongest line in the story is:

> The decisions are the dataset.

The deck should leave the CEO with three conclusions:

1. Ankit understood Ghost's strategic loop: context, agents, evals, attribution.
2. He converted that context into a real, testable product experience rather than restating it.
3. The product creates immediate user value while building Ghost's long-term proprietary advantage: human decisions tied to source context, agent work, and what happened next.

## Source pack and hierarchy

Treat these as the only authoritative sources. Do not invent Ghost metrics, customer names, revenue outcomes, product capabilities, quotes, or production integrations.

1. **Primary strategic source:** the uploaded `AI Builder Brief (2).pdf`. Use it to understand Ghost's strategy, current product, buyers, product loop, and the CEO's expectations. Paraphrase it. Do not place long quotations from it on slides.
2. **Ghost brand and current positioning:** https://ghostgtm.ai/
3. **Working product:** https://conversation-copilot-three.vercel.app/?view=loop&demo=commitment-loop
4. **Eval Control Tower:** https://conversation-copilot-three.vercel.app/?view=evals
5. **Implementation details and limitations:** https://github.com/ankitmishra01/conversation-copilot

If a source cannot be opened, do not fill the gap with guesses. Add a small production note such as `[Insert verified product screenshot]` and continue. Use citations in speaker notes or in a discreet final sources slide, not as clutter across the main narrative.

## Audience, occasion, and tone

- Audience: Ghost's CEO, who wrote the strategy brief and already knows the company and market.
- Occasion: a working session, not a formal investor pitch.
- Presentation length: 12-15 minutes of core material, leaving most of the call for discussion.
- Tone: sharp, thoughtful, commercially grounded, product-literate, candid about what is built versus proposed.
- Voice: builder speaking to builder. Use direct language, short sentences, and concrete product behavior.
- Avoid consultant language, market-size filler, generic AI claims, exaggerated certainty, and praise of Ghost that does not advance the product argument.
- Never say the prototype is an official Ghost product. Label it once, clearly, as `Independent product concept by Ankit Mishra`.

## Visual direction

First inspect Ghost's live website and infer its current visual grammar. The deck should feel native to Ghost without copying page layouts mechanically.

Use this visual system unless the live site reveals a more current equivalent:

- Backgrounds: warm off-white/paper and very dark navy.
- Primary ink: near-black navy, approximately `#10172A`.
- Paper: warm off-white, approximately `#F6F7F1`.
- Accent: electric violet, approximately `#8059FF`; use sparingly for the active path, selected state, or key decision.
- Supporting surfaces: white, pale violet, restrained grey rules.
- Typography: a clean Swiss/grotesk sans serif in the spirit of PP Neue Montreal. If unavailable, use Neue Haas Grotesk, Helvetica Neue, Inter, or Aptos with careful kerning.
- Headlines: large, bold, compact, sentence case. Aim for 5-10 words.
- Body copy: high contrast, generous line spacing, no paragraph longer than three lines.
- Layout: editorial, grid-led, asymmetrical where useful, strong whitespace, thin rules, precise alignment.
- Shape language: squared or lightly rounded cards, not bubbly consumer-SaaS pills.
- Imagery: prioritize real screenshots, interface crops, source quotes, diagrams, and data objects. Avoid generic robots, brains, neon networks, handshakes, office stock photography, and decorative AI art.
- Logo: use Ghost's public logo only if it can be retrieved from the site. Do not redraw or distort it. Keep the independent-concept label visible near it on the title or footer.
- Animation: none required. If transitions are added, use only subtle fades.

Every slide must be readable on a laptop during a video call. Minimum body size should be approximately 22 pt and labels approximately 16-18 pt. Prefer one idea per slide. Keep to 30-45 words on most slides, excluding diagram labels and speaker notes.

## Narrative structure

Build **12 core slides plus 3 appendix slides**. Number the slides discreetly. Give each core slide one declarative headline that makes the argument even if the CEO only scans the titles.

### Slide 1 - Title

Headline: **Close the Loop**

Subhead: `From customer conversation to completed work, measurable trust, and a system that learns.`

Include:

- `Independent product concept by Ankit Mishra`
- `AI Builder conversation · Monday`
- A restrained product screenshot crop showing the source-evidence-to-action interface, not a generic illustration.

Speaker-note purpose: Open in under 20 seconds. Say that the brief asked what one would build once given the context, so this is the answer in working software.

### Slide 2 - Point of view

Headline: **The draft is not the job.**

Show a horizontal before/after comparison:

- Typical AI workflow: `Call → draft → rep finishes everything else`
- Close the Loop: `Call → evidence → action → approval → send/write → evaluation`

Use one concise supporting statement: `A useful agent completes the workflow and leaves behind evidence of how well it performed.`

Speaker-note purpose: Establish the user problem and the product principle. Do not repeat the whole brief.

### Slide 3 - The operating problem

Headline: **Today, the value and the learning leak out between tools.**

Create a clean systems diagram with four source boxes on the left: `call recorder`, `email`, `calendar`, `CRM`. Show fragmented arrows into separate tools, then mark three losses:

- Context loses provenance.
- The rep performs the last mile manually.
- Approval, edits, and rejection reasons disappear as telemetry.

End with a small contrast line: `Twelve tools create twelve silos; none sees the full decision loop.` Attribute this idea to the supplied Ghost brief in the notes rather than presenting it as external market research.

### Slide 4 - Product thesis

Headline: **The decisions are the dataset.**

This should be the most memorable conceptual slide. Use a central visual showing an agent artifact surrounded by four human outcomes:

- Approve unchanged
- Approve with edits
- Reject with reason
- Ignore or abandon

Underneath, map each outcome to what Ghost can learn: quality, edit distance, failure mode, decision time, and trust threshold. Add a single line: `When the decision stays tied to the account, source, agent run, and next outcome, feedback becomes compounding infrastructure.`

### Slide 5 - The experience

Headline: **One conversation becomes a completed, inspectable workflow.**

Use a five-step product storyboard with real screenshots from the working prototype:

1. Transcript enters the workflow.
2. Ghost extracts commitments, blockers, and expansion signals.
3. Every claim links to an exact quote, speaker, and date.
4. Ghost drafts the follow-up and CRM update.
5. The rep approves, edits, or rejects before completion.

Use no more than one sentence under each frame. Put small `working prototype` labels on the screenshots.

### Slide 6 - Trust is visible, not implied

Headline: **Every action can answer: why do you believe this?**

Use one enlarged evidence card from the prototype. Visually connect:

`source quote → extracted fact → proposed action → human decision`

Annotate the fields: source speaker, source date, source type, exact quote, confidence or verification status. Explain that unsupported claims are marked rather than silently treated as fact.

Speaker-note purpose: Tie the interaction directly to Ghost's context-graph advantage and the CEO's emphasis on source, date, and speaker.

### Slide 7 - The feedback loop

Headline: **A correction should change the next run, with scope.**

Create a circular or stepped flywheel diagram:

`Context → Agent action → Human evaluation → Scoped learned rule → Next run → Observed outcome`

Show one concrete example from the demo:

- Human removes analytics upsell language from a renewal follow-up.
- Rule applies to customer follow-up.
- CRM memory retains the expansion signal.
- Next follow-up separates renewal from expansion.

Make the scope boundary visually explicit. The point is not generic personalization; it is learning without erasing useful account context.

### Slide 8 - Architecture

Headline: **The prototype separates source truth, agent work, decisions, and outcomes.**

Draw a professional layered architecture diagram. Use this exact logical structure:

**Inputs**
`Microphone / transcript` · `CRM` · `call recordings` · `email / calendar`

↓

**Ghost context layer**
`Account graph` · `people` · `facts with source/date/speaker` · `permissions`

↓

**Agent layer**
`Source-backed extraction` · `follow-up composer` · `CRM update composer`

↓

**Governed action layer**
`approve` · `edit` · `reject` · `audit trail` · `write/send connector`

↓

**Evaluation and learning layer**
`evaluation events` · `edit distance` · `decision time` · `rejection reason` · `learned rules`

↓

**Attribution layer**
`agent run → message / CRM asset → opportunity or renewal outcome`

Add a thin implementation strip at the bottom: `Plain web client · Vercel Functions · Vercel AI Gateway · Supabase Postgres`. Mark the CRM/email connectors as `production integration`, not as already implemented. Mark current email and CRM completion as `labelled demo sandbox`.

### Slide 9 - Durable evaluation data model

Headline: **The schema makes every metric traceable back to evidence.**

Create a simplified entity relationship diagram using these entities:

- `conversations`
- `agent_runs`
- `artifacts`
- `evidence_items`
- `evaluation_events`
- `learned_rules`
- `rule_applications`

Show the main relationships:

- conversation has agent runs
- agent run creates artifacts and evidence
- artifact receives evaluation events
- learned rule comes from an evaluation and is applied to later runs

Highlight three technical principles in a side rail:

- Explicit transcript retention and cascaded deletion
- Idempotent saves and retries
- Server-side validation with row-level database security

Do not show raw SQL or tiny code.

### Slide 10 - Eval Control Tower

Headline: **Quality becomes an operating system, not a quarterly audit.**

Use a large screenshot from the live Eval Control Tower. Add no more than five callouts:

- approval rate
- average editing
- decision time
- rejection reasons
- verified evidence rate

Also call out the `with learned rule / without learned guidance` comparison. Include the exact warning: `Association only. The comparison does not claim the learned rule caused the outcome.`

Clearly label all numbers currently shown in the prototype as `simulated interview dataset`. Never present them as Ghost customer results.

### Slide 11 - Why this benefits Ghost

Headline: **The same workflow creates customer value now and defensibility later.**

Use a two-column value stack.

**For users now**

- Less post-call admin
- Evidence-backed follow-up
- Governed CRM hygiene
- Faster, safer action in Slack or the web app

**For Ghost over time**

- More daily workflow engagement
- More labelled evaluation events
- Clear failure-mode taxonomy
- Trust thresholds for selective autonomy
- A path from agent activity to revenue attribution

At the bottom, show the reinforcing loop:

`Better experience → more completed runs → more decisions → better agents → more trust → more autonomy`

Avoid claiming a moat as a certainty. Phrase it as a compounding advantage Ghost can earn.

### Slide 12 - Production experiment

Headline: **Start with one narrow job and measure the right to automate.**

Propose a practical four-week experiment for a small group of existing-customer-focused reps on HubSpot with call recordings. Use four columns or a timeline:

**Week 1 - Instrument**
Connect one call source and HubSpot sandbox. Define the source and action contract.

**Week 2 - Assist**
Generate follow-up plus CRM next step. Require approval for every action.

**Week 3 - Learn**
Cluster edits and rejection reasons. Introduce scoped rules with human review.

**Week 4 - Decide**
Identify which narrow actions, if any, have earned lower-friction approval.

Show primary success measures, without invented targets:

- workflow completion rate
- approval unchanged / with edits / rejected
- median decision time
- edit distance
- evidence verification rate
- CRM write success
- seven-day repeat usage

Add explicit guardrails: no autonomous customer send at launch; reversible CRM writes; audit log; customer-level retention controls.

### Slide 13 - What I would build next

Headline: **The next build should deepen the loop, not broaden the demo.**

Show a prioritized sequence:

1. Real Ghost context-graph input and identity mapping
2. Governed HubSpot write-back and send adapter
3. Ignored-draft and abandonment capture
4. Evaluation cohorts by workflow, account, rep, and rule version
5. Outcome joins for renewal progression and expansion signals

Use a `Now / Next / Later` presentation. Keep this grounded. Do not add unrelated features such as generic prospecting or a full analytics suite.

### Slide 14 - Close / discussion

Headline: **What would have to be true for one workflow to earn autonomy?**

Use the architecture loop faintly in the background. Put three discussion prompts on the slide:

- Which post-call workflow has enough frequency and pain to create the strongest eval funnel?
- Where should learned rules live: user, team, account, or workflow level?
- What evidence would Ghost require before reducing approval friction?

Close with links or QR codes to:

- Working Close the Loop demo
- Eval Control Tower
- GitHub repository

Do not end with `Thank you`. End on the product question.

## Appendix

### Appendix A - Built now versus production integration

Create a candid comparison table.

**Built and working now**

- deterministic verified demo
- transcript evidence extraction
- exact source tracing
- editable follow-up and CRM artifacts
- local and durable evaluation events
- learned-rule replay
- Supabase-backed Control Tower
- explicit save/delete and retry behavior

**Production work remaining**

- Ghost graph/API integration
- real email send and HubSpot governed write-back
- authentication and tenant isolation
- production observability and queueing
- outcome ingestion and causal analysis design

### Appendix B - Metric definitions

Define each metric in one line: approval rate, edit rate, decision time, completed action rate, verified evidence rate, rejection reason, and rule-application cohort. State that only the latest decision per run/artifact should count in headline approval metrics.

### Appendix C - Sources and demo links

List the supplied strategy brief, Ghost website, working demo, Control Tower, and GitHub repository. Make every URL clickable. State that customer names and outcomes in the prototype are fictional and all displayed dashboard metrics are simulated demo data.

## Diagram and screenshot instructions

- Build diagrams as editable native slide shapes, not rasterized diagrams or generated art.
- Use consistent arrow direction, line weight, spacing, and entity naming across slides.
- On the architecture slide, use violet only to show the active data path.
- On the feedback loop, visually distinguish observed events from inferred learning.
- On the entity relationship diagram, show no more than seven entities and no field-level schema.
- Capture product screenshots at high resolution from the supplied live URLs. Crop tightly to the exact interface being discussed.
- Do not fabricate UI screens. If screenshots cannot be captured, use labelled wireframes and mark them clearly as reconstructions.
- Blur or omit any secrets, environment variables, user credentials, or browser chrome.

## Accuracy and claims guardrails

- Do not claim the prototype sends real email or writes to a live CRM. It uses a labelled demo sandbox.
- Do not claim causal impact from the learned-rule comparison. Use `association, not causation`.
- Do not claim production customer usage, revenue impact, model improvement, or measured time savings.
- Do not claim Ghost approved or sponsored this product concept.
- Do not imply Supabase is the proposed permanent Ghost production datastore. It is the prototype's durable evaluation store.
- Distinguish clearly among `live in Ghost today`, `working in this prototype`, and `proposed production integration`.
- Preserve Ghost's positioning that the CRM remains the system of record for the human revenue team while Ghost becomes the system of record for agents.

## Speaker notes

Write speaker notes for every core slide. Each note should contain:

1. A 30-60 second talk track in natural spoken language.
2. The one sentence Ankit should emphasize.
3. A likely CEO question and a concise answer.
4. Any caveat needed to keep the claim precise.

Do not write notes that simply repeat slide text. The notes should help Ankit move fluidly between product, architecture, customer value, and strategic implications.

## Final quality check

Before delivering the deck, verify all of the following:

- The story answers `what did you build with the context?`, not `what did the brief say?`
- Every slide has one clear takeaway.
- All product claims are traceable to the supplied sources or working prototype.
- All prototype data is labelled simulated.
- No slide contains unreadably small text.
- No text or diagram is clipped.
- The architecture is technically coherent and visually legible.
- Screenshots are sharp and not stretched.
- The deck looks like Ghost: editorial, dark navy and paper, disciplined violet, strong typography, no generic AI imagery.
- The final slide invites a product discussion instead of making an inflated claim.
- Deliver both an editable `.pptx` and a PDF export.

Also provide a one-page presenter cheat sheet after the deck with: the 90-second opening, the three most important product claims, the three caveats, five likely CEO questions with answers, and the recommended live-demo transition after Slide 5.
