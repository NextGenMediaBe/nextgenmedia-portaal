import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SERVICE_SLUGS } from "./services.functions";

const PlatformEnum = z.enum(["meta", "linkedin", "tiktok", "pinterest", "twitter"]);
const ServiceSlugEnum = z.enum(SERVICE_SLUGS);

const CreateClientSchema = z.object({
  company_name: z.string().min(1).max(120),
  niche: z.string().min(1).max(120).optional().default(""),
  website_url: z.string().url().max(300).optional().or(z.literal("")),
  services: z.array(ServiceSlugEnum).min(1),
  webdesign_maintenance_included: z.boolean().optional().default(false),
  platforms: z.array(PlatformEnum).optional().default([]),
  posts_per_month: z.number().int().min(0).max(60).optional().default(0),
  reels_per_month: z.number().int().min(0).max(60).optional().default(0),
  stories_per_month: z.number().int().min(0).max(60).optional().default(0),
  contract_months: z.union([z.literal(3), z.literal(6), z.literal(12)]),
  live_start_date: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  full_name: z.string().min(1).max(120),
});

const UpdateClientSchema = z.object({
  clientId: z.string().uuid(),
  company_name: z.string().min(1).max(120).optional(),
  niche: z.string().min(1).max(120).optional(),
  website_url: z.string().max(300).optional(),
  platforms: z.array(PlatformEnum).min(1).optional(),
  posts_per_month: z.number().int().min(0).max(60).optional(),
  reels_per_month: z.number().int().min(0).max(60).optional(),
  stories_per_month: z.number().int().min(0).max(60).optional(),
  contract_months: z.union([z.literal(3), z.literal(6), z.literal(12)]).optional(),
  live_start_date: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).optional(),
  archived: z.boolean().optional(),
});

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role")
    .eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Alleen admins mogen deze actie uitvoeren");
}

function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
function toFirstOfMonth(input: string): string { return input.slice(0, 7) + "-01"; }

