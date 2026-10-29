"use client";

// Module 2: one tool call, drawn as a round trip. The left half is what the
// model asked for; the right half is what our own code handed back. The card
// is always open, because the whole point is to see it without clicking.
// Described in specs/module-2/spec.md section 5.
import { format, parseISO } from "date-fns";
import { Loader2Icon } from "lucide-react";
import { TOOL_LABELS, type ToolStep } from "@/lib/copper/assistant/progress";
import { formatUsd } from "@/lib/copper/catalog";

// The tools hand back plain data. Their types live in tools.ts, which reads
// the stock list and so can't be imported into a client component, so the
// shapes the card draws are named again here.
type CostLine = { item: string; usd: number };
type CostOutput = { lines: CostLine[]; totalUsd: number };
type ProductsOutput = {
  products: {
    id: string;
    name: string;
    type: string;
    priceUsd: number;
    colors: string[];
  }[];
};
type PricesOutput = {
  products: { id: string; name: string; priceUsd: number }[];
  plans: { id: string; name: string; monthlyUsd: number; annualUsd: number }[];
};
type StockOutput =
  | {
      status: "ok";
      product: string;
      colors: { color: string; stock: string; restockDate: string | null }[];
    }
  | { status: "not_a_color"; product: string; color: string; colors: string[] }
  | { status: "unavailable"; message: string };

