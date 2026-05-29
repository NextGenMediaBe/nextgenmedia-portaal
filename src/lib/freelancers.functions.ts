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

const RoleEnum = z.enum([
  "photographer",
  "videographer",
  "editor",
  "designer",
  "copywriter",
  "developer",
  "strategist",
  "other",
]);

export const adminListFreelancers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("freelancers")
      .select("*, freelancer_assignments(*)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { freelancers: data ?? [] };
  });

const CreateFreelancerSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1).max(120),
  company_name: z.string().max(160).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  vat_number: z.string().max(40).optional().or(z.literal("")),
  iban: z.string().max(40).optional().or(z.literal("")),
  roles: z.array(RoleEnum).min(1),
  hourly_rate: z.number().min(0).max(10000).nullable(),
  default_commission_pct: z.number().min(0).max(100).nullable().optional(),
  region: z.string().max(120).optional().or(z.literal("")),
  bio: z.string().max(2000).optional().or(z.literal("")),
  notes: z.string().max(4000).optional().or(z.literal("")),
  password: z.string().min(8).max(72).optional().or(z.literal("")),
});

function randomPassword(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "x");
}

export const adminCreateFreelancer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateFreelancerSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const finalPassword = data.password && data.password.length >= 8 ? data.password : randomPassword();
    const adminSetPassword = Boolean(data.password && data.password.length >= 8);

    const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: finalPassword,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (authErr || !created.user) throw new Error(authErr?.message || "Kon gebruiker niet aanmaken");

    await supabaseAdmin.from("user_roles").insert({ user_id: created.user.id, role: "freelancer" });

    const meta: Record<string, string> = {};
    if (data.vat_number) meta.vat_number = data.vat_number;

    const { data: fl, error } = await supabaseAdmin
      .from("freelancers")
      .insert({
        user_id: created.user.id,
        email: data.email,
        full_name: data.full_name,
        company_name: data.company_name || null,
        phone: data.phone || null,
        iban: data.iban || null,
        roles: data.roles,
        hourly_rate: data.hourly_rate,
        default_commission_pct: data.default_commission_pct ?? 0,
        region: data.region || null,
        bio: data.bio || null,
        notes: data.notes || null,
        status: "active",
        metadata: meta,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Only generate invite link when admin did NOT manually set the password
    let inviteLink: string | null = null;
    if (!adminSetPassword) {
      try {
        const { data: link } = await supabaseAdmin.auth.admin.generateLink({
          type: "recovery",
          email: data.email,
        });
        inviteLink = link?.properties?.action_link ?? null;
      } catch {
        inviteLink = null;
      }
    }
    return { id: fl.id, inviteLink, passwordSet: adminSetPassword };
  });

const UpdateFreelancerSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().min(1).max(120).optional(),
  company_name: z.string().max(160).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  iban: z.string().max(40).optional().or(z.literal("")),
  roles: z.array(RoleEnum).min(1).optional(),
  hourly_rate: z.number().min(0).max(10000).nullable().optional(),
  default_commission_pct: z.number().min(0).max(100).nullable().optional(),
  region: z.string().max(120).optional().or(z.literal("")),
  bio: z.string().max(2000).optional().or(z.literal("")),
  notes: z.string().max(4000).optional().or(z.literal("")),
  status: z.enum(["pending", "active", "inactive"]).optional(),
});

export const adminUpdateFreelancer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => UpdateFreelancerSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { id, ...rest } = data;
    const { error } = await supabaseAdmin.from("freelancers").update(rest).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteFreelancer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: fl } = await supabaseAdmin.from("freelancers").select("user_id").eq("id", data.id).maybeSingle();
    await supabaseAdmin.from("freelancers").delete().eq("id", data.id);
    if (fl?.user_id) {
      await supabaseAdmin.auth.admin.deleteUser(fl.user_id);
    }
    return { ok: true };
  });

