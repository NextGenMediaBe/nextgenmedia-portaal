import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2, Upload, FileText } from "lucide-react";
import { toast } from "sonner";
import { listClients } from "@/lib/clients.functions";
import { adminListClientServiceContracts, adminUploadContract } from "@/lib/contract-docs.functions";
import { SERVICE_LABELS, type ServiceSlug } from "@/lib/services.functions";
import { z } from "zod";

const searchSchema = z.object({ client: z.string().uuid().optional(), serviceContract: z.string().uuid().optional() });

export const Route = createFileRoute("/admin/contracts/new")({
  component: NewContract,
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [{ title: "Nieuw contract — NextGenMedia" }] }),
});

function NewContract() {
  const nav = useNavigate();
  const { client: preselectedClient, serviceContract } = useSearch({ from: "/admin/contracts/new" });
  const listClientsFn = useServerFn(listClients);
  const listServices = useServerFn(adminListClientServiceContracts);
  const upload = useServerFn(adminUploadContract);

  const { data: clients } = useQuery({ queryKey: ["clients-min"], queryFn: () => listClientsFn() });
  const [clientId, setClientId] = useState(preselectedClient ?? "");
  const [title, setTitle] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: services } = useQuery({
    queryKey: ["admin-client-services", clientId],
    queryFn: () => listServices({ data: { clientId } }),
    enabled: !!clientId,
  });

  useEffect(() => {
    if (serviceContract && services?.items?.some((s) => s.id === serviceContract)) {
      setServiceIds((ids) => (ids.includes(serviceContract) ? ids : [serviceContract]));
    }
  }, [serviceContract, services?.items]);

  const toggle = (id: string) => setServiceIds((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  const submit = async () => {
    if (!clientId || !title || !signerName || !signerEmail || !file || serviceIds.length === 0) {
      toast.error("Vul alles in"); return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("pdf", file);
      fd.set("meta", JSON.stringify({ client_id: clientId, title, signer_name: signerName, signer_email: signerEmail, service_contract_ids: serviceIds }));
      const r = await upload({ data: fd });
      toast.success("Contract aangemaakt");
      nav({ to: "/admin/contracts/$id", params: { id: r.id } });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Mislukt"); } finally { setBusy(false); }
  };

  const inp = "w-full bg-background border border-border rounded-lg px-3.5 py-2.5 text-sm";
  const lbl = "text-xs uppercase tracking-wider text-muted-foreground mb-1.5 block font-medium";

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-3xl space-y-6">
      <header>
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-2 font-semibold">Admin</div>
        <h1 className="font-display text-4xl font-bold">Nieuw contract</h1>
        <p className="text-muted-foreground mt-1 text-sm">Upload de PDF, kies welke dienst-contracten erin zitten en stuur naar de klant.</p>
      </header>

      <div className="space-y-5 rounded-xl border border-border bg-card p-6">
        <div>
          <label className={lbl}>Klant</label>
          <select className={inp} value={clientId} onChange={(e) => { setClientId(e.target.value); setServiceIds([]); }}>
            <option value="">— kies een klant —</option>
            {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className={lbl}>Titel</label><input className={inp} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dienstverleningsovereenkomst" /></div>
          <div><label className={lbl}>Naam ondertekenaar</label><input className={inp} value={signerName} onChange={(e) => setSignerName(e.target.value)} /></div>
        </div>
        <div><label className={lbl}>Email ondertekenaar</label><input type="email" className={inp} value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} /></div>

        {clientId && (
          <div>
            <label className={lbl}>Welke dienst-contracten dekt deze PDF? (meerdere mogelijk)</label>
            {!services?.items?.length ? (
              <p className="text-sm text-muted-foreground">Deze klant heeft nog geen dienst-contracten.</p>
            ) : (
              <div className="space-y-2">
                {services.items.map((s) => {
                  const active = serviceIds.includes(s.id);
                  return (
                    <label key={s.id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${active ? "border-primary bg-primary/5" : "border-border"}`}>
                      <input type="checkbox" className="mt-1" checked={active} onChange={() => toggle(s.id)} />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{SERVICE_LABELS[s.service_slug as ServiceSlug] ?? s.service_slug}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.model} · status: {s.status}
                          {s.monthly_fee != null && ` · €${s.monthly_fee}/m`}
                          {s.setup_fee != null && ` · setup €${s.setup_fee}`}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div>
          <label className={lbl}>PDF-bestand</label>
          <label className="flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-border hover:border-primary/40 cursor-pointer">
            <Upload className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1 text-sm">
              {file ? <span className="font-medium">{file.name}</span> : <span className="text-muted-foreground">Klik om PDF te selecteren (max 20MB)</span>}
            </div>
            <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        </div>

        <div className="flex justify-end">
          <button onClick={submit} disabled={busy} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Contract aanmaken
          </button>
        </div>
      </div>
    </div>
  );
}