/** "copper-home" as the catalog spells it, for the input list. */
function pretty(id: string): string {
  return id
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** "2026-11-14" as a shopper would read it. */
function readableDate(date: string): string {
  try {
    return format(parseISO(date), "MMM d, yyyy");
  } catch {
    return date;
  }
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="text-muted-foreground w-20 shrink-0">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}

/** → WHAT COPPER SENT: the model's input, as a labelled list, never raw JSON. */
function Sent({ name, input }: { name: string; input: unknown }) {
  if (name === "get_products")
    return <p className="text-sm">Nothing, it just asked what Copper sells</p>;
  if (name === "get_prices")
    return <p className="text-sm">Nothing, it just asked for the price list</p>;

  const sent = (input ?? {}) as Record<string, unknown>;
  if (name === "calculate_cost") {
    const products = Array.isArray(sent.products)
      ? (sent.products as string[])
      : [];
    return (
      <div className="space-y-1">
        <Row label="Products">
          {products.length ? products.map(pretty).join(", ") : "None"}
        </Row>
        <Row label="Plan">{pretty(String(sent.plan ?? ""))}</Row>
        <Row label="Billing">{String(sent.billing ?? "")}</Row>
        <Row label="Years">{String(sent.years ?? "")}</Row>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Row label="Product">{pretty(String(sent.product ?? ""))}</Row>
      <Row label="Color">{String(sent.color ?? "Every color")}</Row>
    </div>
  );
}

/** The coloured pill for one color's stock. */
function StockPill({
  stock,
  restockDate,
}: {
  stock: string;
  restockDate: string | null;
}) {
  if (stock === "backordered")
    return (
      <span className="bg-chart-3 rounded-full px-2 py-0.5 text-xs font-medium text-white">
        Back-ordered{restockDate ? ` until ${readableDate(restockDate)}` : ""}
      </span>
    );
  if (stock === "low_stock")
    return (
      <span className="bg-chart-4 text-foreground rounded-full px-2 py-0.5 text-xs font-medium">
        Low stock
      </span>
    );
  return (
    <span className="bg-accent rounded-full px-2 py-0.5 text-xs font-medium text-white">
      In stock
    </span>
  );
}

/** ← WHAT CAME BACK: the result our own code worked out. */
function CameBack({ name, output }: { name: string; output: unknown }) {
  if (name === "calculate_cost") {
    const { lines = [], totalUsd = 0 } = (output ?? {}) as CostOutput;
    return (
      <div className="space-y-1">
        {lines.map((line, i) => (
          <div key={i} className="flex justify-between gap-3 text-sm">
            <span>{line.item}</span>
            <span className="font-mono">{formatUsd(line.usd)}</span>
          </div>
        ))}
        <div className="flex justify-between gap-3 border-t pt-1">
          <span className="font-medium">Total</span>
          <span className="text-primary font-mono text-lg font-bold">
            {formatUsd(totalUsd)}
          </span>
        </div>
      </div>
    );
  }

  if (name === "get_products") {
    const { products = [] } = (output ?? {}) as ProductsOutput;
    return (
      <div className="space-y-3">
        {products.map((product) => (
          <div key={product.id}>
            <div className="flex justify-between gap-3 text-sm">
              <span className="font-medium">{product.name}</span>
              <span className="font-mono">{formatUsd(product.priceUsd)}</span>
            </div>
            <p className="text-muted-foreground text-xs">{product.type}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {product.colors.map((color) => (
                <span
                  key={color}
                  className="bg-accent/15 text-accent rounded-full px-2 py-0.5 text-xs"
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

  if (name === "get_prices") {
    const { products = [], plans = [] } = (output ?? {}) as PricesOutput;
    return (
      <div className="space-y-1">
        {products.map((product) => (
          <div key={product.id} className="flex justify-between gap-3 text-sm">
            <span>{product.name}</span>
            <span className="font-mono">{formatUsd(product.priceUsd)}</span>
          </div>
        ))}
        {plans
          .filter((plan) => plan.monthlyUsd > 0 || plan.annualUsd > 0)
          .map((plan) => (
            <div key={plan.id} className="flex justify-between gap-3 text-sm">
              <span>{plan.name}</span>
              <span className="font-mono">
                {formatUsd(plan.monthlyUsd)}/mo · {formatUsd(plan.annualUsd)}/yr
              </span>
            </div>
          ))}
      </div>
    );
  }

  const stock = (output ?? {}) as StockOutput;
  if (stock.status === "not_a_color")
    return (
      <p className="text-sm">
        {stock.product} doesn&apos;t come in {stock.color}. It comes in{" "}
        {stock.colors.join(", ")}.
      </p>
    );
  if (stock.status === "unavailable")
    return <p className="text-sm">{stock.message}</p>;
  return (
    <div className="space-y-1">
      {(stock.colors ?? []).map((row) => (
        <div
          key={row.color}
          className="flex items-center justify-between gap-3 text-sm"
        >
          <span>{row.color}</span>
          <StockPill stock={row.stock} restockDate={row.restockDate} />
        </div>
      ))}
    </div>
  );
}

/** One tool call: the header strip, what Copper sent, and what came back. */
export function ToolCallCard({
  step,
  index,
}: {
  step: ToolStep;
  index: number;
}) {
  const running = step.state === "calling";
  return (
    <div
      data-testid="tool-call"
      data-tool={step.name}
      className="bg-background overflow-hidden rounded-lg border"
    >
      <div className="bg-accent flex flex-wrap items-center gap-2 px-3 py-2 text-white">
        <span className="font-mono text-sm font-bold">{step.name}()</span>
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs">
          tool {index}
        </span>
        <span className="ml-auto text-xs">
          {TOOL_LABELS[step.name] ?? "Using a tool"}
        </span>
      </div>

      <div className="space-y-1 px-3 py-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          → What Copper sent
        </p>
        {step.input === undefined ? (
          <p className="text-muted-foreground text-sm italic">
            filling in the details…
          </p>
        ) : (
          <Sent name={step.name} input={step.input} />
        )}
      </div>

      <div className="bg-accent/10 space-y-1 border-t px-3 py-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          ← What came back
        </p>
        {running ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm italic">
            <Loader2Icon className="size-3 animate-spin" />
            the app is running the code…
          </p>
        ) : step.state === "error" ? (
          <p className="text-chart-3 text-sm">
            {String(step.output ?? "The tool failed.")}
          </p>
        ) : (
          <CameBack name={step.name} output={step.output} />
        )}
      </div>
    </div>
  );
}
