// Module 2: the four tools Ask Copper can use. Products and prices come from
// lib/copper/catalog.ts and stock from lib/copper/inventory.ts, so the
// chatbot never has to make them up.
// The contract for each tool is in specs/module-2/spec.md.
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { getPlans, getProducts, type Plan, type ProductId } from "@/lib/copper/catalog";
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
  plans: { id: Plan["id"]; name: string; monthlyUsd: number; annualUsd: number }[];
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

/** The two things Copper sells. Anything else is outside every tool's contract. */
const PRODUCT_IDS = ["copper-home", "copper-notes"] as const;

/** Money is only ever accurate to cents, so every line and total is rounded. */
function toCents(amount: number): number {
  return Math.round(amount * 100) / 100;
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

/** The rules for calculate_cost's input: anything outside them is refused. */
export const calculateCostInput = z.object({
  products: z.array(z.enum(PRODUCT_IDS)).max(5),
  plan: z.enum(["free", "copper-plus"]),
  billing: z.enum(["monthly", "annual"]),
  years: z.number().int().min(1).max(5),
});

/** calculate_cost: the total cost of devices plus a plan over some years. */
export function calculateCost(input: CalculateCostInput): CostBreakdown {
  const products = getProducts();
  const lines: CostBreakdown["lines"] = [];

  // Each device is paid for once, so one line per device in the list.
  for (const id of input.products) {
    const product = products.find((candidate) => candidate.id === id);
    if (product) lines.push({ item: product.name, usd: toCents(product.priceUsd) });
  }

  // Copper Plus covers the whole household, so it counts once however many
  // devices there are. The free plan costs nothing, so it adds no line.
  const plan = getPlans().find((candidate) => candidate.id === input.plan);
  if (plan && plan.id !== "free") {
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
    totalUsd: toCents(lines.reduce((total, line) => total + line.usd, 0)),
  };
}

/** The rules for check_availability's input: a Copper product, and maybe a color. */
export const checkAvailabilityInput = z.object({
  product: z.enum(PRODUCT_IDS),
  color: z.string().optional(),
});

/** 0 units is back-ordered, 1 to 9 is low, 10 or more is in stock. */
function stockOf(units: number, nextShipment: string): {
  stock: Stock;
  restockDate: string | null;
} {
  if (units <= 0) return { stock: "backordered", restockDate: nextShipment };
  if (units < 10) return { stock: "low_stock", restockDate: null };
  return { stock: "in_stock", restockDate: null };
}

/** check_availability: stock for one product (or one of its colors), read fresh each time. */
export async function checkAvailability(
  input: CheckAvailabilityInput,
): Promise<Availability> {
  const product = getProducts().find(
    (candidate) => candidate.id === input.product,
  );
  if (!product) {
    return {
      status: "unavailable",
      message: "I don't know that product, so I can't look it up.",
    };
  }

  // Check the color against the catalog before reading stock: a color the
  // product never came in is never a stock problem.
  let onlyColor: string | undefined;
  if (input.color !== undefined) {
    const asked = input.color.trim().toLowerCase();
    onlyColor = product.colors.find((color) => color.toLowerCase() === asked);
    if (!onlyColor) {
      return {
        status: "not_a_color",
        product: product.name,
        color: input.color,
        colors: product.colors,
      };
    }
  }

  // Stock changes, so this reads the list every time rather than keeping it.
  const rows = await readInventory();
  if (!rows) {
    return {
      status: "unavailable",
      message:
        "I can't reach the shelf list right now, so I'd rather not guess. Try again in a moment, or ask the Copper Crew.",
    };
  }

  // A stock row names the product the way shoppers see it ("Copper Notes").
  const forProduct = rows.filter((row) => row.product === product.name);
  const colors = product.colors
    .filter((color) => onlyColor === undefined || color === onlyColor)
    .map((color) => {
      const row = forProduct.find(
        (candidate) => candidate.color.toLowerCase() === color.toLowerCase(),
      );
      // A color with no row isn't a guess we can make, so leave it out.
      if (!row) return null;
      return { color, ...stockOf(row.units_in_stock, row.next_shipment) };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return { status: "ok", product: product.name, colors };
}

/**
 * The menu the model picks from. Each description is how the model knows when
 * the tool is the right one, so it is written for the model, not the shopper.
 */
export const copperTools: ToolSet = {
  get_products: tool({
    description:
      "List every Copper product with its type, price and the colors it comes in. Use this for what Copper sells and which colors exist, never for whether a color is in stock today.",
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
      "Work out what some devices plus a plan cost in total over a number of years. Use this for every total instead of doing the arithmetic yourself.",
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
