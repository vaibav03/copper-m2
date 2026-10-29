// How many of each product color are on the shelf, and when the next shipment
// lands (Product Bible Section 10). Stock changes, so check_availability reads
// it fresh every time instead of remembering it.
// This is the only file that knows where stock is kept. Module 2 part 2 moved
// it out of a JSON file and into a Supabase table, and nothing else changed:
// a warehouse update is now a row edit, not a commit and a deploy.
import { createStatelessClient } from "@/lib/supabase/server";

/** One row of stock, named like the database columns it comes from. */
export type InventoryRow = {
  sku: string;
  product: string;
  color: string;
  units_in_stock: number;
  next_shipment: string;
};

/** Every stock row, or `null` when stock can't be read right now. */
export async function readInventory(): Promise<InventoryRow[] | null> {
  // No Supabase set up yet: say so rather than guess. check_availability
  // turns this into "I can't check stock right now".
  const supabase = createStatelessClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("inventory")
      .select("sku, product, color, units_in_stock, next_shipment")
      .order("sku");
    if (error || !data) return null;
    return data as InventoryRow[];
  } catch {
    // The table is missing, the key is wrong, or the network is down.
    return null;
  }
}
