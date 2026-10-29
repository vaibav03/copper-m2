# Architecture

How the Copper State Labs app fits together. Each module adds a section at the
end (see [Adding a module](#adding-a-module)) when it changes how the app
works: new pages, tables or AI calls.

_Fictional — for educational use._

## The starter app (Module 0)

A Next.js app that builds, runs and deploys with **no environment variables**.
A Google AI Studio key is optional until a module needs one.

| Piece | Where | What it does |
|---|---|---|
| Pages | `app/` | `layout.tsx` sets the fonts and theme; `page.tsx` is the placeholder home page |
| Brand components | `components/copper/` | `Logo`, `SiteHeader`, `SiteFooter`, `ModeToggle` |
| UI kit | `components/ui/` (shadcn), `components/ai-elements/` (AI Elements) | The only UI libraries the app uses |
| Setup card | `components/setup-required.tsx` | `<SetupRequired service="ai" />`, shown instead of a page whose service isn't configured |
| Company catalog | `lib/copper/catalog.ts`, `lib/copper/data/catalog.json` | Product, plan and privacy facts from the Product Bible (Sections 3, 4, 8 and 10). Pages read prices and plan details from here instead of typing them (added in the Module 1 starter) |
| AI wrapper | `lib/ai/call.ts` | `callText` and `callObject`: every model call goes through these and is logged to the terminal |
| Models and prices | `lib/ai/models.ts`, `lib/ai/pricing.ts` | The approved Gemini models and their token prices |
| Module checks | `specs/module-N/`, `scripts/check.mjs` | Each module's spec, instructions, rubric and acceptance tests; `npm run check` runs them |

## Data flow

1. A user opens a page in `app/`.
2. Server code checks what's configured (`isAiConfigured()`). If the key is
   missing, the page renders `<SetupRequired />` instead of crashing.
3. Data comes from files under `lib/copper/data/`, except where a module has
   moved it to a database: Module 2 part 2 moves stock to a Supabase
   `inventory` table, read through `lib/copper/inventory.ts`. Facts that don't
   change daily (prices, colors) stay in the files.
4. AI requests go through `callText` / `callObject` in `lib/ai/call.ts`, which
   calls Google and then prints one `[ai_calls]` line: `module`, `feature`,
   `model`, tokens, `cost_usd`, `latency_ms`, `ok`.

```ts
const { text } = await callText(
  { module: 2, feature: "ask-copper" },
  { prompt },
);
```

## Two kinds of "AI tiers"

Don't mix these up:

- **Copper State Labs' product tiers** (On-device, Raw Ore, Refined, the
  Copper Cloud) are part of the fictional company. They are facts in the
  [Product Bible](copper-state-labs/product-bible.md) and rows in the `ai_tiers`
  table.
- **The models this app calls** are real Claude models listed in
  `lib/ai/models.ts`. Their cost is logged in `ai_calls`.

## Decisions

- **No environment variables required.** Every service is optional, so a fresh
  clone builds and deploys before any accounts are set up.
- **One AI wrapper.** Routing every call through `lib/ai/call.ts` gives one
  place to log cost and latency per module and feature.
- **No authentication or row-level security yet.** They arrive in a later
  module.

## Module 2: Ask Copper, the shopping chatbot

**Summary:** A floating chat panel that answers questions about prices, totals
and stock by calling tools instead of guessing, and draws every step of the
agent loop as it streams in. Part 2 moved stock out of the repo and into a
Supabase table, so a warehouse update needs no deploy.

| Piece | Where | What it does |
|---|---|---|
| Page / route | `app/page.tsx` | No new route. The landing page mounts `<AskCopper>` and passes `isAiConfigured()` down, because the panel is a client component and can't read a server-only key |
| Components | `components/copper/ask-copper.tsx`, `components/copper/tool-call-card.tsx` | The panel (launcher, `Sheet`, two conversations, the station rail) and one tool call drawn as a round trip |
| Tools | `lib/copper/assistant/tools.ts` | `get_products`, `get_prices`, `calculate_cost`, `check_availability`, with zod schemas as their contracts |
| Instructions | `lib/copper/assistant/instructions.ts` | `COPPER_INSTRUCTIONS`, sent as the model's system message only when tools are on |
| Server Action | `lib/copper/assistant/ask.ts` | `askCopper()` returns `{ progress }` immediately and reads `fullStream` in the background |
| Streaming plumbing | `lib/ai/live.ts`, `lib/copper/assistant/progress.ts` | `Live<Progress>`: each update carries everything so far, as a fresh copy |
| Data | Supabase `inventory` table (part 2), `lib/copper/data/catalog.json` | Stock is a row per product color; prices and colors stay in the catalog file |
| Database | `supabase/migrations/20261029000000_inventory.sql`, `supabase/seed.sql`, `lib/supabase/server.ts` | The table, its six seed rows, RLS with public read and no writes, and a stateless client that is `null` when unconfigured |
| AI calls | `lib/ai/call.ts` — module 2, feature `ask-copper` | `callStream` with `THOUGHT_SUMMARIES`, and `stopWhen: stepCountIs(5)` when tools are on. Gemini 2.5 Flash, well under a cent per question |

**Data flow:** shopper types a question → `askCopper()` (Server Action) →
`callStream` → the model picks a tool → our code runs it (`calculate_cost` does
the arithmetic, `check_availability` calls `readInventory()`, which selects
from the Supabase table) → the result goes back to the model → the reply
streams out as `Progress` updates the panel redraws.

**Decisions and trade-offs:**

- **Tools, not a bigger prompt.** Prices and stock can't live in the
  instructions: the model would recite stale numbers confidently. A tool reads
  them fresh on every call.
- **Two separate conversations.** Tools on and tools off never share history,
  or the tools-off model would simply copy an answer the tools worked out and
  the comparison would prove nothing.
- **Stock in a database, prices in a file.** What a product costs and which
  colors it comes in change rarely and belong with the code. Stock changes
  daily, so it belongs where a non-developer can edit it.
- **`readInventory()` is the only seam.** Moving stock from JSON to Supabase
  changed one function and no tests, because nothing else knows where stock
  lives.
- **Read-only tools.** Nothing can order, refund or change anything, and the
  `inventory` table's RLS allows select and nothing else.

**Risks and open questions:**

- **A wrong answer still sounds confident.** The tools-off chat exists to make
  that visible. The tool card is the audit trail when an answer is disputed.
- **The publishable key is in the browser bundle.** That is what it's for:
  RLS makes the table readable and nothing more. The secret key is never used
  here.
- **Degrading, not crashing.** No model key shows `<SetupRequired />`; no
  Supabase makes `readInventory()` return `null`, and Copper says stock can't
  be checked rather than inventing a number.
- **Cost.** One question is a few thousand tokens. Thought summaries add
  output tokens, which is the price of showing the work.

## Adding a module

When a module changes how the app fits together, add a section here:

```md
## Module N: <feature name>

**Summary:** one or two sentences: what this adds and why.

| Piece | Where | What it does |
|---|---|---|
| Page / route | `app/...` | |
| Components | `components/...` | |
| Data | `lib/copper/data/...` | Data files added |
| AI calls | `lib/ai/call.ts` (module, feature) | Model, prompt purpose, expected cost per call |

**Data flow:** user action → page → server code → database / model → response.

**Decisions and trade-offs:** what you chose, the alternatives, and why.

**Risks and open questions:** cost, privacy, accuracy or safety risks, and how
you handle them.
```
