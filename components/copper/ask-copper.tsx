"use client";

// Module 2: the Ask Copper chat panel. It narrates the agent loop as the
// answer streams in — the tools on offer, what Copper was thinking, the round
// trip to our own code, and only then the reply — so a shopper (and a
// student) can see how the answer was reached. Described in
// specs/module-2/spec.md sections 4 and 5.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpIcon,
  BrainIcon,
  MessageCircleIcon,
  SparklesIcon,
  TriangleAlertIcon,
  WrenchIcon,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { ToolCallCard } from "@/components/copper/tool-call-card";
import { SetupRequired } from "@/components/setup-required";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { readLive } from "@/lib/ai/live";
import { askCopper, type ChatMessage } from "@/lib/copper/assistant/ask";
import {
  TOOL_LABELS,
  type Progress,
  type ToolStep,
} from "@/lib/copper/assistant/progress";
import { cn } from "@/lib/utils";

/** The three questions an empty chat offers, word for word from the spec. */
const STARTERS = [
  "How much is Copper Home with Copper Plus, paid yearly, for 2 years?",
  "Is Copper Notes in Night Sky in stock?",
  "Is Copper Plus cheaper monthly or yearly?",
];

/** One question and the answer being built for it. */
type Exchange = { question: string; progress: Progress };

const STARTING: Progress = { steps: [], reply: "", status: "working" };

/** A round node on the rail, with the rail appearing to pass behind it. */
function Node({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "ring-secondary absolute -left-[23px] top-0 flex size-4 items-center justify-center rounded-full text-white ring-4",
        tone,
      )}
    >
      {children}
    </span>
  );
}

