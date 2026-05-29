import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role")
    .eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Alleen admins mogen deze actie uitvoeren");
}

/**
 * Get the social-media service contract for a client (latest, any status).
 * The intake is stored on service_contracts.config.intake (free text).
 */
export const getSocialIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: sc } = await supabaseAdmin
      .from("service_contracts")
      .select("id, status, config")
      .eq("client_id", data.clientId)
      .eq("service_slug", "social-media")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sc) return { contract: null, intake: "", links: "", signed: false };
    const cfg = (sc.config ?? {}) as Record<string, unknown>;
    return {
      contract: { id: sc.id, status: sc.status },
      intake: typeof cfg.intake === "string" ? (cfg.intake as string) : "",
      links: typeof cfg.intake_links === "string" ? (cfg.intake_links as string) : "",
      signed: sc.status === "active",
    };
  });

export const saveSocialIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      serviceContractId: z.string().uuid(),
      intake: z.string().max(20000),
      links: z.string().max(5000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: sc } = await supabaseAdmin
      .from("service_contracts")
      .select("config")
      .eq("id", data.serviceContractId)
      .maybeSingle();
    const cfg = (sc?.config ?? {}) as Record<string, unknown>;
    const { error } = await supabaseAdmin
      .from("service_contracts")
      .update({ config: { ...cfg, intake: data.intake, intake_links: data.links ?? "", intake_completed_at: new Date().toISOString() } })
      .eq("id", data.serviceContractId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ───────── Shoots & intake meetings (production_tasks) ───────── */

const TaskKindEnum = z.enum(["intake", "shoot"]);

export const listClientTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: rows } = await supabaseAdmin
      .from("production_tasks")
      .select("id, type, title, notes, scheduled_for, status, created_at")
      .eq("client_id", data.clientId)
      .in("type", ["intake", "shoot"])
      .order("scheduled_for", { ascending: true });
    return { tasks: rows ?? [] };
  });

export const createClientTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      clientId: z.string().uuid(),
      type: TaskKindEnum,
      title: z.string().min(1).max(200),
      scheduled_for: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      notes: z.string().max(2000).optional().or(z.literal("")),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("production_tasks")
      .insert({
        client_id: data.clientId,
        type: data.type,
        title: data.title,
        notes: data.notes || null,
        scheduled_for: data.scheduled_for,
        status: "scheduled",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteClientTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("production_tasks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Client-side: list own upcoming intakes/shoots for portal dashboard. */
export const getMyUpcomingShoots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: client } = await supabaseAdmin
      .from("clients").select("id").eq("owner_user_id", context.userId).maybeSingle();
    if (!client) return { tasks: [] };
    const today = new Date().toISOString().slice(0, 10);
    const { data: rows } = await supabaseAdmin
      .from("production_tasks")
      .select("id, type, title, notes, scheduled_for, status")
      .eq("client_id", client.id)
      .in("type", ["intake", "shoot"])
      .gte("scheduled_for", today)
      .order("scheduled_for", { ascending: true });
    return { tasks: rows ?? [] };
  });
