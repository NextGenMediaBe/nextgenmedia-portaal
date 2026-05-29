import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------------- Helpers ----------------

async function myClient(userId: string) {
  const { data } = await supabaseAdmin
    .from("clients").select("id").eq("owner_user_id", userId).maybeSingle();
  if (!data) throw new Error("Geen klantprofiel gekoppeld");
  return data.id as string;
}

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role")
    .eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Alleen admins mogen deze actie uitvoeren");
}

async function webdesignContext(clientId: string) {
  const { data } = await supabaseAdmin
    .from("service_contracts")
    .select("id, status, maintenance_included, model")
    .eq("client_id", clientId)
    .eq("service_slug", "webdesign");
  const all = data ?? [];
  const active = all.filter((c) => c.status === "active");
  const maintenance = active.some((c) => c.maintenance_included === true);
  // Prefer maintenance contract for linking, else first active, else first contract.
  const sc =
    active.find((c) => c.maintenance_included) ??
    active[0] ??
    all[0] ??
    null;
  return { hasAccess: active.length > 0, maintenance, contract: sc };
}

// ---------------- Public statuses (NL) ----------------

export const WD_STATUS_LABELS: Record<string, string> = {
  new: "Nieuw",
  in_review: "In behandeling",
  estimated: "Wachten op feedback",
  approved: "In behandeling",
  in_progress: "In behandeling",
  done: "Afgerond",
  rejected: "Afgewezen",
};

export const WD_ADMIN_STATUS_OPTIONS = [
  { value: "new", label: "Nieuw" },
  { value: "in_review", label: "In behandeling" },
  { value: "estimated", label: "Wachten op feedback" },
  { value: "done", label: "Afgerond" },
  { value: "rejected", label: "Afgewezen" },
] as const;

// ---------------- Portal: context + listings ----------------

export const getMyWebdesignContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientId = await myClient(context.userId);
    const ctx = await webdesignContext(clientId);
    const { data, error } = await supabaseAdmin
      .from("webdesign_change_requests")
      .select(
        "id, title, description, status, kind, categories, estimated_hours, estimated_cost, hourly_rate, attachments, created_at",
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return {
      clientId,
      hasAccess: ctx.hasAccess,
      maintenance: ctx.maintenance,
      items: data ?? [],
    };
  });

// ---------------- Portal: submit small / large ----------------

const AttachmentSchema = z.object({
  path: z.string().min(1).max(500),
  name: z.string().min(1).max(255),
  size: z.number().int().nonnegative().optional(),
  type: z.string().max(120).optional(),
});

const SmallSchema = z.object({
  categories: z
    .array(z.enum(["texts", "colors", "images", "other"]))
    .min(1, "Kies minstens één categorie"),
  text_changes: z.string().max(4000).optional().default(""),
  color_changes: z.string().max(4000).optional().default(""),
  image_notes: z.string().max(4000).optional().default(""),
  other_notes: z.string().max(4000).optional().default(""),
  attachments: z.array(AttachmentSchema).max(20).optional().default([]),
});

function buildSmallTitle(cats: string[]): string {
  const map: Record<string, string> = {
    texts: "Teksten",
    colors: "Kleuren",
    images: "Afbeeldingen",
    other: "Andere wijziging",
  };
  return "Kleine aanpassing — " + cats.map((c) => map[c] ?? c).join(", ");
}

function buildSmallDescription(d: z.infer<typeof SmallSchema>): string {
  const parts: string[] = [];
  if (d.categories.includes("texts") && d.text_changes)
    parts.push(`📝 Teksten:\n${d.text_changes}`);
  if (d.categories.includes("colors") && d.color_changes)
    parts.push(`🎨 Kleuren:\n${d.color_changes}`);
  if (d.categories.includes("images") && d.image_notes)
    parts.push(`🖼️ Afbeeldingen:\n${d.image_notes}`);
  if (d.categories.includes("other") && d.other_notes)
    parts.push(`✏️ Overig:\n${d.other_notes}`);
  return parts.join("\n\n") || "(geen extra toelichting)";
}

