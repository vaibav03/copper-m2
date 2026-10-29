// Module 2: the four tools Ask Copper can use. Products and prices come from
// lib/copper/catalog.ts and stock from lib/copper/inventory.ts, so the
// chatbot never has to make them up.
// The contract for each tool is in specs/module-2/spec.md.
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  getPlans,
  getProducts,
  type Plan,
  type ProductId,
} from "@/lib/copper/catalog";
import { readInventory } from "@/lib/copper/inventory";

export type ProductList = {
  products: {
    id: ProductId;
    name: string;
    type: string;
    priceUsd: number;
    colors: string[];
  }[];
};

export type Prices = {
  products: { id: ProductId; name: string; priceUsd: number }[];
  plans: {
    id: Plan["id"];
    name: string;
    monthlyUsd: number;
    annualUsd: number;
  }[];
};

export type CalculateCostInput = {
  products: ProductId[];
  plan: Plan["id"];
  billing: "monthly" | "annual";
  years: number;
};

export type CostBreakdown = {
  lines: { item: string; usd: number }[];
  totalUsd: number;
};

export type CheckAvailabilityInput = { product: ProductId; color?: string };

export type Stock = "in_stock" | "low_stock" | "backordered";

export type Availability =
  | {
      status: "ok";
      product: string;
      colors: { color: string; stock: Stock; restockDate: string | null }[];
    }
  | { status: "not_a_color"; product: string; color: string; colors: string[] }
  | { status: "unavailable"; message: string };

/** Money is only ever accurate to the cent, so every line is rounded there. */
function toCents(usd: number): number {
  return Math.round(usd * 100) / 100;
}

/** get_products: what Copper sells and which colors each one comes in. */
export function listProducts(): ProductList {
  return {
    products: getProducts().map(({ id, name, type, priceUsd, colors }) => ({
      id,
      name,
      type,
      priceUsd,
      colors,
    })),
  };
}

/** get_prices: every product and plan price, read from the catalog. */
export function getPrices(): Prices {
  return {
    products: getProducts().map(({ id, name, priceUsd }) => ({
      id,
      name,
      priceUsd,
    })),
    plans: getPlans().map(({ id, name, monthlyUsd, annualUsd }) => ({
      id,
      name,
      monthlyUsd,
      annualUsd,
    })),
  };
}

const productId = z.enum(["copper-home", "copper-notes"]);

export const calculateCostInput: z.ZodType<CalculateCostInput> = z.object({
  products: z
    .array(productId)
    .max(5)
    .describe(
      "The devices being bought, up to 5. The same one may appear twice.",
    ),
  plan: z
    .enum(["free", "copper-plus"])
    .describe("Which plan the shopper wants."),
  billing: z.enum(["monthly", "annual"]).describe("How the plan is paid for."),
  years: z
    .number()
    .int()
    .min(1)
    .max(5)
    .describe("Whole years to cost out, 1 to 5."),
});

/** calculate_cost: the total cost of devices plus a plan over some years. */
export function calculateCost(input: CalculateCostInput): CostBreakdown {
  const catalog = getProducts();
  const lines: CostBreakdown["lines"] = [];

  // Each device is paid for once, so one line per device in the list.
  for (const id of input.products) {
    const product = catalog.find((candidate) => candidate.id === id);
    if (product)
      lines.push({ item: product.name, usd: toCents(product.priceUsd) });
  }

  // Copper Plus covers the whole household, so it is counted once however many
  // devices there are. The free plan costs nothing, so it adds no line at all.
  const plan = getPlans().find((candidate) => candidate.id === input.plan);
  if (plan && input.plan !== "free") {
    const usd =
      input.billing === "monthly"
        ? plan.monthlyUsd * 12 * input.years
        : plan.annualUsd * input.years;
    const years = `${input.years} year${input.years === 1 ? "" : "s"}`;
    lines.push({
      item: `${plan.name}, ${input.billing}, ${years}`,
      usd: toCents(usd),
    });
  }

  return {
    lines,
    totalUsd: toCents(lines.reduce((sum, line) => sum + line.usd, 0)),
  };
}

export const checkAvailabilityInput: z.ZodType<CheckAvailabilityInput> =
  z.object({
    product: productId.describe("Which Copper product to check."),
    color: z
      .string()
      .optional()
      .describe(
        "One color to check, in any capitalization. Leave out for every color.",
      ),
  });

/** Which of the three stock answers a row's units count earns. */
function stockOf(units: number, nextShipment: string) {
  if (units === 0)
    return { stock: "backordered" as const, restockDate: nextShipment };
  if (units < 10) return { stock: "low_stock" as const, restockDate: null };
  return { stock: "in_stock" as const, restockDate: null };
}

/** check_availability: stock for one product (or one of its colors), read fresh each time. */
export async function checkAvailability(
  input: CheckAvailabilityInput,
): Promise<Availability> {
  const product = getProducts().find(
    (candidate) => candidate.id === input.product,
  )!;

  // The catalog decides which colors exist, so check that before reading
  // stock: a color the product doesn't come in is never "out of stock", even
  // when the stock list is down.
  let colors = product.colors;
  if (input.color !== undefined) {
    const asked = input.color.trim().toLowerCase();
    const known = product.colors.find((color) => color.toLowerCase() === asked);
    if (!known) {
      return {
        status: "not_a_color",
        product: product.name,
        color: input.color,
        colors: product.colors,
      };
    }
    colors = [known];
  }

  // Stock changes every day, so this reads the list on every single call.
  const rows = await readInventory();
  if (!rows) {
    return {
      status: "unavailable",
      message:
        "I can't reach the stock list right now, so I'd rather not guess. Try again in a moment, or ask the Copper Crew.",
    };
  }

  // A stock row names the product the way the catalog does ("Copper Notes"),
  // not by its id. A color with no row at all is simply left out.
  return {
    status: "ok",
    product: product.name,
    colors: colors.flatMap((color) => {
      const row = rows.find(
        (candidate) =>
          candidate.product === product.name && candidate.color === color,
      );
      return row
        ? [{ color, ...stockOf(row.units_in_stock, row.next_shipment) }]
        : [];
    }),
  };
}

/** The menu of tools the model is handed. It picks; this code answers. */
export const copperTools: ToolSet = {
  get_products: tool({
    description:
      "List every Copper product with its type, price and the colors it comes in. Use this for what Copper sells and what colors a product comes in, which is not the same as what is in stock today.",
    inputSchema: z.object({}),
    execute: async () => listProducts(),
  }),
  get_prices: tool({
    description:
      "Look up the current price of every Copper product and every plan, monthly and annual.",
    inputSchema: z.object({}),
    execute: async () => getPrices(),
  }),
  calculate_cost: tool({
    description:
      "Work out the total cost of some devices plus a plan over a number of years, itemized line by line.",
    inputSchema: calculateCostInput,
    execute: async (input) => calculateCost(input),
  }),
  check_availability: tool({
    description:
      "Check today's stock for a product, or for one of its colors: in stock, low stock, or back-ordered with the next shipment date.",
    inputSchema: checkAvailabilityInput,
    execute: async (input) => checkAvailability(input),
  }),
};
