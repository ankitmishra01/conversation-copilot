# Conversation Copilot Design System

## Direction

The approved Close the Loop treatment is **Direction B**: the customer evidence trace is the primary visual and interaction model. The product should feel like one fact moving from source context through an agent action, human evaluation, and eventual attribution. It must not read as a generic dashboard or a collection of disconnected cards.

This is a product of **AM Consulting Group**. Keep the AM Consulting Group text mark and the credit line "A product by AM Consulting Group" visible in the header.

## Brand foundation

- Ink: `#10172A`
- Paper: `#F6F7F1`
- Violet: `#8059FF`
- Bright surface: `#FFFFFF`
- Typeface: Helvetica Neue with Arial as fallback
- Wordmark: the text mark "AM Consulting Group" in the header, set in the page typeface

Violet indicates selection, focus, and the next primary action. Green is reserved for verified or completed states. Red is reserved for unsupported evidence and rejection. Remove decorative gradients, shadows, icon circles, and unnecessary rounding.

## Layout vocabulary

- Global shell: wordmark, authorship boundary, three persistent product modes.
- Marketing surface: one shallow, left-aligned statement and one living four-step trace.
- Application surface: source column, evidence column, decision/evaluation column.
- Cards exist only when the card is the action being reviewed. Evidence is a connected list, not a tile grid.
- Hairline dividers and spacing establish hierarchy. Default corner radius is 4px.

## Interaction rules

- Live copilot, Answer coach, and Close the Loop are true modes with shareable URLs and retained browser state.
- Evidence selection reveals the exact supporting transcript passage.
- Approve, edit, reject, replay, reset, and export all produce visible state changes.
- Rejection requires a reason. Approval creates a safe local completion record.
- Verified demo data loads without a model request. Live analysis is secondary and must fall back without hiding verified work.
- Mobile controls are at least 44px, modes remain visible in a horizontal tab strip, and content follows summary → evidence → decisions.
- The verified presentation follows one causal-looking thread without claiming causality: source evidence → human correction → scoped rule → changed next-run output → associated fictional outcome.
- Learned rules always name their application scope and exclusions. A customer-email preference must not silently erase useful CRM memory.
- Presentation mode is a deterministic replay with explicit controls and labels; live model behavior is never substituted into the verified story.
- Eval Control Tower is a fourth product mode, not an embedded generic dashboard. Metrics resolve back to a labelled run and exact source quote.
- Live transcripts are persisted only after an explicit save action; deletion removes the full saved run. Demo and live datasets are always visibly distinguished.
- Rule comparisons are labelled as association, not causation.

## Accessibility

Use one page-level heading per mode, visible focus rings, semantic tab and toolbar roles, labelled form fields, polite live regions, AA text contrast, and reduced-motion fallbacks. Never communicate verification, rejection, or completion by color alone.