export const submitWebdesignSmall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SmallSchema.parse(d))
  .handler(async ({ data, context }) => {
    const clientId = await myClient(context.userId);
    const ctx = await webdesignContext(clientId);
    if (!ctx.hasAccess) throw new Error("Webdesign contract is niet actief");
    if (!ctx.maintenance) {
      throw new Error(
        "Klein onderhoud is enkel beschikbaar wanneer onderhoud is inbegrepen. Dien een groot onderhoud-aanvraag in voor een offerte.",
      );
    }

    const title = buildSmallTitle(data.categories);
    const description = buildSmallDescription(data);

    // Maintenance included → direct support ticket, no quote, no pricing
    await supabaseAdmin.from("production_tasks").insert({
      client_id: clientId,
      service_contract_id: ctx.contract?.id ?? null,
      type: "support",
      status: "open",
      title,
      notes: description,
    });
    const { error } = await supabaseAdmin.from("webdesign_change_requests").insert({
      client_id: clientId,
      service_contract_id: ctx.contract?.id ?? null,
      title,
      description,
      kind: "minor",
      status: "in_progress",
      hourly_rate: 0,
      categories: data.categories,
      text_changes: data.text_changes || null,
      color_changes: data.color_changes || null,
      image_notes: data.image_notes || null,
      other_notes: data.other_notes || null,
      attachments: data.attachments,
    });
    if (error) throw new Error(error.message);
    return { ok: true, mode: "support_task" as const };
  });


const LargeSchema = z.object({
  description: z.string().min(10).max(6000),
  pages_count: z.number().int().min(0).max(200).optional(),
  extra_features: z.string().max(4000).optional().default(""),
  attachments: z.array(AttachmentSchema).max(20).optional().default([]),
});

export const submitWebdesignLarge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LargeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const clientId = await myClient(context.userId);
    const ctx = await webdesignContext(clientId);
    if (!ctx.hasAccess) throw new Error("Webdesign contract is niet actief");

    const title =
      "Groot onderhoud" +
      (data.pages_count ? ` · ${data.pages_count} nieuwe pagina's` : "");

    const fullDesc = [
      data.description,
      data.extra_features ? `\n\n⚙️ Extra functionaliteit:\n${data.extra_features}` : "",
    ].join("");

    const { error } = await supabaseAdmin.from("webdesign_change_requests").insert({
      client_id: clientId,
      service_contract_id: ctx.contract?.id ?? null,
      title,
      description: fullDesc,
      kind: "major",
      status: "new",
      hourly_rate: 95,
      pages_count: data.pages_count ?? null,
      extra_features: data.extra_features || null,
      attachments: data.attachments,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- Admin ----------------

export const adminListWebdesignRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("webdesign_change_requests")
      .select(
        "id, title, description, status, kind, categories, hourly_rate, estimated_hours, estimated_cost, pages_count, extra_features, attachments, admin_notes, created_at, updated_at, client_id, service_contract_id",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const clientIds = Array.from(new Set(rows.map((r) => r.client_id)));
    const contractIds = Array.from(
      new Set(rows.map((r) => r.service_contract_id).filter((v): v is string => !!v)),
    );
    const [{ data: clients }, { data: contracts }] = await Promise.all([
      clientIds.length
        ? supabaseAdmin.from("clients").select("id, company_name").in("id", clientIds)
        : Promise.resolve({ data: [] as { id: string; company_name: string }[] }),
      contractIds.length
        ? supabaseAdmin
            .from("service_contracts")
            .select("id, maintenance_included")
            .in("id", contractIds)
        : Promise.resolve({ data: [] as { id: string; maintenance_included: boolean }[] }),
    ]);
    const cmap = new Map((clients ?? []).map((c) => [c.id, c.company_name]));
    const scmap = new Map(
      (contracts ?? []).map((c) => [c.id, c.maintenance_included === true]),
    );
    return {
      items: rows.map((r) => ({
        ...r,
        client_name: cmap.get(r.client_id) ?? "—",
        maintenance_included: r.service_contract_id
          ? scmap.get(r.service_contract_id) ?? false
          : false,
      })),
    };
  });

export const adminUpdateWebdesignRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z
          .enum(["new", "in_review", "estimated", "approved", "in_progress", "done", "rejected"])
          .optional(),
        estimated_hours: z.number().min(0).max(1000).nullable().optional(),
        estimated_cost: z.number().min(0).max(100000).nullable().optional(),
        admin_notes: z.string().max(4000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { id, ...patch } = data;
    const { error } = await supabaseAdmin
      .from("webdesign_change_requests")
      .update(patch as never)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminGetUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ path: z.string().min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: signed, error } = await supabaseAdmin.storage
      .from("webdesign-uploads")
      .createSignedUrl(data.path, 60 * 10);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

export const getMyUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ path: z.string().min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const clientId = await myClient(context.userId);
    if (!data.path.startsWith(`${clientId}/`)) {
      throw new Error("Geen toegang tot dit bestand");
    }
    const { data: signed, error } = await supabaseAdmin.storage
      .from("webdesign-uploads")
      .createSignedUrl(data.path, 60 * 10);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });
