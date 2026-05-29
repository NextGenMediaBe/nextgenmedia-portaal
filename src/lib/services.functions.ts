import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const SERVICE_SLUGS = [
  "social-media",
  "foto-video",
  "grafisch-ontwerp",
  "webdesign",
  "marketing-consultancy",
  "ads",
] as const;
export type ServiceSlug = (typeof SERVICE_SLUGS)[number];

export const SERVICE_LABELS: Record<ServiceSlug, string> = {
  "social-media": "Social Media",
  "foto-video": "Foto- & Videografie",
  "grafisch-ontwerp": "Grafisch Ontwerp",
  webdesign: "Webdesign",
  "marketing-consultancy": "Marketing Consultancy",
  ads: "Google & Meta Ads",
};

const SlugEnum = z.enum(SERVICE_SLUGS);

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Alleen admins mogen deze actie uitvoeren");
}

// Admin: list services for a given client
export type AdminServiceRow = {
  id: string;
  service_slug: ServiceSlug;
  maintenance_included: boolean;
  active: boolean;
};

export const listClientServices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ services: AdminServiceRow[] }> => {
    await assertAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("client_services")
      .select("id, service_slug, config, active")
      .eq("client_id", data.clientId);
    if (error) throw new Error(error.message);
    const services: AdminServiceRow[] = (rows ?? []).map((r) => {
      const cfg = (r.config ?? {}) as { maintenance_included?: boolean };
      return {
        id: r.id,
        service_slug: r.service_slug as ServiceSlug,
        maintenance_included: cfg.maintenance_included === true,
        active: r.active,
      };
    });
    return { services };
  });

// Admin: replace the full service set for a client (idempotent)
export const setClientServices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        services: z
          .array(
            z.object({
              service_slug: SlugEnum,
              config: z.record(z.string(), z.unknown()).default({}),
            }),
          )
          .max(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const keepSlugs = data.services.map((s) => s.service_slug);

    // Delete removed services
    if (keepSlugs.length === 0) {
      await supabaseAdmin.from("client_services").delete().eq("client_id", data.clientId);
    } else {
      await supabaseAdmin
        .from("client_services")
        .delete()
        .eq("client_id", data.clientId)
        .not("service_slug", "in", `(${keepSlugs.map((s) => `"${s}"`).join(",")})`);
    }

    // Upsert each kept service
    for (const s of data.services) {
      const { error } = await supabaseAdmin
        .from("client_services")
        .upsert(
          {
            client_id: data.clientId,
            service_slug: s.service_slug,
            config: s.config as never,
            active: true,
          },
          { onConflict: "client_id,service_slug" },
        );
      if (error) throw new Error(error.message);
    }

    // Ensure a draft service_contract exists for each enabled service so admin
    // can immediately attach a contract PDF to it.
    if (keepSlugs.length > 0) {
      const { data: existing } = await supabaseAdmin
        .from("service_contracts")
        .select("service_slug")
        .eq("client_id", data.clientId);
      const have = new Set((existing ?? []).map((r) => r.service_slug));
      const toCreate = data.services
        .filter((s) => !have.has(s.service_slug))
        .map((s) => ({
          client_id: data.clientId,
          service_slug: s.service_slug,
          model: DEFAULT_MODEL_FOR_SLUG[s.service_slug],
          status: "pending" as const,
        }));
      if (toCreate.length > 0) {
        const { error } = await supabaseAdmin.from("service_contracts").insert(toCreate);
        if (error) throw new Error(error.message);
      }
    }

    return { ok: true };
  });

const DEFAULT_MODEL_FOR_SLUG = {
  "social-media": "social_recurring",
  webdesign: "webdesign_project",
  "marketing-consultancy": "consultancy_hours",
  "grafisch-ontwerp": "design_project",
  ads: "ads_retainer",
  "foto-video": "photo_video_project",
} as const satisfies Record<ServiceSlug, string>;


// Portal: list services for the signed-in client
export type MyServiceRow = {
  service_slug: ServiceSlug;
  maintenance_included: boolean;
};

export const myServices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ services: MyServiceRow[] }> => {
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id")
      .eq("owner_user_id", context.userId)
      .maybeSingle();
    if (!client) return { services: [] };
    const [{ data: activeContracts }, { data: configs }] = await Promise.all([
      supabaseAdmin
        .from("service_contracts")
        .select("service_slug")
        .eq("client_id", client.id)
        .eq("status", "active"),
      supabaseAdmin
        .from("client_services")
        .select("service_slug, config")
        .eq("client_id", client.id),
    ]);
    const configBySlug = new Map(
      (configs ?? []).map((r) => [r.service_slug, (r.config ?? {}) as { maintenance_included?: boolean }]),
    );
    const uniqueSlugs = Array.from(new Set((activeContracts ?? []).map((r) => r.service_slug as ServiceSlug)));
    const services: MyServiceRow[] = uniqueSlugs.map((slug) => {
      const cfg = configBySlug.get(slug) ?? {};
      return {
        service_slug: slug,
        maintenance_included: cfg.maintenance_included === true,
      };
    });
    return { services };
  });

// Portal: detailed workspace data for one service module
export const getMyServiceModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ slug: SlugEnum }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: client } = await supabaseAdmin
      .from("clients").select("*").eq("owner_user_id", context.userId).maybeSingle();
    if (!client) throw new Error("Geen klantprofiel gekoppeld");

    const [{ data: contracts }, { data: cs }, { data: assignments }] = await Promise.all([
      supabaseAdmin.from("service_contracts").select("*")
        .eq("client_id", client.id).eq("service_slug", data.slug)
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("client_services").select("config, active")
        .eq("client_id", client.id).eq("service_slug", data.slug).maybeSingle(),
      supabaseAdmin.from("freelancer_assignments")
        .select("id, title, status, scheduled_date, deadline, estimated_hours")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false }).limit(10),
    ]);

    const activeContracts = (contracts ?? []).filter((c) => c.status === "active");
    return {
      client,
      slug: data.slug,
      contracts: contracts ?? [],
      activeContracts,
      hasActive: activeContracts.length > 0,
      config: (cs?.config ?? {}) as Record<string, string | number | boolean | null>,
      assignments: assignments ?? [],
    };
  });

