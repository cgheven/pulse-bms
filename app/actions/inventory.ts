"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { getActiveBuilding } from "@/lib/building-context";
import { revalidatePath } from "next/cache";

export type InventoryCategory =
  | "cleaning"
  | "electrical"
  | "plumbing"
  | "safety"
  | "tools"
  | "maintenance"
  | "general";

export type InventoryUnit =
  | "pieces"
  | "litres"
  | "kg"
  | "meters"
  | "boxes"
  | "rolls"
  | "pairs"
  | "sets";

export type InventoryItem = {
  id: string;
  building_id: string;
  name: string;
  category: InventoryCategory;
  unit: InventoryUnit;
  current_stock: number;
  min_stock: number;
  unit_cost: number;
  location: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type InventoryTransaction = {
  id: string;
  building_id: string;
  item_id: string;
  type: "in" | "out" | "adjustment";
  quantity: number;
  unit_cost: number;
  reason: string | null;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
};

export type InventoryItemInput = {
  name: string;
  category: InventoryCategory;
  unit: InventoryUnit;
  current_stock: number;
  min_stock: number;
  unit_cost: number;
  location?: string;
  notes?: string;
};

export async function getInventoryItems() {
  const { profile } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) return { data: [], error: "No active building selected." };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bms_inventory_items")
    .select("*")
    .eq("building_id", buildingId)
    .eq("is_active", true)
    .order("name");

  if (error) return { data: [], error: error.message };
  return { data: data as InventoryItem[], error: null };
}

export async function getInventoryTransactions(itemId?: string) {
  const { profile } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) return { data: [], error: "No active building selected." };
  const supabase = await createClient();

  let query = supabase
    .from("bms_inventory_transactions")
    .select("*, bms_profiles!performed_by(full_name)")
    .eq("building_id", buildingId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (itemId) query = query.eq("item_id", itemId);

  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  return { data: data ?? [], error: null };
}

export async function getInventoryReport(from: string, to: string) {
  const { profile } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) return { items: [], transactions: [] };
  const supabase = await createClient();

  const [{ data: items }, { data: transactions }] = await Promise.all([
    supabase
      .from("bms_inventory_items")
      .select("*")
      .eq("building_id", buildingId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("bms_inventory_transactions")
      .select("*, bms_inventory_items!item_id(name, unit), bms_profiles!performed_by(full_name)")
      .eq("building_id", buildingId)
      .gte("created_at", from)
      .lte("created_at", to + "T23:59:59+05:00")
      .order("created_at", { ascending: false }),
  ]);

  return {
    items: (items ?? []) as InventoryItem[],
    transactions: (transactions ?? []) as unknown as (InventoryTransaction & {
      bms_inventory_items: { name: string; unit: string } | null;
      bms_profiles: { full_name: string } | null;
    })[],
  };
}

export async function createInventoryItem(input: InventoryItemInput) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("bms_inventory_items")
    .insert({
      building_id: buildingId,
      name: input.name.trim(),
      category: input.category,
      unit: input.unit,
      current_stock: input.current_stock,
      min_stock: input.min_stock,
      unit_cost: input.unit_cost,
      location: input.location?.trim() || null,
      notes: input.notes?.trim() || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  if (input.current_stock > 0) {
    await supabase.from("bms_inventory_transactions").insert({
      building_id: buildingId,
      item_id: data.id,
      type: "in",
      quantity: input.current_stock,
      unit_cost: input.unit_cost,
      reason: "Initial stock",
      performed_by: user.id,
    });

    // Auto-create expense entry so it flows into Day Book / Cash Position
    if (input.unit_cost > 0) {
      const totalCost = input.current_stock * input.unit_cost;
      const today = new Date().toISOString().slice(0, 10);
      const { error: expErr } = await supabase.from("bms_expenses").insert({
        building_id: buildingId,
        category: "supplies",
        subcategory: "inventory",
        description: `Inventory: ${input.name} (${input.current_stock} ${input.unit} @ Rs. ${input.unit_cost})`,
        amount: totalCost,
        expense_date: today,
        is_recurring: false,
        is_bill: false,
        bank_account_id: null,
        recorded_by: user.id,
      });
      if (expErr) throw new Error(`Failed to record expense: ${expErr.message}`);
    }
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "inventory.create",
    entity: "inventory_item",
    entity_id: data.id,
    meta: input as unknown as Record<string, unknown>,
  });

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/reports/inventory");
  if (input.current_stock > 0 && input.unit_cost > 0) {
    revalidatePath("/admin/reports/expenses");
    revalidatePath("/admin/reports/day-book");
    revalidatePath("/admin/reports/cash-position");
    revalidatePath("/admin/expenses");
  }
  return data;
}

export async function updateInventoryItem(
  id: string,
  input: Partial<InventoryItemInput>
) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.category !== undefined) patch.category = input.category;
  if (input.unit !== undefined) patch.unit = input.unit;
  if (input.min_stock !== undefined) patch.min_stock = input.min_stock;
  if (input.unit_cost !== undefined) patch.unit_cost = input.unit_cost;
  if (input.location !== undefined) patch.location = input.location?.trim() || null;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;

  const { data, error } = await supabase
    .from("bms_inventory_items")
    .update(patch)
    .eq("id", id)
    .eq("building_id", buildingId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "inventory.update",
    entity: "inventory_item",
    entity_id: id,
    meta: patch,
  });

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/reports/inventory");
  return data;
}

export async function deleteInventoryItem(id: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  const { error } = await supabase
    .from("bms_inventory_items")
    .update({ is_active: false })
    .eq("id", id)
    .eq("building_id", buildingId);

  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "inventory.delete",
    entity: "inventory_item",
    entity_id: id,
  });

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/reports/inventory");
}

export async function recordStockMovement(input: {
  item_id: string;
  type: "in" | "out" | "adjustment";
  quantity: number;
  unit_cost?: number;
  reason?: string;
  notes?: string;
}) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin", "super_admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");
  const supabase = await createClient();

  const { data: item, error: fetchErr } = await supabase
    .from("bms_inventory_items")
    .select("current_stock, unit_cost, unit, name")
    .eq("id", input.item_id)
    .eq("building_id", buildingId)
    .single();

  if (fetchErr || !item) throw new Error("Item not found");

  let newStock: number;
  if (input.type === "adjustment") {
    newStock = input.quantity;
  } else if (input.type === "in") {
    newStock = Number(item.current_stock) + input.quantity;
  } else {
    newStock = Number(item.current_stock) - input.quantity;
    if (newStock < 0) throw new Error("Insufficient stock");
  }

  const effectiveUnitCost = input.unit_cost ?? Number(item.unit_cost);
  // Adjustment records signed delta so history shows change, not absolute target
  const txQuantity = input.type === "adjustment"
    ? input.quantity - Number(item.current_stock)
    : input.quantity;

  const { error: txErr } = await supabase
    .from("bms_inventory_transactions")
    .insert({
      building_id: buildingId,
      item_id: input.item_id,
      type: input.type,
      quantity: txQuantity,
      unit_cost: effectiveUnitCost,
      reason: input.reason?.trim() || null,
      notes: input.notes?.trim() || null,
      performed_by: user.id,
    });

  if (txErr) throw new Error(txErr.message);

  const itemPatch: Record<string, unknown> = { current_stock: newStock };
  if (input.type === "in" && input.unit_cost !== undefined) {
    itemPatch.unit_cost = input.unit_cost;
  }

  // Atomic guard for "out": gte prevents negative stock under concurrent requests
  let updateQ = supabase
    .from("bms_inventory_items")
    .update(itemPatch)
    .eq("id", input.item_id)
    .eq("building_id", buildingId);
  if (input.type === "out") updateQ = updateQ.gte("current_stock", input.quantity);

  const { data: updateResult, error: updateErr } = await updateQ.select("id").maybeSingle();
  if (updateErr) throw new Error(updateErr.message);
  if (!updateResult) throw new Error("Insufficient stock");

  if (input.type === "in" && effectiveUnitCost > 0) {
    const totalCost = input.quantity * effectiveUnitCost;
    const today = new Date().toISOString().slice(0, 10);
    const { error: expErr } = await supabase.from("bms_expenses").insert({
      building_id: buildingId,
      category: "supplies",
      subcategory: "inventory",
      description: `Inventory: ${item.name} (${input.quantity} ${item.unit ?? "units"} @ Rs. ${effectiveUnitCost})`,
      amount: totalCost,
      expense_date: today,
      is_recurring: false,
      is_bill: false,
      bank_account_id: null,
      recorded_by: user.id,
    });
    if (expErr) throw new Error(`Failed to record expense: ${expErr.message}`);
  }

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: `inventory.stock_${input.type}`,
    entity: "inventory_item",
    entity_id: input.item_id,
    meta: { ...input, new_stock: newStock, item_name: item.name },
  });

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/reports/inventory");
  revalidatePath("/admin/reports/expenses");
  revalidatePath("/admin/reports/day-book");
  revalidatePath("/admin/reports/cash-position");
  revalidatePath("/admin/expenses");
}
