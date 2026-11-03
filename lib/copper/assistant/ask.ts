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

const EMPTY_REPLY =
  "Sorry, I couldn't put an answer together just then. Could you ask me again?";
const BROKEN =
  "Sorry, something went wrong while I was answering. Please try again in a moment.";

/** The tool step a `tool-call` or `tool-result` part belongs to. */
function toolStepById(steps: Step[], id: string): ToolStep | undefined {
  return steps.find(
    (step): step is ToolStep => step.type === "tool" && step.id === id,
  );
}

export async function askCopper(
  request: AskCopperRequest,
): Promise<AskCopperResult> {
  const { messages, useTools } = request;
  const live = createLive<Progress>();

  const steps: Step[] = [];
  let reply = "";

  // Every update carries everything so far, and a fresh copy of it: the panel
  // keeps earlier updates around, so it must never see one change underneath.
  const snapshot = (status: Progress["status"]): Progress => ({
    steps: steps.map((step) => ({ ...step })),
    reply,
    status,
  });

  let stream: ReturnType<typeof callStream>;
  try {
    stream = callStream(
      { module: 2, feature: "ask-copper" },
      useTools
        ? {
            // The instructions reach the model as its system message.
            instructions: COPPER_INSTRUCTIONS,
            messages,
            tools: copperTools,
            stopWhen: stepCountIs(MAX_STEPS),
            providerOptions: THOUGHT_SUMMARIES,
          }
        : // Tools off means nothing to check with and nothing telling it to
          // check: just the conversation, answered from memory alone.
          { messages, providerOptions: THOUGHT_SUMMARIES },
    );
  } catch {
    reply = BROKEN;
    live.done(snapshot("error"));
    return { progress: live.live };
  }

  // Read the stream in the background so the panel can start drawing at once.
  void (async () => {
    try {
      for await (const part of stream.fullStream) {
        switch (part.type) {
          case "reasoning-delta": {
            // One thinking station per run of reasoning.
            const last = steps.at(-1);
            if (last?.type === "thinking") last.text += part.text;
            else steps.push({ type: "thinking", text: part.text });
            break;
          }
          case "tool-input-start": {
            // The name arrives before the input, so the panel can say which
            // tool Copper picked while it is still filling in the details.
            steps.push({
              type: "tool",
              id: part.id,
              name: part.toolName,
              state: "calling",
            });
            break;
          }
          case "tool-call": {
            const step = toolStepById(steps, part.toolCallId);
            if (step) step.input = part.input;
            else
              steps.push({
                type: "tool",
                id: part.toolCallId,
                name: part.toolName,
                state: "calling",
                input: part.input,
              });
            break;
          }
          case "tool-result": {
            const step = toolStepById(steps, part.toolCallId);
            if (step) {
              step.output = part.output;
              step.state = "done";
            }
            break;
          }
          case "tool-error": {
            const step = toolStepById(steps, part.toolCallId);
            if (step) {
              step.output = String(part.error);
              step.state = "error";
            }
            break;
          }
          case "text-delta": {
            reply += part.text;
            break;
          }
        }
        live.update(snapshot("working"));
      }
      // A stream that ends with nothing to say is still a finished answer.
      if (!reply) reply = EMPTY_REPLY;
      live.done(snapshot("done"));
    } catch {
      if (!reply) reply = BROKEN;
      live.done(snapshot("error"));
    }
  })();

  return { progress: live.live };
}
