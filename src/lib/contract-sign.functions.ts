import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequestHeader } from "@tanstack/react-start/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const BUCKET = "contracts";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role")
    .eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Alleen admins");
}

// ===== Public: submit signature with fixed fields =====
const SignSchema = z.object({
  token: z.string().uuid(),
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().min(4).max(40),
  address: z.string().trim().min(3).max(300),
  vat_number: z.string().trim().min(2).max(40),
  date: z.string().trim().min(4).max(40),
  signature_data: z.string().min(20).max(2_000_000),
  accepted_terms: z.literal(true),
});

export const submitClientSignature = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SignSchema.parse(d))
  .handler(async ({ data }) => {
    const { data: contract } = await supabaseAdmin
      .from("contracts")
      .select("id, status, client_id, title, pdf_path")
      .eq("access_token", data.token)
      .maybeSingle();
    if (!contract) throw new Error("Contract niet gevonden");
    if (contract.status === "signed") throw new Error("Al ondertekend");
    if (contract.status === "cancelled") throw new Error("Geannuleerd");

    const ip = getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ua = getRequestHeader("user-agent") ?? null;
    const signedAt = new Date();
    const fullName = `${data.first_name} ${data.last_name}`.trim();
    const ref = `NGM-${contract.id.slice(0, 8).toUpperCase()}`;

    // ===== Generate confirmation PDF =====
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const page = pdfDoc.addPage([595, 842]); // A4
    const { width, height } = page.getSize();
    const margin = 50;
    let y = height - margin;

    const draw = (text: string, opts: { size?: number; font?: typeof font; color?: ReturnType<typeof rgb>; x?: number } = {}) => {
      page.drawText(text, {
        x: opts.x ?? margin,
        y,
        size: opts.size ?? 11,
        font: opts.font ?? font,
        color: opts.color ?? rgb(0.1, 0.1, 0.1),
      });
    };

    // Header
    draw("NextGenMedia", { size: 10, color: rgb(0.55, 0.45, 0), font: bold });
    y -= 22;
    draw("Ondertekend Contract — Bevestiging", { size: 18, font: bold });
    y -= 14;
    draw(`Referentie: ${ref}`, { size: 9, color: rgb(0.4, 0.4, 0.4) });
    y -= 28;
    page.drawLine({ start: { x: margin, y: y + 8 }, end: { x: width - margin, y: y + 8 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });

    draw("Contract", { size: 12, font: bold });
    y -= 16;
    draw(contract.title);
    y -= 24;

    draw("Klantgegevens", { size: 12, font: bold });
    y -= 18;
    const rows: Array<[string, string]> = [
      ["Voornaam", data.first_name],
      ["Familienaam", data.last_name],
      ["E-mail", data.email],
      ["Telefoon", data.phone],
      ["Adres", data.address],
      ["BTW-nummer", data.vat_number],
      ["Datum", data.date],
    ];
    for (const [k, v] of rows) {
      draw(`${k}:`, { font: bold, size: 10 });
      draw(v, { x: margin + 110, size: 10 });
      y -= 16;
    }

    y -= 14;
    draw("Ondertekening", { size: 12, font: bold });
    y -= 16;
    draw(`Ondertekend door: ${fullName}`, { size: 10 });
    y -= 14;
    draw(`Tijdstip: ${signedAt.toLocaleString("nl-BE")}`, { size: 10 });
    y -= 14;
    draw(`IP: ${ip ?? "—"}`, { size: 9, color: rgb(0.5, 0.5, 0.5) });
    y -= 24;

    // Signature image
    try {
      const base64 = data.signature_data.split(",")[1] ?? data.signature_data;
      const imgBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const img = await pdfDoc.embedPng(imgBytes);
      const sigBoxW = 220;
      const sigBoxH = 90;
      const scale = Math.min(sigBoxW / img.width, sigBoxH / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      page.drawRectangle({
        x: margin, y: y - sigBoxH, width: sigBoxW, height: sigBoxH,
        borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 0.5,
      });
      page.drawImage(img, {
        x: margin + (sigBoxW - drawW) / 2,
        y: y - sigBoxH + (sigBoxH - drawH) / 2,
        width: drawW, height: drawH,
      });
      y -= sigBoxH + 8;
      draw("Handtekening", { size: 8, color: rgb(0.5, 0.5, 0.5) });
      y -= 22;
    } catch {
      y -= 10;
    }

    y -= 6;
    draw("Akkoordverklaring", { size: 12, font: bold });
    y -= 16;
    const terms = [
      "Ik verklaar dat ik akkoord ga met de algemene voorwaarden,",
      "privacyverklaring en de inhoud van dit contract.",
      "Ik begrijp dat deze digitale ondertekening juridisch bindend is.",
    ];
    for (const line of terms) { draw(line, { size: 10 }); y -= 14; }

    // Footer
    page.drawLine({ start: { x: margin, y: 60 }, end: { x: width - margin, y: 60 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
    page.drawText(`NextGenMedia • ${ref} • ${signedAt.toISOString()}`, {
      x: margin, y: 46, size: 8, font, color: rgb(0.5, 0.5, 0.5),
    });

    const pdfBytes = await pdfDoc.save();
    const confirmationPath = `${contract.client_id}/confirmation-${contract.id}.pdf`;
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(confirmationPath, pdfBytes, {
      contentType: "application/pdf", upsert: true,
    });
    if (upErr) throw new Error(`Opslaan bevestiging mislukt: ${upErr.message}`);

    // Persist signature
    await supabaseAdmin.from("contract_signatures").insert({
      contract_id: contract.id,
      signer_name: fullName,
      signer_email: data.email,
      signature_data: data.signature_data,
      ip_address: ip,
      user_agent: ua,
    });

    await supabaseAdmin.from("contracts").update({
      status: "signed",
      signed_at: signedAt.toISOString(),
      signer_name: fullName,
      signer_email: data.email,
      signer_data: {
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        phone: data.phone,
        address: data.address,
        vat_number: data.vat_number,
        date: data.date,
        reference: ref,
      },
      confirmation_pdf_path: confirmationPath,
    }).eq("id", contract.id);

    await supabaseAdmin.from("contract_events").insert({
      contract_id: contract.id, event_type: "signed",
      actor_email: data.email, ip,
    });

    // Activate linked service-contracts
    const { data: links } = await supabaseAdmin
      .from("contract_service_contracts")
      .select("service_contract_id").eq("contract_id", contract.id);
    const ids = (links ?? []).map((l) => l.service_contract_id);
    if (ids.length > 0) {
      await supabaseAdmin.from("service_contracts").update({ status: "active" }).in("id", ids);
    }

    return { ok: true, reference: ref };
  });

// ===== Download confirmation PDF (public via token) =====
export const downloadConfirmationByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: contract } = await supabaseAdmin
      .from("contracts").select("confirmation_pdf_path")
      .eq("access_token", data.token).maybeSingle();
    if (!contract?.confirmation_pdf_path) throw new Error("Bevestiging niet beschikbaar");
    const { data: signed, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(contract.confirmation_pdf_path, 600);
    if (error || !signed) throw new Error("Download mislukt");
    return { url: signed.signedUrl };
  });

// ===== Admin: download confirmation =====
export const adminDownloadConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ contractId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: contract } = await supabaseAdmin
      .from("contracts").select("confirmation_pdf_path, pdf_path")
      .eq("id", data.contractId).maybeSingle();
    const path = contract?.confirmation_pdf_path ?? contract?.pdf_path;
    if (!path) throw new Error("Bevestiging niet beschikbaar");
    const { data: signed, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 600);
    if (error || !signed) throw new Error("Download mislukt");
    return { url: signed.signedUrl };
  });

// ===== Admin: resend signing request (regenerate token + mark sent) =====
export const adminResendContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: row } = await supabaseAdmin
      .from("contracts").select("status, access_token").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Niet gevonden");
    if (row.status === "signed") throw new Error("Al ondertekend");
    await supabaseAdmin.from("contracts").update({
      status: "sent", sent_at: new Date().toISOString(),
    }).eq("id", data.id);
    await supabaseAdmin.from("contract_events").insert({ contract_id: data.id, event_type: "sent" });
    return { ok: true, access_token: row.access_token };
  });
