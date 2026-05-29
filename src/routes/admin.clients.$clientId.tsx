import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getClientDetail, updateClient, deleteClient, resetClientPassword } from "@/lib/clients.functions";
import { Loader2, Pencil, Trash2, AlertTriangle, Globe, X, KeyRound, Layers, FileText, Plus, Calendar, BookOpen, Sparkles, Mic, Download } from "lucide-react";
import { listClientServices, setClientServices, SERVICE_SLUGS, SERVICE_LABELS, type ServiceSlug } from "@/lib/services.functions";
import { listClientContracts, upsertContract, deleteContract, CONTRACT_MODEL_LABELS, CONTRACT_STATUSES, defaultModelForService, type ContractRow, type UpsertContractInput } from "@/lib/contracts.functions";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { adminCreateSocialContent, adminListSocialContent, adminUpdateSocialContentStatus, adminUpdateSocialContent, adminDeleteSocialContent, type SocialContentItem } from "@/lib/social-content.functions";
import { getSocialIntake, saveSocialIntake, listClientTasks, createClientTask, deleteClientTask } from "@/lib/social-intake.functions";
import { generateSocialPlan } from "@/lib/social-automation.functions";
import { ContentCalendar } from "@/components/content-calendar";


export const Route = createFileRoute("/admin/clients/$clientId")({ component: ClientDetail });

type ClientRow = {
  id: string; company_name: string; niche: string; website_url: string | null;
  platforms: string[] | null; posts_per_month: number; reels_per_month: number; stories_per_month: number;
  contract_months: number; contract_start: string; contract_end: string;
  live_start_date: string | null; archived: boolean;
};

type SocialContentPayload = {
  clientId: string;
  planned_date: string;
  platform: string;
  content_type: string;
  title: string;
  caption?: string;
  script?: string;
  media_notes?: string;
  status: "draft" | "ready_for_review" | "approved" | "changes_requested" | "scheduled" | "published";
};

function ClientDetail() {
  const { clientId } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const fn = useServerFn(getClientDetail);
  const { data, isLoading } = useQuery({ queryKey: ["client", clientId], queryFn: () => fn({ data: { clientId } }) });

  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  if (isLoading) return <div className="p-10 flex items-center gap-3 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Laden…</div>;
  if (!data?.client) return <div className="p-10">Klant niet gevonden.</div>;
  const client = data.client as ClientRow;

  const daysToEnd = client.contract_end ? Math.ceil((new Date(client.contract_end).getTime() - Date.now()) / 86400000) : null;
  const renewalDue = daysToEnd !== null && daysToEnd <= 14;

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-8">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-2 font-semibold">Klant</div>
          <h1 className="font-display text-4xl font-bold">{client.company_name}</h1>
          <div className="text-muted-foreground mt-1">{client.niche}</div>
          {client.website_url && (
            <a href={client.website_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mt-2">
              <Globe className="h-3 w-3" /> {client.website_url}
            </a>
          )}
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {(client.platforms ?? []).map((p) => <span key={p} className="px-2 py-1 rounded bg-secondary uppercase font-medium">{p}</span>)}
            <span className="px-2 py-1 rounded bg-secondary">{client.contract_months} maanden contract</span>
            <span className="px-2 py-1 rounded bg-primary/15 font-medium">t/m {client.contract_end}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/admin/contracts/new" search={{ client: client.id } as never} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 text-sm font-semibold">
            <FileText className="h-4 w-4" /> Nieuw contract
          </Link>
          <button onClick={() => setPwOpen(true)} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border hover:bg-secondary text-sm">
            <KeyRound className="h-4 w-4" /> Wachtwoord
          </button>
          <button onClick={() => setEditOpen(true)} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border hover:bg-secondary text-sm">
            <Pencil className="h-4 w-4" /> Bewerken
          </button>
          <button onClick={() => setDelOpen(true)} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 text-sm">
            <Trash2 className="h-4 w-4" /> Verwijderen
          </button>
        </div>
      </header>

      {renewalDue && (
        <div className="rounded-xl border border-primary bg-primary/10 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Contract verloopt binnenkort</div>
            <div className="text-sm text-muted-foreground">
              {daysToEnd! < 0 ? `Verlopen sinds ${Math.abs(daysToEnd!)} dag(en).` : `Nog ${daysToEnd} dag(en) tot ${client.contract_end}.`}
            </div>
          </div>
        </div>
      )}

      <ServicesSection clientId={clientId} />
      <ContractsSection clientId={clientId} />
      <SocialIntakeSection clientId={clientId} />
      <ShootSchedulingSection clientId={clientId} />
      <SocialContentAdminSection clientId={clientId} />


      {editOpen && <EditClientDrawer client={client} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); qc.invalidateQueries({ queryKey: ["client", clientId] }); }} />}
      {delOpen && <DeleteClientDialog client={client} onClose={() => setDelOpen(false)} onDeleted={() => { qc.invalidateQueries({ queryKey: ["clients"] }); nav({ to: "/admin/clients" }); }} />}
      {pwOpen && <PasswordResetDialog clientId={clientId} onClose={() => setPwOpen(false)} />}
    </div>
  );
}