export const createClientWithAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateClientSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email, password: data.password, email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (createErr || !created.user) {
      throw new Error(`Account aanmaken mislukt: ${createErr?.message ?? "onbekend"}`);
    }
    const newUserId = created.user.id;
    await supabaseAdmin.from("user_roles").insert({ user_id: newUserId, role: "client" });

    const liveStart = toFirstOfMonth(data.live_start_date);
    const contractStart = liveStart;
    const contractEnd = addMonths(liveStart, data.contract_months);
    const hasSocial = data.services.includes("social-media");

    const { data: client, error: clientErr } = await supabaseAdmin
      .from("clients")
      .insert({
        owner_user_id: newUserId,
        company_name: data.company_name,
        niche: data.niche || "",
        website_url: data.website_url || null,
        platforms: hasSocial ? data.platforms : [],
        posts_per_month: hasSocial ? data.posts_per_month : 0,
        reels_per_month: hasSocial ? data.reels_per_month : 0,
        stories_per_month: hasSocial ? data.stories_per_month : 0,
        contract_months: data.contract_months,
        contract_start: contractStart,
        contract_end: contractEnd,
        live_start_date: liveStart,
        generation_status: "idle",
      })
      .select().single();
    if (clientErr || !client) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      throw new Error(`Klant aanmaken mislukt: ${clientErr?.message}`);
    }

    const serviceRows = data.services.map((slug) => ({
      client_id: client.id,
      service_slug: slug,
      config: slug === "webdesign"
        ? { maintenance_included: data.webdesign_maintenance_included } : {},
      active: true,
    }));
    if (serviceRows.length > 0) {
      await supabaseAdmin.from("client_services").insert(serviceRows);
    }

    // Dienst-contracten beginnen in 'pending' tot een PDF-contract getekend is
    type ContractInsert = {
      client_id: string;
      service_slug: string;
      model: "social_recurring" | "webdesign_project" | "webdesign_maintenance"
        | "consultancy_hours" | "design_project" | "ads_retainer" | "photo_video_project";
      status: "pending";
      start_date: string | null;
      end_date: string | null;
      renewal_reminder_at: string | null;
    };
    const contractRows: ContractInsert[] = [];
    for (const slug of data.services) {
      if (slug === "social-media") {
        contractRows.push({
          client_id: client.id, service_slug: slug, model: "social_recurring",
          status: "pending", start_date: contractStart, end_date: contractEnd,
          renewal_reminder_at: addMonths(contractEnd, -1),
        });
      } else if (slug === "webdesign") {
        contractRows.push({
          client_id: client.id, service_slug: slug, model: "webdesign_project",
          status: "pending", start_date: new Date().toISOString().slice(0, 10),
          end_date: null, renewal_reminder_at: null,
        });
        if (data.webdesign_maintenance_included) {
          const start = new Date().toISOString().slice(0, 10);
          contractRows.push({
            client_id: client.id, service_slug: slug, model: "webdesign_maintenance",
            status: "pending", start_date: start, end_date: addMonths(start, 12),
            renewal_reminder_at: addMonths(start, 11),
          });
        }
      } else {
        const modelMap = {
          "marketing-consultancy": "consultancy_hours",
          "grafisch-ontwerp": "design_project",
          "ads": "ads_retainer",
          "foto-video": "photo_video_project",
        } as const;
        contractRows.push({
          client_id: client.id, service_slug: slug,
          model: modelMap[slug as keyof typeof modelMap],
          status: "pending", start_date: new Date().toISOString().slice(0, 10),
          end_date: null, renewal_reminder_at: null,
        });
      }
    }
    let socialContractId: string | null = null;
    if (contractRows.length > 0) {
      const { data: inserted } = await supabaseAdmin
        .from("service_contracts")
        .insert(contractRows)
        .select("id, service_slug");
      socialContractId = (inserted ?? []).find((r) => r.service_slug === "social-media")?.id ?? null;
    }

    // Vul het social-media contract alvast met de gewenste aantallen reels/posts/stories + kanalen
    if (socialContractId && hasSocial) {
      await supabaseAdmin
        .from("service_contracts")
        .update({
          config: {
            reels: data.reels_per_month,
            posts: data.posts_per_month,
            stories: data.stories_per_month,
            channels: data.platforms,
            contract_months: data.contract_months,
            monthly_setup_date: liveStart,
          },
        })
        .eq("id", socialContractId);
    }

    return { ok: true, clientId: client.id, hasSocial, socialContractId };
  });

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("clients").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getClientDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: client } = await context.supabase
      .from("clients").select("*").eq("id", data.clientId).maybeSingle();
    return { client };
  });

export const updateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateClientSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { clientId, ...patch } = data;
    const updatePayload: Record<string, unknown> = { ...patch };
    if (patch.live_start_date) {
      const normalized = toFirstOfMonth(patch.live_start_date);
      updatePayload.live_start_date = normalized;
      updatePayload.contract_start = normalized;
      const months = patch.contract_months ?? (await supabaseAdmin
        .from("clients").select("contract_months").eq("id", clientId).single()).data?.contract_months ?? 3;
      updatePayload.contract_end = addMonths(normalized, months);
    } else if (patch.contract_months) {
      const c = await supabaseAdmin.from("clients").select("live_start_date,contract_start").eq("id", clientId).single();
      const base = c.data?.live_start_date ?? c.data?.contract_start;
      if (base) updatePayload.contract_end = addMonths(base, patch.contract_months);
    }
    if ((patch.website_url ?? "") === "") updatePayload.website_url = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabaseAdmin.from("clients").update(updatePayload as any).eq("id", clientId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid(), confirmName: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: client } = await supabaseAdmin
      .from("clients").select("id, company_name, owner_user_id").eq("id", data.clientId).single();
    if (!client) throw new Error("Klant niet gevonden");
    if (client.company_name.trim().toLowerCase() !== data.confirmName.trim().toLowerCase()) {
      throw new Error("Bevestiging komt niet overeen met de bedrijfsnaam");
    }
    await supabaseAdmin.from("clients").delete().eq("id", client.id);
    if (client.owner_user_id) {
      await supabaseAdmin.auth.admin.deleteUser(client.owner_user_id).catch(() => null);
    }
    return { ok: true };
  });

