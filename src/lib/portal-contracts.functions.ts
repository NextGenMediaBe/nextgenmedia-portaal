import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BUCKET = "contracts";

export const myContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id, company_name")
      .eq("owner_user_id", context.userId)
      .maybeSingle();
    if (!client) return { contracts: [] };

    const { data: rows } = await supabaseAdmin
      .from("contracts")
      .select("id, title, status, created_at, sent_at, signed_at, access_token, pdf_path, signed_pdf_path")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false });

    return { contracts: rows ?? [] };
  });

export const myDownloadContractUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: client } = await supabaseAdmin
      .from("clients").select("id").eq("owner_user_id", context.userId).maybeSingle();
    if (!client) throw new Error("Geen klantprofiel gekoppeld");
    const { data: c } = await supabaseAdmin
      .from("contracts")
      .select("client_id, pdf_path, signed_pdf_path, confirmation_pdf_path")
      .eq("id", data.id)
      .maybeSingle();
    if (!c || c.client_id !== client.id) throw new Error("Niet gevonden");
    const path = c.signed_pdf_path || c.confirmation_pdf_path || c.pdf_path;
    if (!path) throw new Error("PDF niet beschikbaar");
    const { data: signed, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 600);
    if (error || !signed) throw new Error("Download mislukt");
    return { url: signed.signedUrl };
  });