function Station({
  tone,
  icon,
  label,
  children,
}: {
  tone: string;
  icon: React.ReactNode;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <Node tone={tone}>{icon}</Node>
      {label ? (
        <p className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
          {label}
        </p>
      ) : null}
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** Station 1: the menu of tools the model was handed, and which it picked. */
function ToolMenu({
  used,
  useTools,
}: {
  used: Set<string>;
  useTools: boolean;
}) {
  const names = Object.keys(TOOL_LABELS);
  return (
    <Station
      tone={useTools ? "bg-primary" : "bg-chart-3"}
      icon={<SparklesIcon className="size-2.5" />}
      label={useTools ? "Tools Copper can use" : "Tools given to Copper: none"}
    >
      <div className="flex flex-wrap gap-1">
        {names.map((name) => (
          <span
            key={name}
            className={cn(
              "rounded px-1.5 py-0.5 font-mono text-[11px]",
              !useTools && "text-muted-foreground bg-muted line-through",
              useTools && used.has(name) && "bg-accent font-bold text-white",
              useTools && !used.has(name) && "text-muted-foreground bg-muted",
            )}
          >
            {name}
          </span>
        ))}
      </div>
      {useTools ? null : (
        <p className="text-muted-foreground mt-1 text-xs">
          Copper has to answer from memory alone.
        </p>
      )}
    </Station>
  );
}

/** Station 4: one line saying what Copper is busy with right now. */
function nowDoing(progress: Progress, useTools: boolean): string {
  if (progress.reply) return "Writing the answer…";
  if (!useTools) return "Answering from memory…";
  if (progress.steps.length) return "Deciding what to do next…";
  return "Reading your question…";
}

/** One question, the stations it produced, and Copper's reply. */
function Answer({
  exchange,
  useTools,
}: {
  exchange: Exchange;
  useTools: boolean;
}) {
  const { progress } = exchange;
  const working = progress.status === "working";
  const used = new Set(
    progress.steps
      .filter((step): step is ToolStep => step.type === "tool")
      .map((s) => s.name),
  );
  let called = 0;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <p className="bg-primary max-w-[85%] rounded-lg rounded-br-none px-3 py-2 text-sm text-white">
          {exchange.question}
        </p>
      </div>

      <div className="relative space-y-4 pl-6">
        {/* The rail: one line down the left, from the first station to the last. */}
        <div
          className={cn(
            "absolute top-1 bottom-1 left-[9px] w-px bg-gradient-to-b",
            useTools
              ? "from-primary via-accent to-accent/20"
              : "from-chart-3 to-chart-3/20",
          )}
        />

        <ToolMenu used={used} useTools={useTools} />

        {progress.steps.map((step, i) =>
          step.type === "thinking" ? (
            <Station
              key={i}
              tone={useTools ? "bg-primary" : "bg-chart-3"}
              icon={<BrainIcon className="size-2.5" />}
              label="Copper is thinking"
            >
              <div
                data-testid="thinking"
                className="border-muted text-muted-foreground border-l-2 pl-2 text-xs italic"
              >
                <Streamdown>{step.text}</Streamdown>
              </div>
            </Station>
          ) : (
            <Station
              key={step.id}
              tone="bg-accent"
              icon={<WrenchIcon className="size-2.5" />}
              label={
                step.state === "calling"
                  ? "Copper is calling a tool"
                  : "Copper called a tool"
              }
            >
              <ToolCallCard step={step} index={++called} />
            </Station>
          ),
        )}

        {working ? (
          <div className="relative">
            <span className="ring-secondary absolute -left-[23px] top-0 flex size-4 items-center justify-center gap-px rounded-full bg-muted ring-4">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="bg-muted-foreground size-1 animate-bounce rounded-full"
                  style={{ animationDelay: `${dot * 120}ms` }}
                />
              ))}
            </span>
            <p className="text-muted-foreground text-xs">
              {nowDoing(progress, useTools)}
            </p>
          </div>
        ) : null}
      </div>

      {progress.reply ? (
        <div className="bg-background ml-6 rounded-lg rounded-tl-none border p-3">
          <p className="text-primary text-xs font-semibold">Copper</p>
          {useTools ? null : (
            <div className="border-chart-3 bg-chart-3/10 my-2 rounded-md border p-2 text-xs">
              <p className="text-chart-3 flex items-center gap-1 font-semibold">
                <TriangleAlertIcon className="size-3" />
                Answered without tools: may be made up
              </p>
              <p className="text-muted-foreground mt-1">
                With tools off, Copper can&apos;t see today&apos;s prices or
                stock. The AI only has what it learned in training, so it fills
                the gaps with guesses that sound right. That&apos;s a
                hallucination.
              </p>
            </div>
          )}
          <p className="mt-1 text-sm whitespace-pre-wrap">
            <span>{progress.reply}</span>
            {working ? (
              <span
                aria-hidden
                className="bg-primary ml-0.5 inline-block h-3.5 w-0.5 animate-pulse align-middle"
              />
            ) : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function AskCopper({ aiConfigured }: { aiConfigured: boolean }) {
  const [open, setOpen] = useState(false);
  const [useTools, setUseTools] = useState(true);
  // Tools on and tools off are separate conversations, so the model with no
  // tools can't copy an answer the tools worked out.
  const [withTools, setWithTools] = useState<Exchange[]>([]);
  const [withoutTools, setWithoutTools] = useState<Exchange[]>([]);
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const exchanges = useTools ? withTools : withoutTools;
  const streaming = exchanges.some((e) => e.progress.status === "working");

  // The launcher, the header's Ask Copper link, or loading the site at /#ask.
  // The link needs its own listener: once the address already ends in #ask,
  // clicking it again fires no hashchange, so the link would only work once.
  useEffect(() => {
    const openOnHash = () => {
      if (window.location.hash === "#ask") setOpen(true);
    };
    openOnHash();
    const openOnLink = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const link = target?.closest?.("a");
      if (link?.getAttribute("href")?.endsWith("#ask")) setOpen(true);
    };
    window.addEventListener("hashchange", openOnHash);
    document.addEventListener("click", openOnLink);
    return () => {
      window.removeEventListener("hashchange", openOnHash);
      document.removeEventListener("click", openOnLink);
    };
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: "end" });
  }, [withTools, withoutTools]);

  const send = useCallback(
    async (question: string) => {
      const asked = question.trim();
      if (!asked) return;
      const tools = useTools;
      const setChat = tools ? setWithTools : setWithoutTools;
      const chat = tools ? withTools : withoutTools;

      // Only the questions and the finished replies go to the model: no
      // steps, no tool data, and nothing from the other conversation.
      const messages: ChatMessage[] = chat.flatMap((exchange) => [
        { role: "user" as const, content: exchange.question },
        ...(exchange.progress.reply
          ? [{ role: "assistant" as const, content: exchange.progress.reply }]
          : []),
      ]);
      messages.push({ role: "user", content: asked });

      const at = chat.length;
      setChat((prev) => [...prev, { question: asked, progress: STARTING }]);
      setDraft("");

      const { progress } = await askCopper({ messages, useTools: tools });
      for await (const update of readLive(progress)) {
        setChat((prev) =>
          prev.map((exchange, i) =>
            i === at ? { ...exchange, progress: update } : exchange,
          ),
        );
      }
    },
    [useTools, withTools, withoutTools],
  );

  return (
    <>
      <Button
        data-testid="ask-copper-launcher"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-40 gap-2 rounded-full shadow-lg"
      >
        <MessageCircleIcon className="size-4" />
        Ask Copper
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          data-testid="ask-copper"
          side="right"
          className="flex w-full gap-0 p-0 sm:max-w-md"
        >
          <SheetHeader className="bg-chart-5 gap-0 space-y-0 p-0 text-white">
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="bg-primary flex size-9 shrink-0 items-center justify-center rounded-full text-lg">
                🤖
              </span>
              <div>
                <SheetTitle className="text-base text-white">
                  Ask Copper
                </SheetTitle>
                <SheetDescription className="text-xs text-white/70">
                  Prices, totals and stock, checked with tools.
                </SheetDescription>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-white/5 px-4 py-2">
              <div className="flex-1">
                <p className="text-xs font-medium">Use tools</p>
                <p className="text-[11px] text-white/60">
                  {useTools ? "Checks every answer" : "Model guesses alone"}
                </p>
              </div>
              <Switch
                aria-label="Use tools"
                checked={useTools}
                onCheckedChange={setUseTools}
              />
            </div>
          </SheetHeader>

          {!aiConfigured ? (
            <div className="bg-secondary flex-1 overflow-y-auto px-4">
              <SetupRequired service="ai" />
            </div>
          ) : (
            <>
              <div className="bg-secondary flex-1 space-y-5 overflow-y-auto p-4">
                {exchanges.map((exchange, i) => (
                  <Answer key={i} exchange={exchange} useTools={useTools} />
                ))}

                {/* The starters stay on offer under every answer, so a shopper
                    can keep going without typing. They hide only while a reply
                    is streaming, so nothing moves under the cursor. */}
                {streaming ? null : (
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-xs">
                      {exchanges.length ? "Ask another:" : "Try asking:"}
                    </p>
                    {STARTERS.map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        onClick={() => void send(starter)}
                        className="border-primary/30 bg-background hover:border-primary block w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                )}
                <div ref={bottom} />
              </div>

              <div className="bg-background flex items-center gap-2 border-t p-3">
                <input
                  aria-label="Your question"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void send(draft);
                    }
                  }}
                  placeholder="Ask about prices, colors or stock"
                  className="focus-visible:ring-primary/40 flex-1 rounded-full border px-4 py-2 text-sm outline-none focus-visible:ring-2"
                />
                <Button
                  type="button"
                  aria-label="Send"
                  size="icon"
                  onClick={() => void send(draft)}
                  className="size-9 shrink-0 rounded-full"
                >
                  <ArrowUpIcon className="size-4" />
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