export const myPortal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: client } = await context.supabase
      .from("clients").select("*").eq("owner_user_id", context.userId).maybeSingle();
    if (!client) return { client: null, services: [], pendingContracts: [] };

    const [{ data: services }, { data: pendingContracts }] = await Promise.all([
      context.supabase.from("service_contracts").select("*").eq("client_id", client.id),
      context.supabase
        .from("contracts")
        .select("id, title, status, access_token, sent_at, created_at")
        .eq("client_id", client.id)
        .in("status", ["sent", "viewed"])
        .order("created_at", { ascending: false }),
    ]);
    return { client, services: services ?? [], pendingContracts: pendingContracts ?? [] };
  });

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const today = new Date();
    const todayISO = today.toISOString().slice(0, 10);
    const in14ISO = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10);

    const [
      clientsRes,
      pendingContractsRes,
      recentContractsRes,
      pendingScriptsRes,
      rejectedScriptsRes,
      openWebdesignRes,
      upcomingTasksRes,
      openAssignmentsRes,
    ] = await Promise.all([
      supabaseAdmin.from("clients").select("*").eq("archived", false),
      supabaseAdmin
        .from("contracts")
        .select("id, title, status, created_at, clients(company_name)")
        .in("status", ["sent", "viewed"])
        .order("created_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("contracts")
        .select("id, title, status, signed_at, created_at, clients(company_name)")
        .order("created_at", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("social_content_items")
        .select("id, client_id, title, platform, planned_date, status")
        .eq("status", "ready_for_review")
        .order("planned_date", { ascending: true })
        .limit(20),
      supabaseAdmin
        .from("social_content_items")
        .select("id, client_id, title, platform, planned_date, status, client_feedback")
        .eq("status", "changes_requested")
        .order("reviewed_at", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("webdesign_change_requests")
        .select("id, client_id, title, status, kind, created_at")
        .in("status", ["new", "in_review", "estimated"])
        .order("created_at", { ascending: false })
        .limit(15),
      supabaseAdmin
        .from("production_tasks")
        .select("id, client_id, type, status, title, scheduled_for, deadline")
        .in("status", ["open", "in_progress"])
        .gte("scheduled_for", todayISO)
        .lte("scheduled_for", in14ISO)
        .order("scheduled_for", { ascending: true })
        .limit(15),
      supabaseAdmin
        .from("freelancer_assignments")
        .select("id, title, role, status, client_id, scheduled_date, freelancer_id")
        .in("status", ["invited", "open"])
        .order("created_at", { ascending: false })
        .limit(15),
    ]);

    const clients = clientsRes.data ?? [];
    const cmap = new Map(clients.map((c) => [c.id, c.company_name]));
    const renewals = clients.filter((c) => {
      if (!c.contract_end) return false;
      const end = new Date(c.contract_end);
      const days = (end.getTime() - today.getTime()) / 86400000;
      return days <= 14 && days >= -1;
    });

    const enrich = <T extends { client_id: string | null }>(arr: T[] | null) =>
      (arr ?? []).map((r) => ({ ...r, client_name: r.client_id ? cmap.get(r.client_id) ?? "—" : "—" }));

    return {
      clients,
      renewals,
      pendingContracts: pendingContractsRes.data ?? [],
      recentContracts: recentContractsRes.data ?? [],
      pendingScripts: enrich(pendingScriptsRes.data),
      rejectedScripts: enrich(rejectedScriptsRes.data),
      openWebdesign: enrich(openWebdesignRes.data),
      upcomingTasks: enrich(upcomingTasksRes.data),
      
      openAssignments: enrich(openAssignmentsRes.data),
    };
  });

export const resetClientPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid(), newPassword: z.string().min(8).max(72) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: client } = await supabaseAdmin
      .from("clients").select("owner_user_id").eq("id", data.clientId).maybeSingle();
    if (!client?.owner_user_id) throw new Error("Geen gekoppeld account voor deze klant");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      client.owner_user_id, { password: data.newPassword });
    if (error) throw new Error(`Wachtwoord wijzigen mislukt: ${error.message}`);
    return { ok: true };
  });
