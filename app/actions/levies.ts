"use server";

import { requireRole, requireNotDemo } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";
import { getActiveBuilding } from "@/lib/building-context";
import { buildInstanceRow, currentMonthParts, type LevyTemplate } from "@/lib/levies-recurring";
import { revalidatePath } from "next/cache";

export type LevyInput = {
  name: string;
  description?: string | null;
  total_cost: number;
  fund_contribution: number;
  is_recurring: boolean;
  due_date: string;
};

export async function createLevy(input: LevyInput) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  const total_cost = Number(input.total_cost);
  const fund_contribution = Number(input.fund_contribution);

  if (!input.name?.trim()) throw new Error("Levy name is required");
  if (!Number.isFinite(total_cost) || total_cost <= 0)
    throw new Error("Total cost must be a positive number");
  if (!Number.isFinite(fund_contribution) || fund_contribution < 0)
    throw new Error("Fund contribution must be a non-negative number");
  if (fund_contribution > total_cost)
    throw new Error("Fund contribution cannot exceed total cost");
  if (!input.due_date) throw new Error("Due date is required");
  const parsedDate = new Date(input.due_date);
  if (isNaN(parsedDate.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(input.due_date))
    throw new Error("Due date must be a valid date (YYYY-MM-DD)");

  const supabase = await createClient();
  const name = input.name.trim();
  const description = input.description?.trim() ?? null;

  // ── One-time levy: a single draft, distributed once ──────────────────────
  if (!input.is_recurring) {
    const { data, error } = await supabase
      .from("bms_levies")
      .insert({
        building_id: buildingId,
        name,
        description,
        total_cost,
        fund_contribution,
        is_recurring: false,
        recurrence_day: null,
        due_date: input.due_date,
        status: "draft",
        created_by: user.id,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await writeAuditLog({
      actor_id: user.id,
      actor_email: user.email,
      actor_role: profile.role,
      building_id: buildingId,
      action: "levy.create",
      entity: "levy",
      entity_id: data.id,
      meta: { name, total_cost, fund_contribution, frequency: "one_time" },
    });

    revalidatePath("/admin/levies");
    return data;
  }

  // ── Monthly recurring: create a template, then this month's first draft ──
  const { data: template, error: tErr } = await supabase
    .from("bms_levies")
    .insert({
      building_id: buildingId,
      name,
      description,
      total_cost,
      fund_contribution,
      is_recurring: true,
      recurrence_day: null,
      due_date: input.due_date,
      status: "template",
      is_active: true,
      created_by: user.id,
    })
    .select("id, building_id, name, description, total_cost, fund_contribution, due_date")
    .single();
  if (tErr) throw new Error(tErr.message);

  const { year, month0 } = currentMonthParts();
  // First instance uses the exact due date the admin picked.
  const { data: instance, error: iErr } = await supabase
    .from("bms_levies")
    .insert({
      ...buildInstanceRow(template as LevyTemplate, year, month0, input.due_date),
      created_by: user.id,
    })
    .select()
    .single();
  if (iErr) throw new Error(iErr.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "levy.create",
    entity: "levy",
    entity_id: template.id,
    meta: { name, total_cost, fund_contribution, frequency: "monthly" },
  });

  revalidatePath("/admin/levies");
  return instance;
}

export async function setLevyActive(id: string, isActive: boolean) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  const supabase = await createClient();
  const { data: tmpl, error } = await supabase
    .from("bms_levies")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("building_id", buildingId)
    .eq("status", "template")
    .select("id, name")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!tmpl) throw new Error("Recurring levy not found.");

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: isActive ? "levy.recurring.activate" : "levy.recurring.deactivate",
    entity: "levy",
    entity_id: id,
    meta: { name: tmpl.name },
  });

  revalidatePath("/admin/levies");
  revalidatePath(`/admin/levies/${id}`);
}

export async function distributeLevy(id: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  const supabase = await createClient();

  // Check residents BEFORE flipping status so the levy can't get stuck
  // as "distributed" with no charges if the building has no active residents.
  const { data: residents, error: resErr } = await supabase
    .from("bms_residents")
    .select("id, flat_id")
    .eq("building_id", buildingId)
    .eq("is_active", true);
  if (resErr) throw new Error(resErr.message);
  if (!residents || residents.length === 0)
    throw new Error("No active residents found. Cannot distribute levy.");

  // Atomically flip status draft → distributed; only one concurrent caller wins.
  // If another request already distributed, .maybeSingle() returns null.
  const { data: levy, error: flipErr } = await supabase
    .from("bms_levies")
    .update({
      status: "distributed",
      distributed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("building_id", buildingId)
    .eq("status", "draft")
    .select("id, name, total_cost, fund_contribution, due_date")
    .maybeSingle();
  if (flipErr) throw new Error(flipErr.message);
  if (!levy)
    throw new Error(
      "Levy could not be distributed. It may already be distributed or was not found.",
    );

  const residentCount = residents.length;
  const residentShareTotal =
    Number(levy.total_cost) - Number(levy.fund_contribution);
  const perResident =
    residentShareTotal > 0
      ? Math.round((residentShareTotal / residentCount) * 100) / 100
      : 0;
  // Absorb rounding residual back into fund_contribution so ledger balances exactly
  const residual =
    residentShareTotal > 0
      ? Math.round(
          (residentShareTotal - perResident * residentCount) * 100,
        ) / 100
      : 0;

  if (perResident > 0) {
    const charges = residents.map((r) => ({
      building_id: buildingId,
      levy_id: id,
      resident_id: r.id,
      flat_id: r.flat_id,
      amount: perResident,
      due_date: levy.due_date,
      status: "pending" as const,
    }));
    // UNIQUE(levy_id, resident_id) constraint is a DB-level backstop against duplicate inserts
    const { error: chargesErr } = await supabase
      .from("bms_levy_charges")
      .insert(charges);
    if (chargesErr) throw new Error(chargesErr.message);
  }

  // Set per_resident_amount, resident_count, and absorb rounding residual into fund_contribution
  const { error: updateErr } = await supabase
    .from("bms_levies")
    .update({
      per_resident_amount: perResident,
      resident_count: residentCount,
      fund_contribution: Number(levy.fund_contribution) + residual,
    })
    .eq("id", id)
    .eq("building_id", buildingId);
  if (updateErr) throw new Error(updateErr.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "levy.distribute",
    entity: "levy",
    entity_id: id,
    meta: { resident_count: residentCount, per_resident: perResident, residual },
  });

  revalidatePath("/admin/levies");
  revalidatePath(`/admin/levies/${id}`);
  revalidatePath("/resident/dues");
}

export async function markLevyChargePaid(chargeId: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  const supabase = await createClient();
  const { data: charge, error: fetchErr } = await supabase
    .from("bms_levy_charges")
    .select("id, levy_id, status")
    .eq("id", chargeId)
    .eq("building_id", buildingId)
    .single();
  if (fetchErr || !charge) throw new Error("Charge not found.");
  if (charge.status === "paid") throw new Error("This charge is already marked paid.");
  if (charge.status === "waived")
    throw new Error("Cannot mark a waived charge as paid.");

  const { error } = await supabase
    .from("bms_levy_charges")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", chargeId)
    .eq("building_id", buildingId);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "levy.charge.paid",
    entity: "levy_charge",
    entity_id: chargeId,
    meta: { levy_id: charge.levy_id },
  });

  revalidatePath(`/admin/levies/${charge.levy_id}`);
}

export async function waiveLevyCharge(chargeId: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  const supabase = await createClient();
  const { data: charge, error: fetchErr } = await supabase
    .from("bms_levy_charges")
    .select("id, levy_id, status")
    .eq("id", chargeId)
    .eq("building_id", buildingId)
    .single();
  if (fetchErr || !charge) throw new Error("Charge not found.");
  if (charge.status !== "pending") {
    throw new Error(
      charge.status === "paid"
        ? "Cannot waive a paid charge."
        : "This charge is already waived.",
    );
  }

  const { error } = await supabase
    .from("bms_levy_charges")
    .update({ status: "waived" })
    .eq("id", chargeId)
    .eq("building_id", buildingId);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "levy.charge.waived",
    entity: "levy_charge",
    entity_id: chargeId,
    meta: { levy_id: charge.levy_id },
  });

  revalidatePath(`/admin/levies/${charge.levy_id}`);
}

export async function cancelLevy(id: string) {
  await requireNotDemo();
  const { profile, user } = await requireRole(["admin"]);
  const buildingId = await getActiveBuilding();
  if (!buildingId) throw new Error("No active building selected.");

  const supabase = await createClient();
  const { data: levy, error: levyErr } = await supabase
    .from("bms_levies")
    .select("status, name")
    .eq("id", id)
    .eq("building_id", buildingId)
    .single();
  if (levyErr || !levy) throw new Error(levyErr?.message ?? "Levy not found.");
  if (levy.status === "template")
    throw new Error(
      "This is a recurring levy. Turn it off with the Active switch instead.",
    );
  if (levy.status === "distributed")
    throw new Error(
      "Cannot cancel a distributed levy. Mark individual charges as waived instead.",
    );
  if (levy.status === "cancelled") throw new Error("Levy is already cancelled.");

  const { error } = await supabase
    .from("bms_levies")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("building_id", buildingId);
  if (error) throw new Error(error.message);

  await writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    actor_role: profile.role,
    building_id: buildingId,
    action: "levy.cancel",
    entity: "levy",
    entity_id: id,
    meta: { name: levy.name },
  });

  revalidatePath("/admin/levies");
  revalidatePath(`/admin/levies/${id}`);
}
