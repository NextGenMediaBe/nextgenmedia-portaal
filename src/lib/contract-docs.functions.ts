import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequestHeader } from "@tanstack/react-start/server";

export const SIGNING_STATUSES = ["draft", "sent", "viewed", "signed", "cancelled"] as const;
export type SigningStatus = (typeof SIGNING_STATUSES)[number];

export const STATUS_LABELS: Record<SigningStatus, string> = {
  draft: "Concept",
  sent: "Verzonden",
  viewed: "Bekeken",
  signed: "Getekend",
  cancelled: "Geannuleerd",
};
export const STATUS_COLORS: Record<SigningStatus, string> = {
  draft: "bg-muted text-muted-foreground border border-border",
  sent: "bg-sky-500/15 text-sky-400 border border-sky-500/30",
  viewed: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  signed: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
  cancelled: "bg-red-500/15 text-red-400 border border-red-500/30",
};

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role")
    .eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Alleen admins mogen deze actie uitvoeren");
}

const BUCKET = "contracts";

// ============ Admin: lijst contracten ============
export const listContracts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      status: z.enum(SIGNING_STATUSES).nullable().optional(),
      search: z.string().nullable().optional(),
    }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin
      .from("contracts")
      .select("id, title, status, created_at, sent_at, signed_at, signer_name, signer_email, client_id, pdf_path, clients(company_name)")
      .order("created_at", { ascending: false });
    if (data.status) q = q.eq("status", data.status);
    if (data.search) q = q.ilike("title", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { contracts: rows ?? [] };
  });

// ============ Admin: nieuw contract aanmaken (PDF upload + dienst-koppeling) ============
export const adminUploadContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!(input instanceof FormData)) throw new Error("FormData verwacht");
    const file = input.get("pdf");
    if (!(file instanceof File)) throw new Error("PDF-bestand ontbreekt");
    if (file.type !== "application/pdf") throw new Error("Alleen PDF-bestanden");
    if (file.size > 20 * 1024 * 1024) throw new Error("Bestand mag max 20MB zijn");
    const meta = z.object({
      client_id: z.string().uuid(),
      title: z.string().min(1).max(200),
      signer_name: z.string().min(1).max(120),
      signer_email: z.string().email(),
      service_contract_ids: z.array(z.string().uuid()).min(1),
    }).parse(JSON.parse(String(input.get("meta") ?? "{}")));
    return { ...meta, file };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const id = crypto.randomUUID();
    const path = `${data.client_id}/${id}.pdf`;
    const bytes = new Uint8Array(await data.file.arrayBuffer());
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, {
      contentType: "application/pdf", upsert: false,
    });
    if (upErr) throw new Error(`Upload mislukt: ${upErr.message}`);

    const { data: row, error: insErr } = await supabaseAdmin.from("contracts").insert({
      id,
      client_id: data.client_id,
      title: data.title,
      signer_name: data.signer_name,
      signer_email: data.signer_email,
      pdf_path: path,
      status: "draft",
      rendered_html: null,
      created_by: context.userId,
    }).select("id, access_token").single();
    if (insErr || !row) {
      await supabaseAdmin.storage.from(BUCKET).remove([path]);
      throw new Error(`Contract aanmaken mislukt: ${insErr?.message}`);
    }

    const links = data.service_contract_ids.map((sid) => ({
      contract_id: row.id, service_contract_id: sid,
    }));
    const { error: linkErr } = await supabaseAdmin.from("contract_service_contracts").insert(links);
    if (linkErr) throw new Error(`Koppeling mislukt: ${linkErr.message}`);

    await supabaseAdmin.from("contract_events").insert({
      contract_id: row.id, event_type: "created", actor_email: null,
    });

    return { id: row.id, access_token: row.access_token };
  });

// ============ Admin: detail ============
export const adminGetContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const [{ data: contract }, { data: links }, { data: events }, { data: sig }] = await Promise.all([
      supabaseAdmin.from("contracts").select("*, clients(company_name)").eq("id", data.id).maybeSingle(),
      supabaseAdmin.from("contract_service_contracts")
        .select("service_contract_id, service_contracts(id, service_slug, model, monthly_fee, setup_fee, status)")
        .eq("contract_id", data.id),
      supabaseAdmin.from("contract_events").select("*").eq("contract_id", data.id).order("created_at", { ascending: false }),
      supabaseAdmin.from("contract_signatures").select("*").eq("contract_id", data.id).maybeSingle(),
    ]);
    if (!contract) throw new Error("Niet gevonden");

    let pdfUrl: string | null = null;
    const previewPath = contract.signed_pdf_path || contract.pdf_path;
    if (previewPath) {
      const { data: signed } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(previewPath, 3600);
      pdfUrl = signed?.signedUrl ?? null;
    }
    return { contract, links: links ?? [], events: events ?? [], signature: sig, pdfUrl };
  });

