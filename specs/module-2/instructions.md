# Module 2: Build Ask Copper, the shopping chatbot

_Fictional — for educational use._

Shoppers on the Copper State Labs site keep asking what things cost and what's in stock. This module, you add **Ask Copper**: a chat panel that answers by using **tools** (small pieces of code that look up prices, do the math and check stock in the database) instead of guessing.

The panel also shows its work. As the answer arrives, you watch Copper pick a tool, send it numbers, read the result and write the reply. By the end you'll be able to explain exactly what a tool is, and show someone what happens without one.

**Four prompts build the whole thing.** Paste each one into Claude Code and let it finish before you move on. The rest of this page is what *you* do between them, and there isn't much: sign up for two free accounts, paste one key, click Authorize twice, and look at the result in a browser.

The full requirements are in **`specs/module-2/spec.md`**. The prompts send your agent there, so you don't have to read it.

| | |
|---|---|
| **You'll build** | Four tools, Copper's instructions, a streaming Server Action, and the chat panel |
| **Your repo** | `copper-m2` (public, on your GitHub account; a new repo, separate from `copper-m1`) |
| **Points** | 75 from tests, and 30 for the live site, its Google key and the part 2 database |
| **Submit** | Your repo link, your Vercel link, and a screenshot of `npm run check` (see [What to submit](#what-to-submit)) |

---

## Before you start

- Module 1 is done: you have a `copper-m1` repo and a live Vercel site.
- `node --version` starts with v24, and `gh auth status` says you're logged in.
- You have a **Google AI Studio API key** ([aistudio.google.com](https://aistudio.google.com) > Get API key). Free, no credit card.

## Step 1: Set up

Open Claude Code in the folder where you keep your projects and paste this:

```
Set up Module 2 of my CIS 591 project. Do these in order, and stop and tell me
if a step fails:
1. git clone --branch module-2-part-1 https://github.com/CIS-591/class-examples.git copper-m2
2. Go into the copper-m2 folder
3. npm run start-module   (makes copper-m2 on my own GitHub, public)
4. npm ci
5. npm run check — show me the output. It should say 12 of 27.
```

Those 12 are Module 1's criteria. The 15 that fail are what the next prompt
builds. `DEPLOY`, `AI-KEY` and `SUPABASE` show as "checked later" — the grader
does those on your live site and in your repo.

**Restart Claude Code inside the new `copper-m2` folder** before the next step,
so it picks up the project's rules and MCP servers.

## Step 2: Build Ask Copper

One prompt builds all of it. Paste this and let it work:

```
Build Module 2 of this project, following specs/module-2/spec.md exactly. Work
in this order, running npm run check after each part and committing when it
improves:

1. The four tools in lib/copper/assistant/tools.ts (spec section 1). The tests
   check these: "Copper Home with Copper Plus, paid yearly, for 2 years" is
   $149 + 2 x $79 = $307, counting Copper Plus once per household, not per
   device; Copper Notes in Patina Teal is "not a color", not "out of stock";
   no price is typed into the code — read every price from the catalog, and
   read stock fresh from readInventory() on every call.
2. COPPER_INSTRUCTIONS in lib/copper/assistant/instructions.ts (spec section
   2): at least 40 words of plain English covering every point the spec lists.
3. askCopper() in lib/copper/assistant/ask.ts and the panel in
   components/copper/ask-copper.tsx with its tool card (spec sections 3, 4 and
   5). Every model call goes through callStream with { module: 2, feature:
   "ask-copper" } and providerOptions: THOUGHT_SUMMARIES. Tools and
   instructions are sent only when Use tools is on, with stopWhen:
   stepCountIs(5); with it off, send no instructions and no tools at all. Each
   update is a fresh copy of everything so far. askCopper returns { progress }
   immediately and reads the stream in the background. A tool step appears at
   tool-input-start, before its input is known. Tools on and tools off are
   separate conversations. Use a Server Action, no API route and no new page,
   and brand colours only.

Then run npm run check, npm test, npm run lint, npm run typecheck and npm run
format, fix anything that fails without touching specs/*/tests, and tell me
the final count. It should be 27 of 27. Commit and push to origin, which is
my own copper-m2 repo.
```

Expect this to take a while and to ask you to approve edits. When it says 27 of
27, part 1's 75 points are done.

## Step 3: Try it

This is the part no agent can do for you: looking at the thing.

1. Put your Google AI Studio key in `.env.local` as
   `GOOGLE_GENERATIVE_AI_API_KEY=your-key-here`. Never commit this file.
2. Run `npm run dev` and open http://localhost:3000, then click **Ask Copper**.
3. Ask: _"How much is Copper Home with Copper Plus, paid yearly, for 2 years?"_
   Watch the stations appear: the tools Copper can use, what it was thinking,
   the tool it called with what it sent and what came back, then the answer.
4. Flip **Use tools** off and ask the same question. Same model, same question,
   nothing telling it to check — watch it invent a price.

That contrast is the whole point of the module. Each answer's cost and time
print in the terminal as a line starting `[ai_calls]`.

## Step 4: Deploy

Type `/mcp` in Claude Code and authorize **Vercel** (it's already listed in
this project's `.mcp.json`). Then paste:

```
Deploy this project to Vercel with the Vercel MCP tools, set
GOOGLE_GENERATIVE_AI_API_KEY in the Vercel project from my .env.local without
printing it, redeploy so it takes effect, and give me the production URL.
```

Open the URL and ask Copper a question. The grader loads this page twice: once
for the Ask Copper launcher (10 points) and once to check the setup card is
*gone* (10 points), which only happens if the key reached Vercel.

---

# Part 2: live stock

Part 1 is worth all 75 test points and is finished. Part 2 is the second class
session, and it's two prompts long.

Right now today's stock lives in a file that ships inside your deployed code.
A warehouse update needs a developer, a commit and a deploy. Here you move
stock into a **database** (Supabase) and change one function so Copper reads
it. Nothing else about Copper changes, and no test changes, because the tests
never look at where stock really comes from.

A **database** here is just a table on someone else's computer that your app
can read over the internet, and that you can edit in a web page without
touching code.

## Step 5: Get the part 2 files and a Supabase project

Paste this:

```
In this repo, pull the part 2 files from the course remote (the class repo;
my own repo is origin). First commit anything uncommitted, then:
git pull --no-rebase course module-2-part-1
npm install
If the merge stops over specs/module-2/report.md, that worksheet was retired:
delete it and finish the merge. Then show me what changed.
```

That brings in the migration, the seed, the Supabase client and the MCP config,
and keeps everything you wrote in part 1 — including any shadcn or AI Elements
components you added.

While it runs, go to [supabase.com](https://supabase.com) and sign up with
your personal email, not your ASU one. Stop there — you don't need to create
anything; Claude makes the project in the next step.

Then **restart Claude Code** (the pull replaced `.mcp.json`, and a running
session won't see the new servers) and type `/mcp` to authorize **Supabase**.
Its MCP server acts with *your* permissions and can create and change
databases, so authorize your own personal organization, never one with real
data in it.

## Step 6: Let Claude move stock into it

```
Using the Supabase MCP tools, move stock out of the JSON file and into the
database:
1. Create a free Supabase project called copper-m2 if I don't have one
   already, and wait until it's ready.
2. Apply supabase/migrations/20261029000000_inventory.sql to it, run
   supabase/seed.sql, and show me the rows in the inventory table.
3. Look up the project URL and the publishable key, add them to .env.local as
   NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY without
   printing the file, and set the same two in Vercel with the Vercel MCP tools.
4. Read lib/copper/inventory.ts and lib/supabase/server.ts, then rewrite
   readInventory() to read every row from the Supabase inventory table instead
   of the JSON file, keeping the same return type: InventoryRow[] when it
   works, null when it can't read.
5. Delete lib/copper/data/inventory.json, run npm run check, commit, push to
   origin (my own copper-m2 repo, not the course remote), and redeploy to
   Vercel.
```

`npm run check` must still say **27 of 27**. The tests replace the whole
inventory file with a fake, so moving stock to a database can't affect them.
If a number moved, something else broke.

## Step 7: Prove it's live

The payoff, and it takes a minute:

1. Open your **deployed** site and ask _"Is Copper Notes in Night Sky in
   stock?"_
2. In Supabase, open the **Table Editor**, find row `CN-NSK`, and change
   `units_in_stock` from 0 to 40. Save.
3. Ask the live site the same question again.

The answer changes. No commit, no deploy, no code. A shop manager could have
done that.

## What to submit

In Canvas:

1. Your GitHub repo link (`https://github.com/YOUR-USERNAME/copper-m2`)
2. Your Vercel link
3. A screenshot of `npm run check` showing **27 of 27** criteria passed

Everything else is graded from your repo and your live site, so make sure your last commit is pushed and Vercel has redeployed.

## How it's graded

| Part | Points | How |
|---|---|---|
| Part A: the chat widget (AC-M2.1 to AC-M2.4) | 20 | Tests |
| Part B: the tools (AC-M2.5 to AC-M2.10) | 30 | Tests |
| Part C: streaming (AC-M2.11 to AC-M2.15) | 25 | Tests (with a fake model and database, so they cost nothing) |
| DEPLOY: live on Vercel | 10 | The grader loads your site and looks for Ask Copper |
| AI-KEY: the live site has a Google key | 10 | The grader checks your site shows the chat, not the setup card |
| SUPABASE: stock comes from the database | 10 | The grader checks `readInventory()` reads Supabase and the JSON file is gone (part 2) |

Your last commit before the deadline is graded. Tests are run with your instructor's copy, so changing them in your repo doesn't change your grade.

## Rules

- **Don't edit** `specs/*/tests`, `specs/*/rubric.md`, `lib/copper/catalog.ts`, `lib/copper/inventory.ts` or `lib/copper/data/` — until Step 6, which rewrites `lib/copper/inventory.ts` and deletes the stock file on purpose.
- **Never commit `.env.local` or paste keys into code.**
- **Everything about Copper State Labs is fictional.** Don't use real company names, logos or products.

## Troubleshooting

| Problem | Fix |
|---|---|
| The panel says "Set up Google AI" | Add `GOOGLE_GENERATIVE_AI_API_KEY` to `.env.local` and restart `npm run dev`. On Vercel, add it in Project Settings > Environment Variables and redeploy |
| Copper answers but no tool card appears | Use tools is off, or the model answered without a tool. Check your instructions say to **always** use the tools |
| Copper says nothing at all with tools off | You sent Copper's "always use your tools" instructions with no tools. With tools off, send no instructions at all |
| No thinking station appears | `providerOptions: THOUGHT_SUMMARIES` is missing from your `callStream` call |
| The answer appears all at once | You're waiting for the whole stream before sending an update. Send one on every change |
| Copper says stock can't be checked (part 1) | `readInventory()` returned nothing. Check `lib/copper/data/inventory.json` is still valid JSON |
| Copper says stock can't be checked (after Step 6) | The two `NEXT_PUBLIC_SUPABASE_*` variables are missing or wrong, or the project is paused. Check `.env.local`, restart `npm run dev`, and open the project in Supabase to wake it |
| `/mcp` is empty, or a server is missing | Claude Code asks whether to trust a project's MCP servers the first time it sees them. If you said no, or never saw the prompt, restart `claude` inside `copper-m2` and accept |
| `/mcp` shows no Vercel or Supabase after Step 5 | The pull replaced `.mcp.json` while Claude Code was running. Restart `claude`, then `/mcp` |
| `/mcp` shows no Supabase tools | Claude Code was started outside your `copper-m2` folder, so it never read `.mcp.json`, or you closed the browser before authorizing. Restart `claude` inside `copper-m2`, then `/mcp` |
| Claude says it can't see your tables | You authorized the wrong Supabase organization. In `/mcp`, disconnect Supabase and authorize again, choosing the organization that holds your project |
| Stock works locally but not on Vercel | The two Supabase variables are only in `.env.local`. Add them in Project Settings > Environment Variables and redeploy |
| Your Supabase project is "paused" | Free projects sleep after about a week unused. Open it in Supabase to wake it, and always wake it before a deadline |
| AC-M2.5 fails with $386.88 or similar | Copper Plus is being counted once per device. It's once per household |
| AC-M2.6 fails | A price is typed into `tools.ts`. Read every price from `getProducts()` and `getPlans()` |
| AC-M2.7 or AC-M2.10 fails | An input schema is still `z.any()`, or lets in something the contract doesn't allow |
| AC-M2.9 fails after the stock changes | The tool saved the table once instead of reading it each time |
| AC-M2.10 fails on Patina Teal | It says "out of stock" instead of `"not_a_color"`. Check the color against the product's colors in the catalog first |
| AC-M2.11 fails | The model gets only one step, so it never sees the tool's result. Add `stopWhen: stepCountIs(5)` |
| AC-M2.12 fails | The tool step is added only when the input arrives. Add it at `tool-input-start`, when only the name is known |
| AC-1.4 (Module 1) fails | You added an API route or page. Use a Server Action (`"use server"`) in `lib/copper/assistant/ask.ts` instead |
| AC-4.1 (Module 1) fails | The new chat code uses a non-brand color. Swap it for a theme class |
| `npm run check` says "could not run" | A compile error. `npm run typecheck` shows it |
| `check_availability` finds no rows | A stock row's `product` holds "Copper Notes", not `copper-notes`. Look the name up with `getProducts()` first |
| Two tool cards appear for one tool call | `tool-input-start` gives `part.id`; the later parts give the same id as `part.toolCallId`. Match on it |
| `npm run build` stops with a Next.js security notice | Run it again; it continues. The course pins this version, so don't upgrade it |

When something breaks, hand your agent the command you ran and the full error message. After 20 minutes with no progress, or when a fix works and you can't tell why, post in the course forum or come to office hours.
