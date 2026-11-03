"use client";

// Module 2: the Ask Copper chat panel. It asks askCopper() (a Server Action)
// and draws the answer as it streams in: the tools Copper could pick from,
// what it was thinking, every tool call with what went in and what came back,
// and only then the reply. The layout is described in specs/module-2/spec.md.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpIcon,
  BrainIcon,
  ListIcon,
  MessageCircleIcon,
  TriangleAlertIcon,
  WrenchIcon,
} from "lucide-react";
import { cn } from "cn";
import { SetupRequired } from "@/components/setup-required";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { formatUsd, getPlans, getProducts } from "@/lib/copper/catalog";

/** The three questions this module is built around. */
const STARTERS = [
  "How much is Copper Home with Copper Plus, paid yearly, for 2 years?",
  "Is Copper Notes in Night Sky in stock?",
  "Is Copper Plus cheaper monthly or yearly?",
];

/** One question and the answer that came back for it. */
type Turn = { id: string; question: string; progress: Progress };

/** Tools on and tools off are separate conversations, so neither copies the other. */
type ChatKey = "tools" | "memory";

const EMPTY: Progress = { steps: [], reply: "", status: "working" };

function productName(id: string): string {
  return getProducts().find((product) => product.id === id)?.name ?? id;
}

function planName(id: string): string {
  return getPlans().find((plan) => plan.id === id)?.name ?? id;
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

/** Gemini's thinking arrives as markdown, so **bold** and `code` are drawn. */
function Thought({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**"))
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        if (part.startsWith("`") && part.endsWith("`"))
          return (
            <code key={index} className="font-mono text-[0.95em]">
              {part.slice(1, -1)}
            </code>
          );
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

/** A station hanging off the rail: a node with an icon, a label and contents. */
function Station({
  icon,
  label,
  tone,
  children,
}: {
  icon: React.ReactNode;
  label?: string;
  tone: "primary" | "accent" | "warn";
  children: React.ReactNode;
}) {
  const node =
    tone === "primary"
      ? "bg-primary text-primary-foreground"
      : tone === "accent"
        ? "bg-accent text-accent-foreground"
        : "bg-chart-3 text-background";
  return (
    <div className="relative pb-4 pl-7">
      <span
        className={cn(
          "ring-secondary absolute top-0 left-0 flex size-5 items-center justify-center rounded-full ring-4",
          node,
        )}
      >
        {icon}
      </span>
      {label && (
        <p className="text-muted-foreground mb-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

/** Station 1: the short menu of tools the model was handed. */
function ToolMenu({
  used,
  toolsOn,
}: {
  used: Set<string>;
  toolsOn: boolean;
}) {
  return (
    <Station
      icon={<ListIcon className="size-3" />}
      label={toolsOn ? "Tools Copper can use" : "Tools given to Copper: none"}
      tone={toolsOn ? "accent" : "warn"}
    >
      <div className="flex flex-wrap gap-1.5">
        {Object.keys(TOOL_LABELS).map((name) => (
          <span
            key={name}
            className={cn(
              "rounded px-1.5 py-0.5 font-mono text-[11px]",
              toolsOn && used.has(name)
                ? "bg-accent text-accent-foreground font-bold"
                : "bg-muted text-muted-foreground",
              !toolsOn && "line-through",
            )}
          >
            {name}
          </span>
        ))}
      </div>
      {!toolsOn && (
        <p className="text-muted-foreground mt-1.5 text-xs">
          Copper has to answer from memory alone.
        </p>
      )}
    </Station>
  );
}

/** A labelled row inside "What Copper sent". */
function SentRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-xs">
      <span className="text-muted-foreground w-16 shrink-0">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ToolInput({ step }: { step: ToolStep }) {
  if (step.name === "get_prices")
    return (
      <p className="text-xs">Nothing, it just asked for the price list</p>
    );
  if (step.name === "get_products")
    return (
      <p className="text-xs">Nothing, it just asked what Copper sells</p>
    );
  if (step.input === undefined)
    return (
      <p className="text-muted-foreground text-xs italic">
        filling in the details…
      </p>
    );

  const input = step.input as Record<string, unknown>;
  if (step.name === "calculate_cost") {
    const products = Array.isArray(input.products)
      ? (input.products as string[]).map(productName).join(", ")
      : "None";
    return (
      <div className="space-y-0.5">
        <SentRow label="Products" value={products || "None"} />
        <SentRow label="Plan" value={planName(String(input.plan))} />
        <SentRow label="Billing" value={String(input.billing)} />
        <SentRow label="Years" value={String(input.years)} />
      </div>
    );
  }
  return (
    <div className="space-y-0.5">
      <SentRow label="Product" value={productName(String(input.product))} />
      <SentRow
        label="Color"
        value={input.color ? String(input.color) : "Every color"}
      />
    </div>
  );
}

type CostOutput = { lines: { item: string; usd: number }[]; totalUsd: number };
type ProductsOutput = {
  products: { id: string; name: string; type: string; priceUsd: number; colors: string[] }[];
};
type PricesOutput = {
  products: { id: string; name: string; priceUsd: number }[];
  plans: { id: string; name: string; monthlyUsd: number; annualUsd: number }[];
};

const STOCK_LABELS: Record<string, { text: string; className: string }> = {
  in_stock: { text: "In stock", className: "bg-accent text-accent-foreground" },
  low_stock: { text: "Low stock", className: "bg-chart-4 text-background" },
  backordered: { text: "Back-ordered", className: "bg-chart-3 text-background" },
};

function niceDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ToolOutput({ step }: { step: ToolStep }) {
  if (step.state === "calling")
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-xs italic">
        <span className="bg-accent size-2 animate-pulse rounded-full" />
        the app is running the code…
      </p>
    );
  if (step.state === "error")
    return <p className="text-destructive text-xs">{String(step.output)}</p>;

  const output = step.output as Record<string, unknown>;

  if (step.name === "calculate_cost") {
    const cost = output as unknown as CostOutput;
    return (
      <div className="space-y-1">
        {cost.lines?.map((line) => (
          <div key={line.item} className="flex justify-between gap-3 text-xs">
            <span>{line.item}</span>
            <span className="font-mono">{formatUsd(line.usd)}</span>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 border-t pt-1">
          <span className="text-xs font-semibold">Total</span>
          <span className="text-primary font-mono text-lg font-bold">
            {formatUsd(cost.totalUsd)}
          </span>
        </div>
      </div>
    );
  }

  if (step.name === "get_products") {
    const list = output as unknown as ProductsOutput;
    return (
      <div className="space-y-2">
        {list.products?.map((product) => (
          <div key={product.id}>
            <div className="flex justify-between gap-3 text-xs font-medium">
              <span>{product.name}</span>
              <span className="font-mono">{formatUsd(product.priceUsd)}</span>
            </div>
            <p className="text-muted-foreground text-[11px]">{product.type}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {product.colors?.map((color) => (
                <span
                  key={color}
                  className="bg-accent/20 text-accent-foreground rounded-full px-1.5 py-0.5 text-[10px]"
                >
                  {color}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (step.name === "get_prices") {
    const prices = output as unknown as PricesOutput;
    return (
      <div className="space-y-1">
        {prices.products?.map((product) => (
          <div key={product.id} className="flex justify-between gap-3 text-xs">
            <span>{product.name}</span>
            <span className="font-mono">{formatUsd(product.priceUsd)}</span>
          </div>
        ))}
        {prices.plans
          ?.filter((plan) => plan.monthlyUsd > 0 || plan.annualUsd > 0)
          .map((plan) => (
            <div key={plan.id} className="flex justify-between gap-3 text-xs">
              <span>{plan.name}</span>
              <span className="font-mono">
                {formatUsd(plan.monthlyUsd)}/mo · {formatUsd(plan.annualUsd)}/yr
              </span>
            </div>
          ))}
      </div>
    );
  }

  // check_availability
  if (output?.status === "not_a_color")
    return (
      <p className="text-xs">
        {String(output.product)} doesn&apos;t come in{" "}
        {String(output.color)}. It comes in{" "}
        {(output.colors as string[])?.join(", ")}.
      </p>
    );
  if (output?.status === "unavailable")
    return <p className="text-xs">{String(output.message)}</p>;

  const colors = (output?.colors ?? []) as {
    color: string;
    stock: string;
    restockDate: string | null;
  }[];
  return (
    <div className="space-y-1">
      {colors.map((entry) => {
        const label = STOCK_LABELS[entry.stock] ?? {
          text: entry.stock,
          className: "bg-muted",
        };
        return (
          <div
            key={entry.color}
            className="flex items-center justify-between gap-3 text-xs"
          >
            <span>{entry.color}</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                label.className,
              )}
            >
              {entry.restockDate
                ? `${label.text} until ${niceDate(entry.restockDate)}`
                : label.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Station 3: one tool call, always open, as a round trip. */
function ToolCard({ step, index }: { step: ToolStep; index: number }) {
  return (
    <div
      data-testid="tool-call"
      data-tool={step.name}
      className="bg-background overflow-hidden rounded-lg border"
    >
      <div className="bg-accent text-accent-foreground flex items-center gap-2 px-2.5 py-1.5">
        <span className="font-mono text-xs font-bold">{step.name}()</span>
        <span className="bg-background/30 rounded px-1.5 py-0.5 text-[10px]">
          tool {index}
        </span>
        <span className="ml-auto text-[11px]">{TOOL_LABELS[step.name]}</span>
      </div>
      <div className="px-2.5 py-2">
        <p className="text-muted-foreground mb-1 text-[11px] font-semibold tracking-wide uppercase">
          → What Copper sent
        </p>
        <ToolInput step={step} />
      </div>
      <div className="bg-accent/10 border-t px-2.5 py-2">
        <p className="text-muted-foreground mb-1 text-[11px] font-semibold tracking-wide uppercase">
          ← What came back
        </p>
        <ToolOutput step={step} />
      </div>
    </div>
  );
}

/** Station 4: one line saying what is happening right now. */
function Working({
  progress,
  toolsOn,
}: {
  progress: Progress;
  toolsOn: boolean;
}) {
  const text = progress.reply
    ? "Writing the answer…"
    : progress.steps.length > 0
      ? "Deciding what to do next…"
      : toolsOn
        ? "Reading your question…"
        : "Answering from memory…";
  return (
    <div className="relative pb-4 pl-7">
      <span className="ring-secondary bg-muted absolute top-0 left-0 flex size-5 items-center justify-center gap-0.5 rounded-full ring-4">
        <span className="bg-foreground/50 size-1 animate-bounce rounded-full" />
        <span className="bg-foreground/50 size-1 animate-bounce rounded-full [animation-delay:120ms]" />
        <span className="bg-foreground/50 size-1 animate-bounce rounded-full [animation-delay:240ms]" />
      </span>
      <p className="text-muted-foreground text-xs">{text}</p>
    </div>
  );
}

/** The whole rail for one answer: every station, in the order it happened. */
function AnswerTrail({
  progress,
  toolsOn,
}: {
  progress: Progress;
  toolsOn: boolean;
}) {
  const used = new Set(
    progress.steps
      .filter((step): step is ToolStep => step.type === "tool")
      .map((step) => step.name),
  );
  // "tool 1", "tool 2"… counting only the tool calls, worked out up front.
  const toolNumbers = new Map(
    progress.steps
      .filter((step): step is ToolStep => step.type === "tool")
      .map((step, index) => [step.id, index + 1] as const),
  );
  return (
    <div
      className={cn(
        "relative before:absolute before:top-1 before:bottom-1 before:left-2 before:w-px before:bg-gradient-to-b",
        toolsOn
          ? "before:from-primary before:via-accent before:to-accent"
          : "before:from-chart-3 before:to-chart-3",
      )}
    >
      <ToolMenu used={used} toolsOn={toolsOn} />
      {progress.steps.map((step, index) => {
        if (step.type === "thinking")
          return (
            <Station
              key={`thinking-${index}`}
              icon={<BrainIcon className="size-3" />}
              label="Copper is thinking"
              tone={toolsOn ? "primary" : "warn"}
            >
              <div
                data-testid="thinking"
                className="text-muted-foreground border-muted border-l-2 pl-2 text-xs italic"
              >
                <Thought text={step.text} />
              </div>
            </Station>
          );
        return (
          <Station
            key={step.id}
            icon={<WrenchIcon className="size-3" />}
            label={
              step.state === "calling"
                ? "Copper is calling a tool"
                : "Copper called a tool"
            }
            tone="accent"
          >
            <ToolCard step={step} index={toolNumbers.get(step.id) ?? 1} />
          </Station>
        );
      })}
      {progress.status === "working" && (
        <Working progress={progress} toolsOn={toolsOn} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

export function AskCopper({ aiConfigured }: { aiConfigured: boolean }) {
  const [open, setOpen] = useState(false);
  const [useTools, setUseTools] = useState(true);
  const [chats, setChats] = useState<Record<ChatKey, Turn[]>>({
    tools: [],
    memory: [],
  });
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const key: ChatKey = useTools ? "tools" : "memory";
  const turns = chats[key];

  // The launcher, the header link and loading the site at /#ask all open it.
  useEffect(() => {
    const openIfAsked = () => {
      if (window.location.hash === "#ask") setOpen(true);
    };
    openIfAsked();
    // Clicking the header link again fires no hashchange once the address
    // already ends in #ask, so watch the click as well.
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const link = target?.closest?.("a");
      if (link?.getAttribute("href")?.endsWith("#ask")) setOpen(true);
    };
    window.addEventListener("hashchange", openIfAsked);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", openIfAsked);
      document.removeEventListener("click", onClick);
    };
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: "end" });
  }, [chats, key]);

  const send = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (!text || busy) return;
      const chatKey: ChatKey = useTools ? "tools" : "memory";

      // Only this chat's own history goes to the model.
      const history = chats[chatKey];
      const messages: ChatMessage[] = [];
      for (const turn of history) {
        messages.push({ role: "user", content: turn.question });
        messages.push({ role: "assistant", content: turn.progress.reply });
      }
      messages.push({ role: "user", content: text });

      const id = `${chatKey}-${history.length}-${Date.now()}`;
      setChats((prev) => ({
        ...prev,
        [chatKey]: [...prev[chatKey], { id, question: text, progress: EMPTY }],
      }));
      setDraft("");
      setBusy(true);

      const settle = (progress: Progress) =>
        setChats((prev) => ({
          ...prev,
          [chatKey]: prev[chatKey].map((turn) =>
            turn.id === id ? { ...turn, progress } : turn,
          ),
        }));

      try {
        const { progress } = await askCopper({ messages, useTools });
        for await (const update of readLive(progress)) settle(update);
      } catch {
        settle({
          steps: [],
          reply: "Sorry, I couldn't reach Copper just then. Please try again.",
          status: "error",
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, chats, useTools],
  );

  return (
    <>
      <Button
        data-testid="ask-copper-launcher"
        aria-label="Ask Copper"
        onClick={() => setOpen(true)}
        size="lg"
        className="fixed right-4 bottom-4 z-40 shadow-lg"
      >
        <MessageCircleIcon />
        Ask Copper
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          data-testid="ask-copper"
          side="right"
          className="w-full gap-0 p-0 data-[side=right]:w-full sm:max-w-md"
        >
          <SheetHeader className="bg-chart-2 text-background gap-0 p-0">
            <div className="flex items-center gap-2.5 px-4 py-3">
              <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full">
                <MessageCircleIcon className="size-4" />
              </span>
              <div className="min-w-0">
                <SheetTitle className="text-background">Ask Copper</SheetTitle>
                <SheetDescription className="text-background/70 text-xs">
                  Prices, totals and stock, checked with tools.
                </SheetDescription>
              </div>
            </div>
            {aiConfigured && (
              <div className="bg-background/10 flex items-center gap-2 px-4 py-2">
                <span className="text-xs font-medium">Use tools</span>
                <span className="text-background/60 text-[11px]">
                  {useTools ? "Checks every answer" : "Model guesses alone"}
                </span>
                <Switch
                  aria-label="Use tools"
                  checked={useTools}
                  onCheckedChange={(checked) => setUseTools(Boolean(checked))}
                  className="ml-auto"
                />
              </div>
            )}
          </SheetHeader>

          <div className="bg-secondary flex-1 overflow-y-auto p-4">
            {!aiConfigured ? (
              <SetupRequired service="ai" />
            ) : (
              <div className="space-y-5">
                {turns.map((turn) => (
                  <div key={turn.id} className="space-y-2.5">
                    <div className="flex justify-end">
                      <p className="bg-primary text-primary-foreground max-w-[85%] rounded-xl rounded-br-sm px-3 py-2 text-sm">
                        {turn.question}
                      </p>
                    </div>
                    <AnswerTrail progress={turn.progress} toolsOn={useTools} />
                    {turn.progress.reply && (
                      <div className="bg-background rounded-xl rounded-tl-sm border p-3">
                        <p className="text-primary mb-1 text-[11px] font-semibold">
                          Copper
                        </p>
                        {!useTools && (
                          <div className="border-chart-3 bg-chart-3/10 mb-2 rounded-md border p-2">
                            <p className="flex items-center gap-1.5 text-xs font-semibold">
                              <TriangleAlertIcon className="size-3.5 shrink-0" />
                              Answered without tools: may be made up
                            </p>
                            <p className="text-muted-foreground mt-1 text-[11px]">
                              With tools off, Copper can&apos;t see today&apos;s
                              prices or stock. The AI only has what it learned
                              in training, so it fills the gaps with guesses
                              that sound right. That&apos;s a hallucination.
                            </p>
                          </div>
                        )}
                        <p className="text-sm whitespace-pre-wrap">
                          {turn.progress.reply}
                          {turn.progress.status === "working" && (
                            <span className="bg-primary ml-0.5 inline-block h-4 w-px animate-pulse align-middle" />
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                ))}

                {/* The starters stay on offer after every answer. */}
                {!busy && (
                  <div className="space-y-1.5">
                    <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
                      {turns.length === 0 ? "Try one of these" : "Ask another"}
                    </p>
                    {STARTERS.map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        onClick={() => void send(starter)}
                        className="bg-background hover:border-primary w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                )}
                <div ref={bottom} />
              </div>
            )}
          </div>

          {aiConfigured && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send(draft);
              }}
              className="bg-background flex items-center gap-2 border-t p-3"
            >
              <Input
                aria-label="Your question"
                placeholder="Ask about products, prices or stock"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="rounded-full"
              />
              <Button
                type="submit"
                aria-label="Send"
                size="icon"
                className="shrink-0 rounded-full"
              >
                <ArrowUpIcon />
              </Button>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
