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

## Module 2: Ask Copper, the tool-using chat panel

**Summary:** A floating chat panel on the landing page answers shopper
questions about products, colors, prices, totals and stock. It doesn't answer
from the model's memory: the model is handed four tools (ordinary TypeScript
functions) and the panel shows every call it makes, so the working is visible
rather than taken on trust.

| Piece | Where | What it does |
|---|---|---|
| Page / route | `app/page.tsx` | Mounts `<AskCopper>` and passes `isAiConfigured()` down, because the panel is a client component and can't read a server-only key |
| Components | `components/copper/ask-copper.tsx` | The launcher, the `Sheet` panel, the station rail, the tool cards and the composer |
| Header link | `components/copper/site-header.tsx` | An **Ask Copper** link to `#ask` that opens the panel |
| Tools | `lib/copper/assistant/tools.ts` | `get_products`, `get_prices`, `calculate_cost`, `check_availability`, with zod contracts for the two that take input |
| Instructions | `lib/copper/assistant/instructions.ts` | `COPPER_INSTRUCTIONS`, the system message sent with tools on |
| Progress | `lib/copper/assistant/progress.ts` | The `Progress` shape the panel draws (starter file, unchanged) |
| Data | `lib/copper/data/inventory.json` | Stock, read through `readInventory()` (moves to Supabase in part 2) |
| AI calls | `lib/ai/call.ts` → `callStream({ module: 2, feature: "ask-copper" })` | Gemini 2.5 Flash by default, with `THOUGHT_SUMMARIES` so the panel can show the model's own thinking. One streamed call per question, up to 5 steps |

**Data flow:** shopper types a question → the panel calls the `askCopper`
Server Action with that chat's history and the **Use tools** setting →
`callStream` sends it to Gemini, with the instructions and the four tools when
tools are on → `result.fullStream` is read in the background and each part
(thinking, tool call, tool result, text) updates a `Progress` value → the panel
reads those updates with `readLive()` and redraws. A tool call runs ordinary
code on the server (the catalog, or `readInventory()`), and its result goes
back to the model for the reply.

**Decisions and trade-offs:**

- **Tools over a bigger prompt.** Prices and stock could be pasted into the
  instructions, but stock changes daily and the model would still do the
  arithmetic. Tools keep the numbers in code.
- **Two separate conversations.** Tools on and tools off keep their own
  history. Sharing one would let the tools-off model copy an answer the tools
  worked out, and the comparison would prove nothing.
- **The action returns immediately.** `askCopper` returns `{ progress }` and
  reads the stream in the background, so the panel can draw the first station
  straight away rather than waiting for the whole answer.
- **Every update is a fresh copy.** The panel keeps earlier updates, so a
  shared object that changed underneath it would corrupt what it already drew.
- **The panel never imports `tools.ts`.** That module reads stock, so the
  panel takes its tool names and labels from `progress.ts` instead.

**Risks and open questions:**

- **Cost.** One streamed Gemini 2.5 Flash call per question, plus a step per
  tool call, capped at 5 steps. Each call is logged as an `[ai_calls]` line
  with its tokens and cost.
- **Accuracy.** With tools on, every number comes from the catalog or the
  stock list. With tools off the model invents them, which is the point of
  that mode — so those answers carry a visible "may be made up" warning.
- **Degrading, not crashing.** No AI key shows `<SetupRequired />`. Stock that
  can't be read returns `"unavailable"`, and the tool deliberately says so
  rather than guessing a number.
- **Open question:** the tools only read. Anything that would buy, reserve or
  change something is out of scope and would need a different safety story.