// ============ Admin: send ============
export const adminSendContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row } = await supabaseAdmin.from("contracts").select("status, access_token").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Niet gevonden");
    if (row.status !== "draft") throw new Error("Contract is al verzonden");
    await supabaseAdmin.from("contracts").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", data.id);
    await supabaseAdmin.from("contract_events").insert({ contract_id: data.id, event_type: "sent" });
    return { ok: true, access_token: row.access_token };
  });

// ============ Admin: cancel / delete ============
export const adminCancelContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await supabaseAdmin.from("contracts").update({ status: "cancelled" }).eq("id", data.id);
    await supabaseAdmin.from("contract_events").insert({ contract_id: data.id, event_type: "cancelled" });
    return { ok: true };
  });

export const adminDeleteContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row } = await supabaseAdmin.from("contracts").select("pdf_path").eq("id", data.id).maybeSingle();
    if (row?.pdf_path) {
      await supabaseAdmin.storage.from(BUCKET).remove([row.pdf_path]);
    }
    await supabaseAdmin.from("contracts").delete().eq("id", data.id);
    return { ok: true };
  });

// ============ Admin: list service-contracts beschikbaar voor koppeling ============
export const adminListClientServiceContracts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: rows } = await supabaseAdmin
      .from("service_contracts")
      .select("id, service_slug, model, monthly_fee, setup_fee, status, start_date, end_date")
      .eq("client_id", data.clientId)
      .order("service_slug");
    return { items: rows ?? [] };
  });

// ============ Sign page (publiek via token) ============
export const getContractByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: contract } = await supabaseAdmin
      .from("contracts")
      .select("id, title, status, signer_name, signer_email, sent_at, signed_at, pdf_path, client_id, clients(company_name)")
      .eq("access_token", data.token)
      .maybeSingle();
    if (!contract) throw new Error("Contract niet gevonden of link is ongeldig");
    if (contract.status === "cancelled") throw new Error("Dit contract is geannuleerd");

    // Markeer als 'viewed' bij eerste opening
    if (contract.status === "sent") {
      await supabaseAdmin.from("contracts").update({
        status: "viewed", viewed_at: new Date().toISOString(),
      }).eq("id", contract.id);
      await supabaseAdmin.from("contract_events").insert({ contract_id: contract.id, event_type: "viewed" });
    }

    let pdfUrl: string | null = null;
    if (contract.pdf_path) {
      const { data: signed } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(contract.pdf_path, 3600);
      pdfUrl = signed?.signedUrl ?? null;
    }

    const { data: links } = await supabaseAdmin
      .from("contract_service_contracts")
      .select("service_contracts(service_slug, model)")
      .eq("contract_id", contract.id);

    return { contract, pdfUrl, services: (links ?? []).map((l) => l.service_contracts).filter(Boolean) };
  });

export const signContract = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      token: z.string().uuid(),
      signer_name: z.string().min(1).max(120),
      signer_email: z.string().email(),
      signature_data: z.string().min(20).max(2_000_000),
      accepted_terms: z.literal(true),
    }).parse(d))
  .handler(async ({ data }) => {
    const { data: contract } = await supabaseAdmin
      .from("contracts").select("id, status").eq("access_token", data.token).maybeSingle();
    if (!contract) throw new Error("Contract niet gevonden");
    if (contract.status === "signed") throw new Error("Contract is al ondertekend");
    if (contract.status === "cancelled") throw new Error("Contract is geannuleerd");

    const ip = getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ua = getRequestHeader("user-agent") ?? null;

    await supabaseAdmin.from("contract_signatures").insert({
      contract_id: contract.id,
      signer_name: data.signer_name,
      signer_email: data.signer_email,
      signature_data: data.signature_data,
      ip_address: ip,
      user_agent: ua,
    });

    const signedAt = new Date().toISOString();
    await supabaseAdmin.from("contracts").update({
      status: "signed",
      signed_at: signedAt,
      signer_name: data.signer_name,
      signer_email: data.signer_email,
    }).eq("id", contract.id);

    await supabaseAdmin.from("contract_events").insert({
      contract_id: contract.id, event_type: "signed",
      actor_email: data.signer_email, ip,
    });

    // Activeer alle gekoppelde dienst-contracten
    const { data: links } = await supabaseAdmin
      .from("contract_service_contracts")
      .select("service_contract_id")
      .eq("contract_id", contract.id);
    const ids = (links ?? []).map((l) => l.service_contract_id);
    if (ids.length > 0) {
      await supabaseAdmin.from("service_contracts")
        .update({ status: "active" })
        .in("id", ids);
    }

    return { ok: true };
  });

export const downloadSignedPdfByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: contract } = await supabaseAdmin
      .from("contracts").select("pdf_path, status").eq("access_token", data.token).maybeSingle();
    if (!contract?.pdf_path) throw new Error("PDF niet beschikbaar");
    const { data: signed, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(contract.pdf_path, 600);
    if (error || !signed) throw new Error("Download mislukt");
    return { url: signed.signedUrl };
  });
