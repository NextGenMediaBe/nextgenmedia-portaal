import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SERVICE_SLUGS, type ServiceSlug } from "./services.functions";

export const CONTRACT_MODELS = [
  "social_recurring",
  "webdesign_project",
  "webdesign_maintenance",
  "consultancy_hours",
  "design_project",
  "ads_retainer",
  "photo_video_project",
] as const;
export type ContractModel = (typeof CONTRACT_MODELS)[number];

export const CONTRACT_STATUSES = ["pending", "draft", "active", "paused", "ended", "pending_renewal"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const CONTRACT_MODEL_LABELS: Record<ContractModel, string> = {
  social_recurring: "Social Media (recurring)",
  webdesign_project: "Webdesign project (eenmalig)",
  webdesign_maintenance: "Webdesign onderhoud (jaarlijks)",
  consultancy_hours: "Consultancy (uren)",
  design_project: "Grafisch ontwerp (project)",
  ads_retainer: "Ads (retainer)",
  photo_video_project: "Foto/Video (project)",
};

/** Default contract model for a freshly created service. */
export function defaultModelForService(slug: ServiceSlug): ContractModel {
  switch (slug) {
    case "social-media": return "social_recurring";
    case "webdesign": return "webdesign_project";
    case "marketing-consultancy": return "consultancy_hours";
    case "grafisch-ontwerp": return "design_project";
    case "ads": return "ads_retainer";
    case "foto-video": return "photo_video_project";
  }
}

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Alleen admins mogen deze actie uitvoeren");
}

const SlugEnum = z.enum(SERVICE_SLUGS);
const ModelEnum = z.enum(CONTRACT_MODELS);
const StatusEnum = z.enum(CONTRACT_STATUSES);

export type ContractRow = {
  id: string;
  client_id: string;
  service_slug: ServiceSlug;
  model: ContractModel;
  status: ContractStatus;
  start_date: string | null;
  end_date: string | null;
  renewal_reminder_at: string | null;
  setup_fee: number | null;
  monthly_fee: number | null;
  hourly_rate: number | null;
  hours_purchased: number | null;
  hours_used: number | null;
  config: Record<string, any>;
  notes: string | null;
};

export const listClientContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ contracts: ContractRow[] }> => {
    await assertAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("service_contracts")
      .select("*")
      .eq("client_id", data.clientId)
      .order("service_slug", { ascending: true });
    if (error) throw new Error(error.message);
    return { contracts: (rows ?? []) as unknown as ContractRow[] };
  });

const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  client_id: z.string().uuid(),
  service_slug: SlugEnum,
  model: ModelEnum,
  status: StatusEnum.default("active"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  renewal_reminder_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  setup_fee: z.number().min(0).max(1_000_000).nullable().optional(),
  monthly_fee: z.number().min(0).max(1_000_000).nullable().optional(),
  hourly_rate: z.number().min(0).max(10_000).nullable().optional(),
  hours_purchased: z.number().min(0).max(10_000).nullable().optional(),
  hours_used: z.number().min(0).max(10_000).nullable().optional(),
  config: z.record(z.string(), z.any()).default({}),
  notes: z.string().max(2000).nullable().optional(),
});

export type UpsertContractInput = z.infer<typeof UpsertSchema>;

export const upsertContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.id) {
      const { id, ...rest } = data;
      const { error } = await supabaseAdmin.from("service_contracts").update(rest).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("service_contracts")
      .insert(data)
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "insert failed");
    return { id: row.id };
  });

export const deleteContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("service_contracts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Renewals due in the next 30 days (active contracts with end_date approaching). */
export const renewalsDue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
    const { data, error } = await supabaseAdmin
      .from("service_contracts")
      .select("id, client_id, service_slug, model, end_date, clients:client_id (company_name)")
      .in("status", ["active", "pending_renewal"])
      .not("end_date", "is", null)
      .gte("end_date", today)
      .lte("end_date", in30)
      .order("end_date", { ascending: true });
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });
