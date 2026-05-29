import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const StatusEnum = z.enum(["draft", "ready_for_review", "approved", "changes_requested", "scheduled", "published"]);

const SocialContentSchema = z.object({
  clientId: z.string().uuid(),
  planned_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  platform: z.string().min(1).max(40),
  content_type: z.string().min(1).max(40),
  title: z.string().min(1).max(180),
  caption: z.string().max(4000).optional().or(z.literal("")),
  script: z.string().max(8000).optional().or(z.literal("")),
  media_notes: z.string().max(3000).optional().or(z.literal("")),
  status: StatusEnum.default("draft"),
});

export type SocialContentStatus = z.infer<typeof StatusEnum>;
export type SocialContentItem = {
  id: string;
  client_id: string;
  service_contract_id: string | null;
  planned_date: string;
  platform: string;
  content_type: string;
  title: string;
  caption: string | null;
  script: string | null;
  media_notes: string | null;
  status: SocialContentStatus;
  client_feedback: string | null;
  reviewed_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Alleen admins mogen deze actie uitvoeren");
}

function socialTable() {
  return (supabaseAdmin as unknown as { from: (table: string) => any }).from("social_content_items");
}

async function getClientForUser(userId: string) {
  const { data: client, error } = await supabaseAdmin
    .from("clients")
    .select("id, company_name")
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return client;
}

async function getActiveSocialContract(clientId: string) {
  const { data, error } = await supabaseAdmin
    .from("service_contracts")
    .select("id")
    .eq("client_id", clientId)
    .eq("service_slug", "social-media")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.[0] ?? null;
}

async function getBestSocialContract(clientId: string) {
  const { data, error } = await supabaseAdmin
    .from("service_contracts")
    .select("id, status")
    .eq("client_id", clientId)
    .eq("service_slug", "social-media")
    .in("status", ["active", "pending", "draft"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return data?.find((row) => row.status === "active") ?? data?.[0] ?? null;
}

export const getMySocialContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ mode: z.enum(["calendar", "scripts"]).default("calendar") }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const client = await getClientForUser(context.userId);
    if (!client) return { hasAccess: false, client: null, items: [] as SocialContentItem[] };

    const activeContract = await getActiveSocialContract(client.id);
    if (!activeContract) return { hasAccess: false, client, items: [] as SocialContentItem[] };

    const { data: rows, error } = await socialTable()
      .select("*")
      .eq("client_id", client.id)
      .order("planned_date", { ascending: data.mode === "calendar" });
    if (error) throw new Error(error.message);

    const items = ((rows ?? []) as SocialContentItem[]).filter((item) =>
      data.mode === "calendar" ? true : Boolean(item.script || item.caption),
    );
    return { hasAccess: true, client, items };
  });

export const reviewMySocialContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      decision: z.enum(["approved", "changes_requested"]),
      feedback: z.string().max(2000).optional().or(z.literal("")),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const client = await getClientForUser(context.userId);
    if (!client) throw new Error("Geen klantprofiel gekoppeld");
    const activeContract = await getActiveSocialContract(client.id);
    if (!activeContract) throw new Error("Social Media is nog niet actief voor dit account");
    if (data.decision === "changes_requested" && !data.feedback?.trim()) {
      throw new Error("Geef feedback mee bij een wijzigingsverzoek");
    }

    const { data: item, error: itemError } = await socialTable()
      .select("id, client_id, status")
      .eq("id", data.id)
      .eq("client_id", client.id)
      .maybeSingle();
    if (itemError) throw new Error(itemError.message);
    if (!item) throw new Error("Content niet gevonden");
    if (!["ready_for_review", "changes_requested"].includes(item.status)) {
      throw new Error("Dit item staat niet klaar voor klantreview");
    }

    const { error } = await socialTable()
      .update({ status: data.decision, client_feedback: data.feedback || null, reviewed_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("client_id", client.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListSocialContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const [{ data: client }, { data: rows, error }] = await Promise.all([
      supabaseAdmin.from("clients").select("id, company_name").eq("id", data.clientId).maybeSingle(),
      socialTable().select("*").eq("client_id", data.clientId).order("planned_date", { ascending: false }),
    ]);
    if (error) throw new Error(error.message);
    if (!client) throw new Error("Klant niet gevonden");
    return { client, items: (rows ?? []) as SocialContentItem[] };
  });

export const adminCreateSocialContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SocialContentSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const contract = await getBestSocialContract(data.clientId);
    const { data: row, error } = await socialTable()
      .insert({
        client_id: data.clientId,
        service_contract_id: contract?.id ?? null,
        planned_date: data.planned_date,
        platform: data.platform,
        content_type: data.content_type,
        title: data.title,
        caption: data.caption || null,
        script: data.script || null,
        media_notes: data.media_notes || null,
        status: data.status,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Content opslaan mislukt");
    return { id: row.id };
  });

export const adminUpdateSocialContentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: StatusEnum }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const patch = data.status === "published"
      ? { status: data.status, published_at: new Date().toISOString() }
      : { status: data.status };
    const { error } = await socialTable().update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpdateSocialContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    planned_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    platform: z.string().min(1).max(40).optional(),
    content_type: z.string().min(1).max(40).optional(),
    title: z.string().min(1).max(180).optional(),
    caption: z.string().max(4000).nullable().optional(),
    script: z.string().max(8000).nullable().optional(),
    media_notes: z.string().max(3000).nullable().optional(),
    // If true and a non-empty script is set on a draft item, auto-promote to ready_for_review.
    auto_send_on_script: z.boolean().optional().default(true),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { id, auto_send_on_script, ...patch } = data;
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) clean[k] = v;

    // Auto-promote: when admin attaches/edits a script on a draft item, status becomes orange.
    if (auto_send_on_script && typeof patch.script === "string" && patch.script.trim().length > 0) {
      const { data: existing } = await socialTable()
        .select("status")
        .eq("id", id)
        .maybeSingle();
      if (existing?.status === "draft") {
        clean.status = "ready_for_review";
        clean.client_feedback = null;
      }
    }

    const { error } = await socialTable().update(clean).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const adminDeleteSocialContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await socialTable().delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