// ====== FREELANCER PORTAL ======
export const myFreelancerProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: fl } = await supabaseAdmin
      .from("freelancers")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!fl) return { freelancer: null, assignments: [] };
    const { data: assignments } = await supabaseAdmin
      .from("freelancer_assignments")
      .select("*, clients(company_name)")
      .eq("freelancer_id", fl.id)
      .order("scheduled_date", { ascending: true, nullsFirst: false });
    return { freelancer: fl, assignments: assignments ?? [] };
  });

export const updateAssignmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["invited", "accepted", "declined", "done"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: fl } = await supabaseAdmin
      .from("freelancers")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!fl) throw new Error("Geen freelancer-profiel gevonden");
    const { error } = await supabaseAdmin
      .from("freelancer_assignments")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("freelancer_id", fl.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ====== ASSIGNMENT MANAGEMENT ======
const AssignmentRoleEnum = RoleEnum;

const AssignmentBaseSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional().or(z.literal("")),
  roles: z.array(AssignmentRoleEnum).min(1),
  client_id: z.string().uuid().nullable().optional(),
  freelancer_id: z.string().uuid().nullable().optional(),
  freelancer_budget: z.number().min(0).max(1_000_000).nullable().optional(),
  deadline: z.string().nullable().optional(),
});

export const adminListAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("freelancer_assignments")
      .select("*, freelancers(full_name, email), clients(company_name)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { assignments: data ?? [] };
  });

export const adminCreateAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => AssignmentBaseSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const status = data.freelancer_id ? "invited" : "open";
    const { data: row, error } = await supabaseAdmin
      .from("freelancer_assignments")
      .insert({
        title: data.title,
        description: data.description || null,
        role: data.roles[0], // legacy single-role column blijft gevuld voor backwards-compat
        roles: data.roles,
        client_id: data.client_id || null,
        freelancer_id: data.freelancer_id || null,
        budget: data.freelancer_budget ?? null,
        deadline: data.deadline || null,
        status,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const adminUpdateAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(4000).optional().or(z.literal("")),
      roles: z.array(AssignmentRoleEnum).min(1).optional(),
      client_id: z.string().uuid().nullable().optional(),
      freelancer_id: z.string().uuid().nullable().optional(),
      freelancer_budget: z.number().nullable().optional(),
      deadline: z.string().nullable().optional(),
      status: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { id, freelancer_budget, roles, ...rest } = data;
    const patch: Record<string, unknown> = { ...rest };
    if (freelancer_budget !== undefined) patch.budget = freelancer_budget;
    if (roles !== undefined) {
      patch.roles = roles;
      patch.role = roles[0];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabaseAdmin.from("freelancer_assignments").update(patch as any).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("freelancer_assignments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ====== FREELANCER PORTAL: OPEN POOL + CLAIM ======
export const listOpenAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: fl } = await supabaseAdmin
      .from("freelancers")
      .select("id, status, roles")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!fl || fl.status !== "active") return { assignments: [] };
    const { data, error } = await supabaseAdmin
      .from("freelancer_assignments")
      .select("*, clients(company_name)")
      .is("freelancer_id", null)
      .eq("status", "open")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const myRoles: string[] = (fl.roles ?? []) as string[];
    const filtered = (data ?? []).filter((a: { roles?: string[] | null; role?: string | null }) => {
      const required: string[] = (a.roles && a.roles.length > 0 ? a.roles : a.role ? [a.role] : []) as string[];
      if (required.length === 0) return true;
      return required.some((r) => myRoles.includes(r));
    });
    return { assignments: filtered };
  });

export const claimAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: fl } = await supabaseAdmin
      .from("freelancers")
      .select("id, status")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!fl) throw new Error("Geen freelancer-profiel gevonden");
    if (fl.status !== "active") throw new Error("Je freelancer-account is nog niet actief");
    // Atomic-ish claim: only succeed if still unclaimed
    const { data: updated, error } = await supabaseAdmin
      .from("freelancer_assignments")
      .update({ freelancer_id: fl.id, status: "accepted", claimed_at: new Date().toISOString() })
      .eq("id", data.id)
      .is("freelancer_id", null)
      .eq("status", "open")
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Deze opdracht is intussen al door iemand anders geclaimd");
    return { ok: true };
  });
