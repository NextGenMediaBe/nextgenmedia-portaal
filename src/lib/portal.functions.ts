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

// ============= LIST INTAKE TEMPLATES =============
export const listIntakeTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("service_intake_templates")
      .select("*")
      .eq("active", true)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return { templates: data ?? [] };
  });

// ============= ADMIN: invite client =============
export const adminInviteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      email: z.string().email().max(200),
      full_name: z.string().min(1).max(120),
      company_name: z.string().max(120).optional().or(z.literal("")),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: invite, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.full_name },
    });
    if (error) throw new Error(error.message);
    const userId = invite?.user?.id;
    if (userId) {
      await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "client" } as never);
      if (data.company_name) {
        await supabaseAdmin.from("clients").insert({
          owner_user_id: userId,
          company_name: data.company_name,
          niche: "",
          platforms: [],
        } as never);
      }
    }
    return { ok: true, user_id: userId };
  });
