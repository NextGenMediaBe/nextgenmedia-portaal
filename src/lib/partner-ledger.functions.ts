import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Alleen admins mogen deze actie uitvoeren");
}

const LedgerKind = z.enum([
  "payout_owed",
  "commission_owed",
  "service_billed",
  "manual_credit",
  "manual_debit",
  "settlement",
]);

// ============== ADMIN ==============
export const adminGetPartnerFinance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ freelancerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const [{ data: partner }, { data: entries }, { data: settlements }] = await Promise.all([
      supabaseAdmin.from("freelancers").select("*").eq("id", data.freelancerId).single(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabaseAdmin.from("partner_ledger_entries") as any)
        .select("*, clients(company_name)")
        .eq("freelancer_id", data.freelancerId)
        .order("occurred_on", { ascending: false }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabaseAdmin.from("partner_settlements") as any)
        .select("*")
        .eq("freelancer_id", data.freelancerId)
        .order("period_end", { ascending: false }),
    ]);
    return {
      partner,
      entries: entries ?? [],
      settlements: settlements ?? [],
      balance: computeBalance(entries ?? []),
    };
  });

export const adminListPartnersWithBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: partners } = await supabaseAdmin
      .from("freelancers")
      .select("id, full_name, company_name, email, status, default_commission_pct, iban")
      .order("full_name");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: entries } = await (supabaseAdmin.from("partner_ledger_entries") as any)
      .select("freelancer_id, amount, status")
      .eq("status", "pending");
    const balances = new Map<string, number>();
    for (const e of (entries ?? []) as Array<{ freelancer_id: string; amount: number }>) {
      balances.set(e.freelancer_id, (balances.get(e.freelancer_id) ?? 0) + Number(e.amount));
    }
    return {
      partners: (partners ?? []).map((p) => ({ ...p, open_balance: balances.get(p.id) ?? 0 })),
    };
  });

const CreateEntrySchema = z.object({
  freelancer_id: z.string().uuid(),
  kind: LedgerKind,
  amount: z.number(), // positive = we owe partner, negative = partner owes us
  description: z.string().max(500).optional().or(z.literal("")),
  client_id: z.string().uuid().nullable().optional(),
  assignment_id: z.string().uuid().nullable().optional(),
  occurred_on: z.string().optional(),
});

export const adminCreateLedgerEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateEntrySchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("partner_ledger_entries") as any).insert({
      freelancer_id: data.freelancer_id,
      kind: data.kind,
      amount: data.amount,
      description: data.description || null,
      client_id: data.client_id || null,
      assignment_id: data.assignment_id || null,
      occurred_on: data.occurred_on || new Date().toISOString().slice(0, 10),
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteLedgerEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("partner_ledger_entries") as any)
      .delete()
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SettlementSchema = z.object({
  freelancer_id: z.string().uuid(),
  period_start: z.string(),
  period_end: z.string(),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export const adminGenerateSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SettlementSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: entries, error: e1 } = await (supabaseAdmin.from("partner_ledger_entries") as any)
      .select("id, amount")
      .eq("freelancer_id", data.freelancer_id)
      .eq("status", "pending")
      .gte("occurred_on", data.period_start)
      .lte("occurred_on", data.period_end);
    if (e1) throw new Error(e1.message);

    let owedToPartner = 0;
    let owedByPartner = 0;
    for (const e of (entries ?? []) as Array<{ amount: number }>) {
      const a = Number(e.amount);
      if (a >= 0) owedToPartner += a;
      else owedByPartner += -a;
    }
    const net = owedToPartner - owedByPartner;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: settlement, error: e2 } = await (supabaseAdmin.from("partner_settlements") as any)
      .insert({
        freelancer_id: data.freelancer_id,
        period_start: data.period_start,
        period_end: data.period_end,
        total_owed_to_partner: owedToPartner,
        total_owed_by_partner: owedByPartner,
        net_amount: net,
        notes: data.notes || null,
        status: "finalized",
        finalized_at: new Date().toISOString(),
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (e2) throw new Error(e2.message);

    const ids = ((entries ?? []) as Array<{ id: string }>).map((e) => e.id);
    if (ids.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin.from("partner_ledger_entries") as any)
        .update({ status: "settled", settlement_id: settlement.id })
        .in("id", ids);
    }
    return { id: settlement.id, net, owedToPartner, owedByPartner, count: ids.length };
  });

export const adminMarkSettlementPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("partner_settlements") as any)
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============== PARTNER PORTAL ==============
export const myPartnerFinance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: fl } = await supabaseAdmin
      .from("freelancers")
      .select("id, full_name, company_name, iban, default_commission_pct")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!fl) return { partner: null, entries: [], settlements: [], balance: 0 };
    const [{ data: entries }, { data: settlements }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabaseAdmin.from("partner_ledger_entries") as any)
        .select("*")
        .eq("freelancer_id", fl.id)
        .order("occurred_on", { ascending: false }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabaseAdmin.from("partner_settlements") as any)
        .select("*")
        .eq("freelancer_id", fl.id)
        .order("period_end", { ascending: false }),
    ]);
    return {
      partner: fl,
      entries: entries ?? [],
      settlements: settlements ?? [],
      balance: computeBalance(entries ?? []),
    };
  });

function computeBalance(entries: Array<{ amount: number; status: string }>): number {
  return entries
    .filter((e) => e.status === "pending")
    .reduce((s, e) => s + Number(e.amount), 0);
}
