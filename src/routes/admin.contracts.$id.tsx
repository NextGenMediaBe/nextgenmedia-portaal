import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Send, Ban, Trash2, Copy, ArrowLeft, FileText, Download, Printer, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { adminGetContract, adminSendContract, adminCancelContract, adminDeleteContract, STATUS_COLORS, STATUS_LABELS, type SigningStatus } from "@/lib/contract-docs.functions";
import { adminDownloadConfirmation, adminResendContract } from "@/lib/contract-sign.functions";
import { generateSocialPlan } from "@/lib/social-automation.functions";
import { SERVICE_LABELS, type ServiceSlug } from "@/lib/services.functions";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/admin/contracts/$id")({ component: ContractDetail });

function ContractDetail() {
  const { id } = Route.useParams();
  const fn = useServerFn(adminGetContract);
  const send = useServerFn(adminSendContract);
  const cancel = useServerFn(adminCancelContract);
  const del = useServerFn(adminDeleteContract);
  const downloadSigned = useServerFn(adminDownloadConfirmation);
  const resend = useServerFn(adminResendContract);
  const genPlan = useServerFn(generateSocialPlan);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["contract", id], queryFn: () => fn({ data: { id } }) });
  const [busy, setBusy] = useState(false);

  if (isLoading) return <div className="p-10"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  if (!data) return <div className="p-10">Niet gevonden</div>;
  const { contract, links, events, signature, pdfUrl } = data;
  const tokenUrl = typeof window !== "undefined" ? `${window.location.origin}/sign/${contract.access_token}` : "";

  const refresh = () => qc.invalidateQueries({ queryKey: ["contract", id] });

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-6 max-w-5xl">
      <Link to="/admin/contracts" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Terug</Link>
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">{contract.title}</h1>
          <div className="text-sm text-muted-foreground mt-1">Klant: {contract.clients?.company_name ?? "—"}</div>
          <span className={`inline-block mt-2 px-2 py-1 rounded text-[10px] uppercase tracking-wider font-semibold ${STATUS_COLORS[contract.status as SigningStatus]}`}>
            {STATUS_LABELS[contract.status as SigningStatus]}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {contract.status === "draft" && (
            <button disabled={busy} onClick={async () => {
              setBusy(true); try { await send({ data: { id } }); await navigator.clipboard.writeText(tokenUrl).catch(() => null); toast.success("Verzonden + link gekopieerd"); refresh(); } finally { setBusy(false); }
            }} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"><Send className="h-4 w-4" /> Verzend</button>
          )}
          {(contract.status === "sent" || contract.status === "viewed") && (
            <>
              <button onClick={() => { navigator.clipboard.writeText(tokenUrl); toast.success("Link gekopieerd"); }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm"><Copy className="h-4 w-4" /> Kopieer link</button>
              <button disabled={busy} onClick={async () => {
                setBusy(true);
                try { await resend({ data: { id } }); await navigator.clipboard.writeText(tokenUrl).catch(() => null); toast.success("Opnieuw verzonden"); refresh(); }
                catch (e) { toast.error(e instanceof Error ? e.message : "Mislukt"); }
                finally { setBusy(false); }
              }} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm"><RotateCw className="h-4 w-4" /> Opnieuw verzenden</button>
            </>
          )}
          {contract.status === "signed" && (
            <button disabled={busy} onClick={async () => {
              setBusy(true);
              try {
                const r = await downloadSigned({ data: { contractId: id } });
                window.open(r.url, "_blank");
              } catch (e) { toast.error(e instanceof Error ? e.message : "Download mislukt"); }
              finally { setBusy(false); }
            }} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"><Download className="h-4 w-4" /> Download getekende PDF</button>
          )}
          {contract.status === "signed" && pdfUrl && (
            <button onClick={() => window.open(pdfUrl, "_blank")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm"><Printer className="h-4 w-4" /> Afdrukken</button>
          )}
          {contract.status !== "signed" && contract.status !== "cancelled" && (
            <button onClick={async () => { await cancel({ data: { id } }); toast.success("Geannuleerd"); refresh(); }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-500/40 text-amber-400 text-sm"><Ban className="h-4 w-4" /> Annuleer</button>
          )}
          <button onClick={async () => {
            if (!confirm("Definitief verwijderen?")) return;
            await del({ data: { id } }); toast.success("Verwijderd"); history.back();
          }} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-destructive/40 text-destructive text-sm"><Trash2 className="h-4 w-4" /> Verwijderen</button>
        </div>
      </header>

      <div className="grid lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 rounded-xl border border-border bg-card overflow-hidden">
          {pdfUrl ? (
            <iframe src={pdfUrl} className="w-full h-[800px]" title="Contract PDF" />
          ) : (
            <div className="p-12 text-center text-muted-foreground"><FileText className="h-8 w-8 mx-auto mb-2" /> Geen PDF beschikbaar</div>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-display font-semibold mb-3">Gekoppelde diensten</h3>
            {links.length === 0 ? <p className="text-sm text-muted-foreground">Geen diensten gekoppeld.</p> : (
              <ul className="space-y-2">
                {links.map((l: any) => l.service_contracts && (
                  <li key={l.service_contract_id} className="text-sm">
                    <div className="font-medium">{SERVICE_LABELS[l.service_contracts.service_slug as ServiceSlug] ?? l.service_contracts.service_slug}</div>
                    <div className="text-xs text-muted-foreground">{l.service_contracts.model} · {l.service_contracts.status}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {contract.status === "signed" && links.some((l: any) => l.service_contracts?.service_slug === "social-media") && (
            <section className="rounded-xl border border-primary/40 bg-primary/5 p-5">
              <h3 className="font-display font-semibold mb-2 flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Social Media automation</h3>
              <p className="text-xs text-muted-foreground mb-3">Genereert een maand contentplan (reels, posts, stories) en zet deze klaar ter goedkeuring voor de klant.</p>
              <button
                disabled={busy}
                onClick={async () => {
                  const link = links.find((l: any) => l.service_contracts?.service_slug === "social-media");
                  if (!link) return;
                  setBusy(true);
                  try {
                    const r = await genPlan({ data: { serviceContractId: link.service_contract_id } });
                    toast.success(`${r.created} items aangemaakt`);
                  } catch (e) { toast.error(e instanceof Error ? e.message : "Generatie mislukt"); }
                  finally { setBusy(false); }
                }}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" /> Genereer contentplan
              </button>
            </section>
          )}

          {signature && (
            <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
              <h3 className="font-display font-semibold mb-2 text-emerald-400">Ondertekend</h3>
              <div className="text-sm space-y-1">
                <div><span className="text-muted-foreground">Door:</span> {signature.signer_name}</div>
                <div><span className="text-muted-foreground">Email:</span> {signature.signer_email}</div>
                <div><span className="text-muted-foreground">Op:</span> {new Date(signature.signed_at).toLocaleString("nl-BE")}</div>
                {signature.ip_address && <div className="text-xs text-muted-foreground">IP: {signature.ip_address}</div>}
              </div>
              {signature.signature_data && <img src={signature.signature_data} alt="Handtekening" className="mt-3 max-h-24 bg-white rounded" />}
            </section>
          )}

          {contract.signer_data && Object.keys(contract.signer_data as Record<string, unknown>).length > 0 && (
            <section className="rounded-xl border border-border bg-card p-5">
              <h3 className="font-display font-semibold mb-3">Klantgegevens</h3>
              <dl className="text-sm space-y-1.5">
                {Object.entries(contract.signer_data as Record<string, string>).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</dt>
                    <dd className="text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-display font-semibold mb-3">Activiteit</h3>
            <ul className="space-y-2 text-xs">
              {events.map((e: any) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <span className="font-medium">{e.event_type}</span>
                  <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString("nl-BE")}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
