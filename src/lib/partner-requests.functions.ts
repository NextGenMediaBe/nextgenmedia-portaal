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

const SERVICE_TYPES = [
  "social-media", "webdesign", "marketing-consultancy", "ads",
  "photography", "graphic-design", "videography", "other",
] as const;

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  service_type: z.enum(SERVICE_TYPES),
  description: z.string().max(4000).optional().or(z.literal("")),
  budget: z.number().min(0).max(1_000_000).nullable().optional(),
  desired_deadline: z.string().nullable().optional(),
  attachments: z.array(z.object({
    name: z.string(),
    url: z.string(),
  })).optional(),
});

// ===== PARTNER PORTAL =====
export const partnerCreateRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: fl } = await supabaseAdmin
      .from("freelancers").select("id, status")
      .eq("user_id", context.userId).maybeSingle();
    if (!fl) throw new Error("Geen partner-profiel gevonden");
    if (fl.status !== "active") throw new Error("Je partner-account is nog niet actief");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (supabaseAdmin.from("partner_inbound_requests") as any).insert({
      freelancer_id: fl.id,
      title: data.title,
      service_type: data.service_type,
      description: data.description || null,
      budget: data.budget ?? null,
      desired_deadline: data.desired_deadline || null,
      attachments: data.attachments ?? [],
      status: "new",
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const partnerListMyRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: fl } = await supabaseAdmin
      .from("freelancers").select("id").eq("user_id", context.userId).maybeSingle();
    if (!fl) return { requests: [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabaseAdmin.from("partner_inbound_requests") as any)
      .select("*").eq("freelancer_id", fl.id).order("created_at", { ascending: false });
    return { requests: data ?? [] };
  });

// ===== ADMIN =====
export const adminListPartnerRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabaseAdmin.from("partner_inbound_requests") as any)
      .select("*, freelancers(full_name, company_name, email)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { requests: data ?? [] };
  });

export const adminUpdatePartnerRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    status: z.enum(["new", "in_review", "accepted", "in_progress", "delivered", "rejected"]).optional(),
    admin_notes: z.string().max(4000).optional().or(z.literal("")),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { id, ...patch } = data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from("partner_inbound_requests") as any).update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
