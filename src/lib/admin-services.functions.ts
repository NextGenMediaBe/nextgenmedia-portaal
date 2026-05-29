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

const SERVICE_SLUGS = [
  "social-media",
  "webdesign",
  "marketing-consultancy",
  "ads",
  "fotografie",
  "grafisch-ontwerp",
  "videografie",
  "foto-video",
] as const;

export const SERVICE_META: Record<
  string,
  { label: string; description: string }
> = {
  "social-media": {
    label: "Social Media",
    description: "Contentkalenders, scripts, shoots en goedkeuringen.",
  },
  webdesign: {
    label: "Webdesign",
    description: "Onderhoud, uitbreidingen en projectaanvragen.",
  },
  "marketing-consultancy": {
    label: "Marketing Consultancy",
    description: "Strategiesessies, audits en adviesvragen.",
  },
  ads: {
    label: "Google & Meta Ads",
    description: "Campagnes, rapportages en optimalisaties.",
  },
  fotografie: {
    label: "Fotografie",
    description: "Geplande shoots, levering en aanvragen.",
  },
  "grafisch-ontwerp": {
    label: "Grafisch Ontwerp",
    description: "Branding, print en design-aanvragen.",
  },
  videografie: {
    label: "Videografie",
    description: "Reels, edits en video-aanvragen.",
  },
  "foto-video": {
    label: "Foto & Video",
    description: "Gecombineerde shoots & edits.",
  },
};

export const adminServiceDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ slug: z.enum(SERVICE_SLUGS) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const slug = data.slug;

    // Active clients via service_contracts
    const { data: contracts } = await supabaseAdmin
      .from("service_contracts")
      .select(
        "id, client_id, status, model, monthly_fee, hourly_rate, start_date, end_date, maintenance_included",
      )
      .eq("service_slug", slug)
      .order("start_date", { ascending: false });

    const allContracts = contracts ?? [];
    const activeContracts = allContracts.filter((c) => c.status === "active");
    const clientIds = Array.from(new Set(allContracts.map((c) => c.client_id)));

    const { data: clients } = clientIds.length
      ? await supabaseAdmin
          .from("clients")
          .select("id, company_name, niche, website_url")
          .in("id", clientIds)
      : { data: [] as { id: string; company_name: string; niche: string; website_url: string | null }[] };
    const cmap = new Map((clients ?? []).map((c) => [c.id, c]));

    // Production tasks for these clients
    const { data: tasks } = clientIds.length
      ? await supabaseAdmin
          .from("production_tasks")
          .select("id, client_id, type, status, title, scheduled_for, deadline, created_at")
          .in("client_id", clientIds)
          .order("created_at", { ascending: false })
          .limit(50)
      : { data: [] as never[] };

    // Service-specific extras
    type SocialItem = {
      id: string;
      client_id: string;
      title: string;
      platform: string;
      planned_date: string;
      status: string;
      content_type: string;
    };
    type WdItem = {
      id: string;
      client_id: string;
      title: string;
      status: string;
      kind: string;
      created_at: string;
    };
    let socialPending: SocialItem[] = [];
    let socialUpcoming: SocialItem[] = [];
    let webdesignOpen: WdItem[] = [];

    if (slug === "social-media" && clientIds.length) {
      const { data: items } = await supabaseAdmin
        .from("social_content_items")
        .select("id, client_id, title, platform, planned_date, status, content_type")
        .in("client_id", clientIds)
        .in("status", ["pending_review", "changes_requested", "scheduled"])
        .order("planned_date", { ascending: true })
        .limit(40);
      const all = (items ?? []) as SocialItem[];
      socialPending = all.filter((i) => ["pending_review", "changes_requested"].includes(i.status));
      socialUpcoming = all.filter((i) => i.status === "scheduled");
    }

    if (slug === "webdesign") {
      const { data: wd } = await supabaseAdmin
        .from("webdesign_change_requests")
        .select("id, client_id, title, status, kind, created_at")
        .in("status", ["new", "in_review", "estimated", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(20);
      webdesignOpen = (wd ?? []) as WdItem[];
    }


    return {
      slug,
      clients: activeContracts.map((c) => ({
        contract_id: c.id,
        client_id: c.client_id,
        company_name: cmap.get(c.client_id)?.company_name ?? "—",
        niche: cmap.get(c.client_id)?.niche ?? null,
        website: cmap.get(c.client_id)?.website_url ?? null,
        model: c.model,
        monthly_fee: c.monthly_fee,
        hourly_rate: c.hourly_rate,
        maintenance_included: c.maintenance_included,
      })),
      tasks: (tasks ?? []).map((t) => ({
        ...t,
        client_name: cmap.get(t.client_id)?.company_name ?? "—",
      })),
      socialPending,
      socialUpcoming,
      webdesignOpen: webdesignOpen.map((w) => ({
        ...w,
        client_name: cmap.get(w.client_id)?.company_name ?? "—",
      })),

      counts: {
        activeClients: activeContracts.length,
        totalContracts: allContracts.length,
        openTasks: (tasks ?? []).filter((t) => t.status !== "done").length,
      },
    };
  });

// ============= Unified Request Center =============
export const adminRequestCenter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const [webdesignRes, scriptsRes, tasksRes, clientsRes] = await Promise.all([
      supabaseAdmin
        .from("webdesign_change_requests")
        .select("id, client_id, title, description, status, kind, created_at")
        .in("status", ["new", "in_review", "estimated", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("social_content_items")
        .select("id, client_id, title, platform, planned_date, status, client_feedback, reviewed_at")
        .in("status", ["pending_review", "changes_requested"])
        .order("planned_date", { ascending: true })
        .limit(100),
      supabaseAdmin
        .from("production_tasks")
        .select("id, client_id, type, status, title, scheduled_for, created_at")
        .in("status", ["open", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin.from("clients").select("id, company_name"),
    ]);

    const cmap = new Map((clientsRes.data ?? []).map((c) => [c.id, c.company_name]));
    const enrich = <T extends { client_id?: string | null }>(arr: T[] | null) =>
      (arr ?? []).map((r) => ({
        ...r,
        client_name: r.client_id ? cmap.get(r.client_id) ?? "—" : "—",
      }));

    return {
      webdesign: enrich(webdesignRes.data),
      scripts: enrich(scriptsRes.data),
      tasks: enrich(tasksRes.data),
    };
  });

// ============= Social Media: all clients with script counts =============
export const adminSocialClientsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const { data: services } = await supabaseAdmin
      .from("client_services")
      .select("client_id, active")
      .eq("service_slug", "social-media")
      .eq("active", true);

    const clientIds = Array.from(new Set((services ?? []).map((s) => s.client_id)));
    if (clientIds.length === 0) return { clients: [] };

    const [clientsRes, contractsRes, itemsRes] = await Promise.all([
      supabaseAdmin
        .from("clients")
        .select("id, company_name, niche, platforms, posts_per_month, reels_per_month, stories_per_month, contract_end")
        .in("id", clientIds),
      supabaseAdmin
        .from("service_contracts")
        .select("client_id, status, monthly_fee")
        .eq("service_slug", "social-media")
        .in("client_id", clientIds),
      supabaseAdmin
        .from("social_content_items")
        .select("client_id, status")
        .in("client_id", clientIds),
    ]);

    const contractByClient = new Map<string, { status: string; monthly_fee: number | null }>();
    for (const c of contractsRes.data ?? []) contractByClient.set(c.client_id, c);

    const counts: Record<string, { pending: number; rejected: number; approved: number; draft: number; total: number }> = {};
    for (const id of clientIds) counts[id] = { pending: 0, rejected: 0, approved: 0, draft: 0, total: 0 };
    for (const it of itemsRes.data ?? []) {
      const c = counts[it.client_id];
      if (!c) continue;
      c.total += 1;
      if (it.status === "pending_review") c.pending += 1;
      else if (it.status === "changes_requested") c.rejected += 1;
      else if (it.status === "approved" || it.status === "scheduled" || it.status === "published") c.approved += 1;
      else if (it.status === "draft") c.draft += 1;
    }

    return {
      clients: (clientsRes.data ?? []).map((c) => ({
        ...c,
        contract_status: contractByClient.get(c.id)?.status ?? "pending",
        monthly_fee: contractByClient.get(c.id)?.monthly_fee ?? null,
        counts: counts[c.id],
      })),
    };
  });
