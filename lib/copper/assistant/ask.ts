"use server";

// Module 2: the server action the Ask Copper chat calls. It streams the
// conversation to the model through callStream (lib/ai/call.ts), with or
// without the tools, and sends back each step as it happens, so the panel can
// show Copper thinking and using its tools. The contract is in
// specs/module-2/spec.md.
import { stepCountIs } from "ai";
import { callStream, THOUGHT_SUMMARIES } from "@/lib/ai/call";
import { createLive, type Live } from "@/lib/ai/live";
import { COPPER_INSTRUCTIONS } from "@/lib/copper/assistant/instructions";
import type { Progress, Step, ToolStep } from "@/lib/copper/assistant/progress";
import { copperTools } from "@/lib/copper/assistant/tools";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type AskCopperRequest = {
  messages: ChatMessage[];
  useTools: boolean;
};

export type AskCopperResult = { progress: Live<Progress> };

/** At most this many model steps (tool calls plus the reply) per question. */
const MAX_STEPS = 5;

/** Said instead of an answer when the model gives us nothing to show. */
const NO_ANSWER =
  "Sorry, I couldn't put an answer together just then. Could you ask me again?";

export async function askCopper(
  request: AskCopperRequest,
): Promise<AskCopperResult> {
  const { live, update, done } = createLive<Progress>();

  // What we know so far. The panel gets a copy of this after every change,
  // never this object itself.
  const steps: Step[] = [];
  let reply = "";

  // A fresh copy every time: the panel (and the tests) keep earlier updates
  // and compare them, so a shared object would change underneath them. The
  // steps array and each step inside it are both copied.
  const snapshot = (status: Progress["status"]): Progress => ({
    steps: steps.map((step) => ({ ...step })),
    reply,
    status,
  });

  /** The tool step the model is filling in, by the id every part shares. */
  const toolStep = (id: string, name = ""): ToolStep => {
    const found = steps.find(
      (step): step is ToolStep => step.type === "tool" && step.id === id,
    );
    if (found) return found;
    const started: ToolStep = { type: "tool", id, name, state: "calling" };
    steps.push(started);
    return started;
  };

  // Read the stream in the background, so the panel starts drawing straight
  // away instead of waiting for the whole answer.
  void (async () => {
    try {
      // With tools off the model gets the conversation and nothing else: no
      // instructions and no tools, so it has to answer from memory. Thought
      // summaries are asked for either way, because watching Copper think its
      // way to an invented price is the point of the tools-off chat.
      const tooling = request.useTools
        ? {
            instructions: COPPER_INSTRUCTIONS,
            tools: copperTools,
            stopWhen: stepCountIs(MAX_STEPS),
          }
        : {};
      const result = callStream(
        { module: 2, feature: "ask-copper" },
        {
          messages: request.messages,
          providerOptions: THOUGHT_SUMMARIES,
          ...tooling,
        },
      );

      let failed = false;
      for await (const part of result.fullStream) {
        switch (part.type) {
          case "reasoning-delta": {
            // One thinking station per run of reasoning: keep adding to the
            // last one, and start a new one if a tool call came in between.
            const last = steps.at(-1);
            if (last?.type === "thinking") last.text += part.text;
            else steps.push({ type: "thinking", text: part.text });
            break;
          }
          case "tool-input-start":
            // The name arrives before the input, so the panel can say which
            // tool Copper picked while it's still filling in the details.
            toolStep(part.id, part.toolName);
            break;
          case "tool-call":
            toolStep(part.toolCallId, part.toolName).input = part.input;
            break;
          case "tool-result": {
            const step = toolStep(part.toolCallId, part.toolName);
            step.output = part.output;
            step.state = "done";
            break;
          }
          case "tool-error": {
            const step = toolStep(part.toolCallId, part.toolName);
            step.output =
              part.error instanceof Error
                ? part.error.message
                : String(part.error);
            step.state = "error";
            break;
          }
          case "text-delta":
            reply += part.text;
            break;
          case "error":
            failed = true;
            break;
          default:
            // start-step, finish, raw and the rest: nothing to draw.
            continue;
        }
        update(snapshot("working"));
      }

      if (failed) {
        if (!reply) reply = NO_ANSWER;
        done(snapshot("error"));
        return;
      }
      // An empty reply still counts as finished, but say something rather
      // than show a blank bubble. Never touch a reply that has words in it.
      if (!reply) reply = NO_ANSWER;
      done(snapshot("done"));
    } catch {
      if (!reply) reply = NO_ANSWER;
      done(snapshot("error"));
    }
  })();

  return { progress: live };
}