const PLATFORMS = [
  { id: "meta", label: "Meta (FB + IG)" }, { id: "linkedin", label: "LinkedIn" },
  { id: "tiktok", label: "TikTok" }, { id: "pinterest", label: "Pinterest" }, { id: "twitter", label: "Twitter / X" },
];

function EditClientDrawer({ client, onClose, onSaved }: { client: ClientRow; onClose: () => void; onSaved: () => void }) {
  const fn = useServerFn(updateClient);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    company_name: client.company_name, niche: client.niche,
    website_url: client.website_url ?? "", platforms: client.platforms ?? [],
    posts_per_month: client.posts_per_month, reels_per_month: client.reels_per_month, stories_per_month: client.stories_per_month,
    contract_months: client.contract_months as 3 | 6 | 12,
    live_start_date: (client.live_start_date ?? client.contract_start ?? "").slice(0, 7),
  });
  const togglePlatform = (id: string) => setForm((f) => ({ ...f, platforms: f.platforms.includes(id) ? f.platforms.filter((p) => p !== id) : [...f.platforms, id] }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await fn({ data: { clientId: client.id, ...form } as any });
      toast.success("Bijgewerkt"); onSaved();
    } catch (err) { toast.error((err as Error).message); } finally { setSaving(false); }
  };
  const input = "w-full bg-background border border-border rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-foreground";
  const label = "text-xs uppercase tracking-wider text-muted-foreground mb-1.5 block font-medium";
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button onClick={onClose} className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" />
      <form onSubmit={submit} className="relative w-full max-w-xl h-full bg-background border-l border-border overflow-y-auto">
        <div className="sticky top-0 z-10 bg-background border-b border-border p-5 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Klant bewerken</h2>
          <button type="button" onClick={onClose} className="h-9 w-9 grid place-items-center rounded-lg hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div><label className={label}>Bedrijfsnaam</label><input className={input} value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
            <div><label className={label}>Niche</label><input className={input} value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} /></div>
          </div>
          <div><label className={label}>Website</label><input className={input} value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} /></div>
          <div>
            <label className={label}>Platforms</label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => {
                const active = form.platforms.includes(p.id);
                return <button type="button" key={p.id} onClick={() => togglePlatform(p.id)} className={`px-3 py-1.5 rounded-lg text-sm border ${active ? "bg-foreground text-background border-foreground" : "border-border"}`}>{p.label}</button>;
              })}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {(["reels_per_month", "posts_per_month", "stories_per_month"] as const).map((k) => (
              <div key={k}><label className={label}>{k.split("_")[0]}/maand</label>
                <input type="number" min={0} className={input} value={form[k]} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} /></div>
            ))}
          </div>
          <div><label className={label}>Startmaand</label><input type="month" className={input} value={form.live_start_date} onChange={(e) => setForm({ ...form, live_start_date: e.target.value })} /></div>
          <div>
            <label className={label}>Contractduur</label>
            <div className="flex gap-2">
              {[3, 6, 12].map((m) => (
                <button type="button" key={m} onClick={() => setForm({ ...form, contract_months: m as 3 | 6 | 12 })} className={`flex-1 px-4 py-2.5 rounded-lg border text-sm ${form.contract_months === m ? "bg-foreground text-background border-foreground" : "border-border"}`}>{m} maanden</button>
              ))}
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 bg-background border-t border-border p-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg border border-border text-sm">Annuleer</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-60 text-sm">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Opslaan
          </button>
        </div>
      </form>
    </div>
  );
}

function DeleteClientDialog({ client, onClose, onDeleted }: { client: ClientRow; onClose: () => void; onDeleted: () => void }) {
  const del = useServerFn(deleteClient);
  const [confirm, setConfirm] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try { await del({ data: { clientId: client.id, confirmName: confirm } }); toast.success("Verwijderd"); onDeleted(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button onClick={onClose} className="absolute inset-0 bg-foreground/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-md bg-background rounded-xl border border-border p-6">
        <h3 className="font-display text-xl font-bold">Klant verwijderen</h3>
        <p className="text-sm text-muted-foreground mt-1">Verwijdert {client.company_name} en het login-account. Niet ongedaan te maken.</p>
        <label className="text-xs uppercase tracking-wider text-muted-foreground mt-4 mb-1.5 block font-medium">Typ ter bevestiging: {client.company_name}</label>
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full bg-background border border-border rounded-lg px-3.5 py-2.5 text-sm" placeholder={client.company_name} />
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-border text-sm">Annuleer</button>
          <button onClick={submit} disabled={busy || confirm.trim().toLowerCase() !== client.company_name.trim().toLowerCase()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-destructive text-destructive-foreground font-semibold disabled:opacity-50 text-sm">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Verwijderen
          </button>
        </div>
      </div>
    </div>
  );
}

function PasswordResetDialog({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const fn = useServerFn(resetClientPassword);
  const [pw, setPw] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (pw.length < 8) { toast.error("Min 8 tekens"); return; }
    setBusy(true);
    try { await fn({ data: { clientId, newPassword: pw } }); toast.success("Gewijzigd"); onClose(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <button onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md bg-background rounded-xl border border-border p-6">
        <h3 className="font-display text-xl font-bold mb-3">Nieuw wachtwoord</h3>
        <input type="text" className="w-full bg-input border border-border rounded-lg px-3 py-2.5 text-sm" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Min 8 tekens" />
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-border text-sm">Annuleer</button>
          <button onClick={submit} disabled={busy} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-60 text-sm">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Instellen
          </button>
        </div>
      </div>
    </div>
  );
}

function ServicesSection({ clientId }: { clientId: string }) {
  const listFn = useServerFn(listClientServices);
  const setFn = useServerFn(setClientServices);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["client-services", clientId], queryFn: () => listFn({ data: { clientId } }) });
  const [pending, setPending] = useState<Record<ServiceSlug, { active: boolean; maintenance_included: boolean }> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLoading && data && pending === null) {
      const init = Object.fromEntries(SERVICE_SLUGS.map((s) => {
        const row = data.services.find((r) => r.service_slug === s);
        return [s, { active: !!row, maintenance_included: row?.maintenance_included ?? false }];
      })) as Record<ServiceSlug, { active: boolean; maintenance_included: boolean }>;
      setPending(init);
    }
  }, [data, isLoading, pending]);

  const submit = async () => {
    if (!pending) return; setSaving(true);
    try {
      const services = SERVICE_SLUGS.filter((s) => pending[s].active).map((s) => ({
        service_slug: s, config: s === "webdesign" ? { maintenance_included: pending[s].maintenance_included } : {},
      }));
      await setFn({ data: { clientId, services } });
      toast.success("Diensten bijgewerkt");
      qc.invalidateQueries({ queryKey: ["client-services", clientId] });
      qc.invalidateQueries({ queryKey: ["contracts", clientId] });
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };

  return (
    <section className="ng-card p-6">
      <div className="flex items-center gap-2 mb-4"><Layers className="h-4 w-4 text-primary" /><h2 className="font-display font-semibold">Diensten</h2></div>
      {isLoading || !pending ? <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> Laden…</div> : (
        <>
          <div className="grid sm:grid-cols-2 gap-2">
            {SERVICE_SLUGS.map((slug) => (
              <label key={slug} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${pending[slug].active ? "border-primary bg-primary/5" : "border-border"}`}>
                <input type="checkbox" className="mt-1" checked={pending[slug].active}
                  onChange={(e) => setPending({ ...pending, [slug]: { ...pending[slug], active: e.target.checked } })} />
                <div className="flex-1">
                  <div className="text-sm font-medium">{SERVICE_LABELS[slug]}</div>
                  {slug === "webdesign" && pending[slug].active && (
                    <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" checked={pending[slug].maintenance_included}
                        onChange={(e) => setPending({ ...pending, webdesign: { ...pending.webdesign, maintenance_included: e.target.checked } })} />
                      Onderhoud inbegrepen
                    </label>
                  )}
                </div>
              </label>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={submit} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Diensten opslaan"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

const SOCIAL_STATUS_LABELS: Record<SocialContentItem["status"], string> = {
  draft: "Concept",
  ready_for_review: "Bij klant",
  approved: "Goedgekeurd",
  changes_requested: "Feedback",
  scheduled: "Ingepland",
  published: "Gepubliceerd",
};
const SOCIAL_STATUS_TONE: Record<SocialContentItem["status"], string> = {
  draft: "bg-secondary text-foreground",
  ready_for_review: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  changes_requested: "bg-destructive/15 text-destructive border-destructive/30",
  scheduled: "bg-primary/15 text-primary border-primary/30",
  published: "bg-foreground/10 text-foreground",
};

function SocialContentAdminSection({ clientId }: { clientId: string }) {
  const list = useServerFn(adminListSocialContent);
  const create = useServerFn(adminCreateSocialContent);
  const updateStatus = useServerFn(adminUpdateSocialContentStatus);
  const updateItem = useServerFn(adminUpdateSocialContent);
  const deleteItem = useServerFn(adminDeleteSocialContent);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-social-content", clientId], queryFn: () => list({ data: { clientId } }) });
  const [open, setOpen] = useState(false);
  const [prefillDate, setPrefillDate] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-social-content", clientId] });
  const items = ((data?.items ?? []) as SocialContentItem[]);

  return (
    <section className="ng-card p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" /><h3 className="font-display font-semibold">Social Media contentkalender</h3></div>
          <p className="text-xs text-muted-foreground mt-1">Sleep items naar een nieuwe dag, klik op een lege dag om content toe te voegen, of bewerk scripts en stuur door naar de klant.</p>
        </div>
        <button onClick={() => { setPrefillDate(null); setOpen(true); }} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground">
          <Plus className="h-4 w-4" /> Content toevoegen
        </button>
      </div>

      {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
        <ContentCalendar
          items={items}
          mode="admin"
          actions={{
            onUpdate: async (id, patch) => { await updateItem({ data: { id, ...patch } as never }); refresh(); },
            onMove: async (id, planned_date) => { await updateItem({ data: { id, planned_date } }); toast.success("Verplaatst"); refresh(); },
            onSetStatus: async (id, status) => { await updateStatus({ data: { id, status } }); refresh(); },
            onDelete: async (id) => { await deleteItem({ data: { id } }); toast.success("Verwijderd"); refresh(); },
            onCreateOnDay: (planned_date) => { setPrefillDate(planned_date); setOpen(true); },
          }}
        />
      )}
      {open && <SocialContentDialog clientId={clientId} initialDate={prefillDate} onClose={() => setOpen(false)} onSave={async (payload) => { await create({ data: payload }); toast.success("Content toegevoegd"); setOpen(false); refresh(); }} />}
    </section>
  );
}

function SocialContentDialog({ clientId, initialDate, onClose, onSave }: { clientId: string; initialDate?: string | null; onClose: () => void; onSave: (payload: SocialContentPayload) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    clientId,
    planned_date: initialDate || new Date().toISOString().slice(0, 10),
    platform: "instagram",
    content_type: "post",
    title: "",
    caption: "",
    script: "",
    media_notes: "",
    status: "draft" as const,
  });
  const inp = "w-full bg-background border border-border rounded-md px-3 py-2 text-sm";
  const label = "text-xs uppercase tracking-wider text-muted-foreground space-y-1";
  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h3 className="font-display font-semibold flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /> Content toevoegen</h3><button onClick={onClose}><X className="h-4 w-4" /></button></div>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className={label}>Datum<input type="date" className={inp} value={form.planned_date} onChange={(e) => setForm({ ...form, planned_date: e.target.value })} /></label>
          <label className={label}>Platform<select className={inp} value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="linkedin">LinkedIn</option><option value="pinterest">Pinterest</option><option value="twitter">Twitter / X</option></select></label>
          <label className={label}>Type<select className={inp} value={form.content_type} onChange={(e) => setForm({ ...form, content_type: e.target.value })}><option value="post">Post</option><option value="reel">Reel</option><option value="story">Story</option><option value="carousel">Carousel</option></select></label>
        </div>
        <label className={label}>Titel<input className={inp} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
        <label className={label}>Caption<textarea className={inp} rows={4} value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} /></label>
        <label className={label}>Script<textarea className={inp} rows={5} value={form.script} onChange={(e) => setForm({ ...form, script: e.target.value })} /></label>
        <label className={label}>Media-notities<textarea className={inp} rows={3} value={form.media_notes} onChange={(e) => setForm({ ...form, media_notes: e.target.value })} /></label>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded border border-border text-sm">Annuleer</button>
          <button disabled={saving || !form.title || !form.planned_date} onClick={async () => { setSaving(true); try { await onSave(form); } finally { setSaving(false); } }} className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {saving && <Loader2 className="h-3 w-3 animate-spin" />} Opslaan
          </button>
        </div>
      </div>
    </div>
  );
}

function ContractsSection({ clientId }: { clientId: string }) {
  const list = useServerFn(listClientContracts);
  const upsert = useServerFn(upsertContract);
  const remove = useServerFn(deleteContract);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["contracts", clientId], queryFn: () => list({ data: { clientId } }) });
  const [editing, setEditing] = useState<ContractRow | null>(null);
  const [newSlug, setNewSlug] = useState<ServiceSlug | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["contracts", clientId] });

  const existingSlugs = new Set((data?.contracts ?? []).map((c) => c.service_slug));
  const missingSlugs = SERVICE_SLUGS.filter((s) => !existingSlugs.has(s));

  return (
    <section className="ng-card p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-display font-semibold">Dienst-contracten</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {missingSlugs.length > 0 && (
            <select
              value=""
              onChange={(e) => { if (e.target.value) setNewSlug(e.target.value as ServiceSlug); }}
              className="text-xs bg-background border border-border rounded-md px-2.5 py-1.5"
            >
              <option value="">+ Nieuw dienst-contract…</option>
              {missingSlugs.map((s) => <option key={s} value={s}>{SERVICE_LABELS[s]}</option>)}
            </select>
          )}
          <Link to="/admin/contracts/new" search={{ client: clientId } as never} className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground inline-flex items-center gap-1.5 font-semibold">
            <FileText className="h-3 w-3" /> PDF uploaden
          </Link>
        </div>
      </div>
      {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      {!isLoading && (data?.contracts?.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground">Nog geen dienst-contracten. Activeer eerst diensten hierboven of voeg er handmatig één toe.</p>
      )}
      <div className="space-y-2">
        {data?.contracts?.map((c) => {
          const totalValue = contractTotalValue(c);
          const remaining = contractRemainingValue(c);
          return (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <div className="font-medium text-sm">{SERVICE_LABELS[c.service_slug]}</div>
                <div className="text-xs text-muted-foreground">
                  {CONTRACT_MODEL_LABELS[c.model]} · status: <span className={c.status === "active" ? "text-emerald-400" : c.status === "pending" ? "text-amber-400" : ""}>{c.status}</span>
                  {c.start_date && <> · start {c.start_date}</>}
                  {c.end_date && <> · einde {c.end_date}</>}
                  {c.monthly_fee != null && <> · €{c.monthly_fee}/m</>}
                  {c.setup_fee != null && <> · setup €{c.setup_fee}</>}
                </div>
                {(totalValue > 0 || remaining > 0) && (
                  <div className="text-[11px] text-primary/80 mt-1">
                    Contractwaarde €{totalValue.toLocaleString("nl-BE")} · resterend €{remaining.toLocaleString("nl-BE")}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Link to="/admin/contracts/new" search={{ client: clientId, serviceContract: c.id } as never} className="text-xs px-3 py-1.5 rounded border border-border inline-flex items-center gap-1">
                  <FileText className="h-3 w-3" /> PDF
                </Link>
                <button onClick={() => setEditing(c)} className="text-xs px-3 py-1.5 rounded border border-border">Bewerken</button>
                <button onClick={async () => {
                  if (!confirm("Verwijderen?")) return;
                  await remove({ data: { id: c.id } }); toast.success("Verwijderd"); refresh();
                }} className="text-xs px-3 py-1.5 rounded border border-destructive/40 text-destructive">Verwijder</button>
              </div>
            </div>
          );
        })}
      </div>
      {editing && <ContractEditor contract={editing} onClose={() => setEditing(null)}
        onSave={async (p) => { await upsert({ data: p }); toast.success("Opgeslagen"); setEditing(null); refresh(); }} />}
      {newSlug && <ContractEditor
        contract={{
          id: "", client_id: clientId, service_slug: newSlug,
          model: defaultModelForService(newSlug), status: "pending",
          start_date: null, end_date: null, renewal_reminder_at: null,
          setup_fee: null, monthly_fee: null, hourly_rate: null,
          hours_purchased: null, hours_used: null, config: {}, notes: null,
        }}
        onClose={() => setNewSlug(null)}
        onSave={async (p) => {
          const { id: _ignored, ...rest } = p;
          await upsert({ data: rest as UpsertContractInput });
          toast.success("Aangemaakt"); setNewSlug(null); refresh();
        }}
      />}
    </section>
  );
}

// ───────── Financial helpers ─────────
function monthsBetween(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const da = new Date(a), db = new Date(b);
  return (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth());
}
function contractTotalValue(c: ContractRow): number {
  const setup = Number(c.setup_fee ?? 0);
  const monthly = Number(c.monthly_fee ?? 0);
  const cfg = (c.config ?? {}) as Record<string, any>;
  if (c.service_slug === "social-media") {
    const months = Number(cfg.contract_months ?? 0) || monthsBetween(c.start_date, c.end_date) || 0;
    return setup + monthly * months;
  }
  if (c.service_slug === "webdesign") {
    return setup + Number(cfg.maintenance_yearly_fee ?? 0) + Number(cfg.hosting_yearly_fee ?? 0);
  }
  if (c.model === "consultancy_hours") {
    return Number(c.hourly_rate ?? 0) * Number(c.hours_purchased ?? 0);
  }
  return setup + monthly * (monthsBetween(c.start_date, c.end_date) || 0);
}
function contractRemainingValue(c: ContractRow): number {
  const total = contractTotalValue(c);
  if (c.service_slug === "social-media" && c.start_date && c.monthly_fee) {
    const cfg = (c.config ?? {}) as Record<string, any>;
    const months = Number(cfg.contract_months ?? 0) || monthsBetween(c.start_date, c.end_date) || 0;
    const elapsed = Math.min(months, Math.max(0, monthsBetween(c.start_date, new Date().toISOString().slice(0, 10)) || 0));
    return Math.max(0, total - Number(c.monthly_fee) * elapsed - Number(c.setup_fee ?? 0));
  }
  if (c.model === "consultancy_hours") {
    return Math.max(0, (Number(c.hours_purchased ?? 0) - Number(c.hours_used ?? 0)) * Number(c.hourly_rate ?? 0));
  }
  return total;
}

const DESIGN_ITEMS = [
  "Logo ontwerp", "Brand identity", "Social media templates", "Brochure",
  "Flyer", "Visitekaartjes", "Presentatie templates", "Menu design",
  "Packaging", "Website visuals", "Motion graphics", "Print design",
] as const;

function ContractEditor({ contract, onClose, onSave }: { contract: ContractRow; onClose: () => void; onSave: (p: UpsertContractInput) => Promise<void> }) {
  const [form, setForm] = useState({
    id: contract.id, client_id: contract.client_id, service_slug: contract.service_slug,
    model: contract.model, status: contract.status,
    start_date: contract.start_date, end_date: contract.end_date, renewal_reminder_at: contract.renewal_reminder_at,
    setup_fee: contract.setup_fee, monthly_fee: contract.monthly_fee, hourly_rate: contract.hourly_rate,
    hours_purchased: contract.hours_purchased, hours_used: contract.hours_used,
    config: (contract.config ?? {}) as Record<string, any>, notes: contract.notes,
  });
  const [saving, setSaving] = useState(false);
  const num = (v: string) => (v === "" ? null : Number(v));
  const inp = "w-full bg-background border border-border rounded-md px-3 py-2 text-sm";
  const slug = contract.service_slug;
  const cfg = form.config;
  const setCfg = (patch: Record<string, any>) => setForm({ ...form, config: { ...cfg, ...patch } });

  const onMonthsChange = (months: number) => {
    const start = form.start_date ? new Date(form.start_date) : new Date();
    const end = new Date(start); end.setMonth(end.getMonth() + months);
    setForm({
      ...form,
      config: { ...cfg, contract_months: months },
      end_date: end.toISOString().slice(0, 10),
      renewal_reminder_at: new Date(end.getTime() - 30 * 86400_000).toISOString().slice(0, 10),
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl border border-border w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold">Bewerken — {SERVICE_LABELS[slug]}</h3>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs">Status<select className={inp} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ContractRow["status"] })}>{CONTRACT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
          <label className="text-xs">Setup / project (€)<input type="number" min={0} className={inp} value={form.setup_fee ?? ""} onChange={(e) => setForm({ ...form, setup_fee: num(e.target.value) })} /></label>
        </div>

        {slug === "social-media" && (
          <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">Contract & start</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs">Startmaand<input type="date" className={inp} value={form.start_date ?? ""} onChange={(e) => setForm({ ...form, start_date: e.target.value || null })} /></label>
              <label className="text-xs">Duur<select className={inp} value={cfg.contract_months ?? ""} onChange={(e) => onMonthsChange(Number(e.target.value))}>
                <option value="">— kies —</option>
                <option value={3}>3 maanden</option>
                <option value={6}>6 maanden</option>
                <option value={12}>12 maanden</option>
              </select></label>
              <label className="text-xs col-span-2">Maandprijs (€)<input type="number" min={0} className={inp} value={form.monthly_fee ?? ""} onChange={(e) => setForm({ ...form, monthly_fee: num(e.target.value) })} /></label>
            </div>
            {form.monthly_fee && cfg.contract_months ? (
              <div className="text-xs text-muted-foreground">
                Totale contractwaarde: <span className="font-semibold text-foreground">€{(Number(form.monthly_fee) * Number(cfg.contract_months)).toLocaleString("nl-BE")}</span>
              </div>
            ) : null}
          </div>
        )}

        {slug === "webdesign" && (
          <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">Onderhoud & hosting</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs flex items-center gap-2 mt-5">
                <input type="checkbox" checked={!!cfg.maintenance_enabled} onChange={(e) => setCfg({ maintenance_enabled: e.target.checked })} />
                Onderhoud actief
              </label>
              <label className="text-xs">Onderhoud start<input type="date" className={inp} value={cfg.maintenance_start ?? ""} onChange={(e) => setCfg({ maintenance_start: e.target.value || null })} disabled={!cfg.maintenance_enabled} /></label>
              <label className="text-xs">Jaarlijks onderhoud (€)<input type="number" min={0} className={inp} value={cfg.maintenance_yearly_fee ?? ""} onChange={(e) => setCfg({ maintenance_yearly_fee: num(e.target.value) })} disabled={!cfg.maintenance_enabled} /></label>
              <label className="text-xs">Verlenging onderhoud<input type="date" className={inp} value={cfg.maintenance_renewal_at ?? ""} onChange={(e) => setCfg({ maintenance_renewal_at: e.target.value || null })} disabled={!cfg.maintenance_enabled} /></label>
              <label className="text-xs flex items-center gap-2 mt-5">
                <input type="checkbox" checked={!!cfg.hosting_enabled} onChange={(e) => setCfg({ hosting_enabled: e.target.checked })} />
                Hosting actief
              </label>
              <label className="text-xs">Hosting jaarprijs (€)<input type="number" min={0} className={inp} value={cfg.hosting_yearly_fee ?? ""} onChange={(e) => setCfg({ hosting_yearly_fee: num(e.target.value) })} disabled={!cfg.hosting_enabled} /></label>
              <label className="text-xs col-span-2">Hosting verlenging<input type="date" className={inp} value={cfg.hosting_renewal_at ?? ""} onChange={(e) => setCfg({ hosting_renewal_at: e.target.value || null })} disabled={!cfg.hosting_enabled} /></label>
            </div>
          </div>
        )}

        {slug === "grafisch-ontwerp" && (
          <div className="space-y-3 rounded-lg border border-border bg-background/30 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Project-scope (menu)</div>
            <div className="grid grid-cols-2 gap-2">
              {DESIGN_ITEMS.map((item) => {
                const selected: string[] = cfg.design_items ?? [];
                const on = selected.includes(item);
                return (
                  <label key={item} className={`flex items-center gap-2 text-xs p-2 rounded border cursor-pointer ${on ? "border-primary bg-primary/10" : "border-border"}`}>
                    <input type="checkbox" checked={on} onChange={() => setCfg({
                      design_items: on ? selected.filter((x) => x !== item) : [...selected, item],
                    })} />
                    {item}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {slug === "marketing-consultancy" && (
          <div className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-background/30 p-4">
            <label className="text-xs">Uurtarief (€)<input type="number" min={0} className={inp} value={form.hourly_rate ?? ""} onChange={(e) => setForm({ ...form, hourly_rate: num(e.target.value) })} /></label>
            <label className="text-xs">Uren gekocht<input type="number" min={0} className={inp} value={form.hours_purchased ?? ""} onChange={(e) => setForm({ ...form, hours_purchased: num(e.target.value) })} /></label>
            <label className="text-xs">Uren gebruikt<input type="number" min={0} className={inp} value={form.hours_used ?? ""} onChange={(e) => setForm({ ...form, hours_used: num(e.target.value) })} /></label>
          </div>
        )}

        {slug === "foto-video" && (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-background/30 p-4">
            <label className="text-xs">Shoot-uren<input type="number" min={0} className={inp} value={cfg.shoot_hours ?? ""} onChange={(e) => setCfg({ shoot_hours: num(e.target.value) })} /></label>
            <label className="text-xs">Editing kost (€)<input type="number" min={0} className={inp} value={cfg.editing_cost ?? ""} onChange={(e) => setCfg({ editing_cost: num(e.target.value) })} /></label>
            <label className="text-xs">Freelancer kost (€)<input type="number" min={0} className={inp} value={cfg.freelancer_cost ?? ""} onChange={(e) => setCfg({ freelancer_cost: num(e.target.value) })} /></label>
            <label className="text-xs">Projectdatum<input type="date" className={inp} value={form.start_date ?? ""} onChange={(e) => setForm({ ...form, start_date: e.target.value || null })} /></label>
          </div>
        )}

        {slug === "ads" && (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-background/30 p-4">
            <label className="text-xs">Maandretainer (€)<input type="number" min={0} className={inp} value={form.monthly_fee ?? ""} onChange={(e) => setForm({ ...form, monthly_fee: num(e.target.value) })} /></label>
            <label className="text-xs">Adspend budget/m (€)<input type="number" min={0} className={inp} value={cfg.ad_spend ?? ""} onChange={(e) => setCfg({ ad_spend: num(e.target.value) })} /></label>
          </div>
        )}

        <label className="text-xs block">Notities<textarea className={inp} rows={3} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value || null })} /></label>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded border border-border">Annuleer</button>
          <button disabled={saving} onClick={async () => { setSaving(true); try { await onSave(form); } finally { setSaving(false); } }}
            className="px-4 py-2 text-sm rounded bg-primary text-primary-foreground font-semibold inline-flex items-center gap-2 disabled:opacity-60">
            {saving && <Loader2 className="h-3 w-3 animate-spin" />} Opslaan
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────── Social Media intake (free text + voice + generate) ───────── */
function SocialIntakeSection({ clientId }: { clientId: string }) {
  const getFn = useServerFn(getSocialIntake);
  const saveFn = useServerFn(saveSocialIntake);
  const genFn = useServerFn(generateSocialPlan);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["social-intake", clientId], queryFn: () => getFn({ data: { clientId } }) });
  const [text, setText] = useState("");
  const [links, setLinks] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [months, setMonths] = useState(1);
  const [listening, setListening] = useState(false);
  const recogRef = useRef<unknown>(null);

  useEffect(() => { if (data && !loaded) { setText(data.intake ?? ""); setLinks(data.links ?? ""); setLoaded(true); } }, [data, loaded]);

  if (isLoading) return <section className="ng-card p-5"><Loader2 className="h-4 w-4 animate-spin" /></section>;
  if (!data?.contract) return null;

  const startVoice = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { toast.error("Voice input niet ondersteund in deze browser"); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: any = new SR();
    r.lang = "nl-BE"; r.continuous = true; r.interimResults = false;
    r.onresult = (ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => {
      let chunk = "";
      for (let i = 0; i < ev.results.length; i++) chunk += ev.results[i][0].transcript + " ";
      setText((t) => (t ? t + " " : "") + chunk.trim());
    };
    r.onend = () => setListening(false);
    recogRef.current = r;
    r.start(); setListening(true);
  };
  const stopVoice = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (recogRef.current as any)?.stop?.(); setListening(false);
  };

  const save = async () => {
    setSaving(true);
    try { await saveFn({ data: { serviceContractId: data.contract!.id, intake: text, links } }); toast.success("Intake opgeslagen"); qc.invalidateQueries({ queryKey: ["social-intake", clientId] }); }
    catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };
  const generate = async () => {
    if (!text.trim()) { toast.error("Vul eerst de intake in"); return; }
    setGenerating(true);
    try {
      await saveFn({ data: { serviceContractId: data.contract!.id, intake: text, links } });
      const res = await genFn({ data: { serviceContractId: data.contract!.id, months } });
      toast.success(`${res.created} items gegenereerd`);
      qc.invalidateQueries({ queryKey: ["admin-social-content", clientId] });
    } catch (e) { toast.error((e as Error).message); } finally { setGenerating(false); }
  };

  return (
    <section className="ng-card p-5 space-y-3">
      <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /><h3 className="font-display font-semibold">Social Media intake & strategie</h3>
        {!data.signed && <span className="ml-2 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">Wacht op contract</span>}
      </div>
      <p className="text-xs text-muted-foreground">Positionering, doelen, aanbod, doelgroep, niche-inzichten, strategie. Wordt meegegeven aan de AI bij het genereren van de kalender.</p>
      <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Bedrijfspositionering, doelen, aanbod, doelgroep, niche-inzichten, besproken strategie…"
        className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm" />
      <label className="block text-[10px] uppercase tracking-wider text-muted-foreground space-y-1">Documenten & links (Drive, Dropbox, brand kit, voorbeelden — één per regel)
        <textarea rows={3} value={links} onChange={(e) => setLinks(e.target.value)} placeholder="https://drive.google.com/…&#10;https://www.dropbox.com/…"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {!listening
          ? <button onClick={startVoice} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border hover:bg-secondary"><Mic className="h-3 w-3" /> Voice input</button>
          : <button onClick={stopVoice} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-rose-500/40 text-rose-300 hover:bg-rose-500/10"><Mic className="h-3 w-3 animate-pulse" /> Stop opname</button>}
        <button disabled={saving || !data.signed} onClick={save} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border hover:bg-secondary disabled:opacity-50">{saving && <Loader2 className="h-3 w-3 animate-spin" />} Intake opslaan</button>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Maanden</label>
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="text-xs bg-background border border-border rounded-md px-2 py-1">
            {[1,2,3,6,12].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button disabled={generating || !data.signed} onClick={generate} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground font-semibold disabled:opacity-50">
            {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {months === 1 ? "Genereer contentkalender" : "Genereer extra content"}
          </button>
        </div>
      </div>
      {!data.signed && <p className="text-[11px] text-amber-300/80">Generatie is pas mogelijk nadat het contract ondertekend is.</p>}
    </section>
  );
}

/* ───────── Shoots & intake meetings ───────── */
function ShootSchedulingSection({ clientId }: { clientId: string }) {
  const listFn = useServerFn(listClientTasks);
  const createFn = useServerFn(createClientTask);
  const delFn = useServerFn(deleteClientTask);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["client-tasks", clientId], queryFn: () => listFn({ data: { clientId } }) });
  const [form, setForm] = useState({ type: "shoot" as "shoot" | "intake", title: "", scheduled_for: new Date().toISOString().slice(0, 10), notes: "" });
  const [saving, setSaving] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["client-tasks", clientId] });

  const submit = async () => {
    if (!form.title || !form.scheduled_for) { toast.error("Titel en datum verplicht"); return; }
    setSaving(true);
    try { await createFn({ data: { clientId, ...form } }); toast.success("Ingepland"); setForm({ ...form, title: "", notes: "" }); refresh(); }
    catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };

  const downloadIcs = (t: { id: string; title: string; scheduled_for: string; type: string; notes: string | null }) => {
    const dt = t.scheduled_for.replace(/-/g, "");
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NextGenMedia//Planning//NL",
      "BEGIN:VEVENT", `UID:${t.id}@nextgenmedia`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      `DTSTART;VALUE=DATE:${dt}`, `DTEND;VALUE=DATE:${dt}`,
      `SUMMARY:${(t.type === "intake" ? "Intake — " : "Shoot — ") + t.title}`,
      `DESCRIPTION:${(t.notes ?? "").replace(/\n/g, "\\n")}`,
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${t.type}-${dt}.ics`; a.click();
    URL.revokeObjectURL(url);
  };

  const inp = "w-full bg-background border border-border rounded-md px-3 py-2 text-sm";
  return (
    <section className="ng-card p-5 space-y-4">
      <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" /><h3 className="font-display font-semibold">Intakes & shoots</h3></div>
      <div className="grid sm:grid-cols-[140px_1fr_160px_auto] gap-2 items-end">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground space-y-1">Type
          <select className={inp} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "shoot" | "intake" })}>
            <option value="shoot">Shoot</option><option value="intake">Intake meeting</option>
          </select>
        </label>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground space-y-1">Titel
          <input className={inp} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="bv. Reels shoot mei" />
        </label>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground space-y-1">Datum
          <input type="date" className={inp} value={form.scheduled_for} onChange={(e) => setForm({ ...form, scheduled_for: e.target.value })} />
        </label>
        <button onClick={submit} disabled={saving} className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded bg-primary text-primary-foreground font-semibold disabled:opacity-50 h-fit">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Plan in
        </button>
      </div>
      <label className="block text-[10px] uppercase tracking-wider text-muted-foreground space-y-1">Notities (optioneel)
        <textarea rows={2} className={inp} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </label>

      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (data?.tasks?.length ?? 0) === 0 ? (
        <p className="text-xs text-muted-foreground">Nog niets ingepland.</p>
      ) : (
        <div className="space-y-2">
          {data!.tasks.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  <span className="text-[10px] uppercase tracking-wider mr-2 px-1.5 py-0.5 rounded border border-border bg-secondary">{t.type}</span>
                  {t.title}
                </div>
                <div className="text-xs text-muted-foreground">{t.scheduled_for}{t.notes ? ` · ${t.notes}` : ""}</div>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => downloadIcs({ id: t.id, title: t.title ?? "", scheduled_for: t.scheduled_for ?? "", type: t.type, notes: t.notes })} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border border-border hover:bg-secondary"><Download className="h-3 w-3" /> .ics</button>
                <button onClick={async () => { if (!confirm("Verwijderen?")) return; await delFn({ data: { id: t.id } }); refresh(); }} className="text-xs px-2.5 py-1.5 rounded border border-destructive/40 text-destructive hover:bg-destructive/10">×</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
