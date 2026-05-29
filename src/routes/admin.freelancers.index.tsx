import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Loader2, Save, X, Trash2, Users, Wallet, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  adminListFreelancers, adminCreateFreelancer, adminUpdateFreelancer, adminDeleteFreelancer,
} from "@/lib/freelancers.functions";
import { adminListPartnersWithBalance } from "@/lib/partner-ledger.functions";

export const Route = createFileRoute("/admin/freelancers/")({
  component: PartnersPage,
  head: () => ({ meta: [{ title: "Partners — NextGenMedia" }] }),
});

const ROLES = ["photographer", "videographer", "editor", "designer", "copywriter", "developer", "strategist", "other"] as const;
type Role = typeof ROLES[number];

type EditState = {
  id?: string;
  email: string;
  full_name: string;
  company_name: string;
  phone: string;
  vat_number: string;
  iban: string;
  password: string;
  roles: Role[];
  hourly_rate: string;
  default_commission_pct: string;
  region: string;
  bio: string;
  notes: string;
  status: "pending" | "active" | "inactive";
};

const empty: EditState = {
  email: "", full_name: "", company_name: "", phone: "", vat_number: "", iban: "",
  password: "", roles: [], hourly_rate: "", default_commission_pct: "",
  region: "", bio: "", notes: "", status: "active",
};

function fmt(n: number) {
  return new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(n);
}

function PartnersPage() {
  const qc = useQueryClient();
  const fn = useServerFn(adminListFreelancers);
  const balFn = useServerFn(adminListPartnersWithBalance);
  const create = useServerFn(adminCreateFreelancer);
  const update = useServerFn(adminUpdateFreelancer);
  const del = useServerFn(adminDeleteFreelancer);
  const { data, isLoading } = useQuery({ queryKey: ["partners"], queryFn: () => fn() });
  const { data: balData } = useQuery({ queryKey: ["partners-balance"], queryFn: () => balFn() });
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const balances = new Map<string, number>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (balData?.partners ?? []).map((p: any) => [p.id, Number(p.open_balance ?? 0)]),
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["partners"] });
    qc.invalidateQueries({ queryKey: ["partners-balance"] });
  };

  const onSave = async () => {
    if (!edit) return;
    setSaving(true);
    try {
      const hr = edit.hourly_rate ? Number(edit.hourly_rate) : null;
      const comm = edit.default_commission_pct ? Number(edit.default_commission_pct) : 0;
      if (edit.id) {
        await update({ data: {
          id: edit.id,
          full_name: edit.full_name,
          company_name: edit.company_name,
          phone: edit.phone,
          iban: edit.iban,
          roles: edit.roles,
          hourly_rate: hr,
          default_commission_pct: comm,
          region: edit.region,
          bio: edit.bio,
          notes: edit.notes,
          status: edit.status,
        }});
        toast.success("Opgeslagen");
        setEdit(null);
      } else {
        if (edit.roles.length === 0) throw new Error("Kies minstens één rol");
        const res = await create({ data: {
          email: edit.email,
          full_name: edit.full_name,
          company_name: edit.company_name,
          phone: edit.phone,
          vat_number: edit.vat_number,
          iban: edit.iban,
          roles: edit.roles,
          hourly_rate: hr,
          default_commission_pct: comm,
          region: edit.region,
          bio: edit.bio,
          notes: edit.notes,
          password: edit.password || "",
        }});
        toast.success(res?.passwordSet ? "Partner aangemaakt met wachtwoord" : "Partner aangemaakt");
        setEdit(null);
        if (res?.inviteLink) setInviteLink(res.inviteLink);
      }
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Mislukt"); }
    finally { setSaving(false); }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Partner definitief verwijderen?")) return;
    try { await del({ data: { id } }); toast.success("Verwijderd"); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Mislukt"); }
  };

  const list = data?.freelancers ?? [];

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-primary mb-2">Admin</div>
          <h1 className="font-display text-4xl font-bold">Partners</h1>
          <p className="text-muted-foreground mt-1 text-sm">Beheer subcontractors, creatives, agencies en referral partners.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/freelancers/settlements" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border hover:bg-secondary text-sm font-semibold">
            <Wallet className="h-4 w-4" /> Settlements
          </Link>
          <button onClick={() => setEdit({ ...empty })} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm">
            <Plus className="h-4 w-4" /> Nieuwe partner
          </button>
        </div>
      </header>

      {inviteLink && (
        <div className="rounded-xl border border-primary bg-primary/10 p-4 space-y-2">
          <div className="text-sm font-semibold">Uitnodigings-link gegenereerd</div>
          <p className="text-xs text-muted-foreground">Deel deze link met de partner — hij/zij stelt er zelf een wachtwoord mee in.</p>
          <div className="flex gap-2">
            <input readOnly value={inviteLink} className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-xs font-mono" />
            <button
              onClick={() => { navigator.clipboard.writeText(inviteLink); toast.success("Gekopieerd"); }}
              className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold"
            >Kopiëren</button>
            <button onClick={() => setInviteLink(null)} className="px-3 py-2 rounded-lg border border-border text-xs">Sluiten</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Nog geen partners.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {list.map((f: any) => {
            const bal = balances.get(f.id) ?? 0;
            return (
            <div key={f.id} className="rounded-xl border border-border bg-card p-5 hover:border-primary/40 transition">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{f.full_name}</div>
                  {f.company_name && <div className="text-xs text-muted-foreground truncate">{f.company_name}</div>}
                  <div className="text-xs text-muted-foreground truncate">{f.email}</div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-semibold ${
                  f.status === "active" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : f.status === "pending" ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                  : "bg-muted text-muted-foreground"
                }`}>{f.status}</span>
              </div>
              <div className="flex flex-wrap gap-1 mb-3">
                {(f.roles ?? []).map((r: string) => (
                  <span key={r} className="text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground">{r}</span>
                ))}
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                {f.hourly_rate != null && <div>€ {f.hourly_rate} / uur</div>}
                {f.default_commission_pct != null && Number(f.default_commission_pct) > 0 && (
                  <div>{f.default_commission_pct}% commissie</div>
                )}
                {f.region && <div>{f.region}</div>}
              </div>
              <div className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold flex items-center justify-between ${
                bal > 0 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                : bal < 0 ? "bg-red-500/10 text-red-400 border border-red-500/30"
                : "bg-muted/40 text-muted-foreground border border-border"
              }`}>
                <span>Open saldo</span>
                <span>{fmt(bal)}</span>
              </div>
              <div className="flex gap-2 mt-4 pt-3 border-t border-border">
                <Link
                  to="/admin/freelancers/$id"
                  params={{ id: f.id }}
                  className="flex-1 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center justify-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" /> Finance
                </Link>
                <button
                  onClick={() => setEdit({
                    id: f.id, email: f.email,
                    full_name: f.full_name,
                    company_name: f.company_name ?? "",
                    phone: f.phone ?? "",
                    vat_number: (f.metadata?.vat_number ?? "") as string,
                    iban: f.iban ?? "",
                    password: "",
                    roles: f.roles ?? [],
                    hourly_rate: f.hourly_rate?.toString() ?? "",
                    default_commission_pct: f.default_commission_pct?.toString() ?? "",
                    region: f.region ?? "",
                    bio: f.bio ?? "",
                    notes: f.notes ?? "",
                    status: f.status,
                  })}
                  className="px-3 py-1.5 rounded border border-border hover:bg-secondary text-xs"
                >Bewerk</button>
                <button onClick={() => onDelete(f.id)} className="px-2 py-1.5 rounded border border-border hover:bg-secondary text-xs text-red-400">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          );})}
        </div>
      )}

      {edit && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-stretch">
          <div className="ml-auto w-full max-w-xl bg-background border-l border-border overflow-y-auto">
            <div className="sticky top-0 z-10 bg-background border-b border-border p-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-bold">{edit.id ? "Partner bewerken" : "Nieuwe partner"}</h2>
              <div className="flex gap-2">
                <button onClick={onSave} disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Opslaan
                </button>
                <button onClick={() => setEdit(null)} className="p-2 rounded-lg hover:bg-secondary"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Volledige naam" value={edit.full_name} onChange={(v) => setEdit({ ...edit, full_name: v })} />
                <Field label="Bedrijfsnaam" value={edit.company_name} onChange={(v) => setEdit({ ...edit, company_name: v })} />
                <Field label="E-mail" value={edit.email} onChange={(v) => setEdit({ ...edit, email: v })} disabled={!!edit.id} type="email" />
                <Field label="Telefoon" value={edit.phone} onChange={(v) => setEdit({ ...edit, phone: v })} />
                <Field label="BTW-nummer" value={edit.vat_number} onChange={(v) => setEdit({ ...edit, vat_number: v })} disabled={!!edit.id} />
                <Field label="IBAN" value={edit.iban} onChange={(v) => setEdit({ ...edit, iban: v })} />
                <Field label="Regio" value={edit.region} onChange={(v) => setEdit({ ...edit, region: v })} />
                <Field label="Uurtarief (€)" value={edit.hourly_rate} onChange={(v) => setEdit({ ...edit, hourly_rate: v })} type="number" />
                <Field label="Standaard commissie %" value={edit.default_commission_pct} onChange={(v) => setEdit({ ...edit, default_commission_pct: v })} type="number" />
                {!edit.id && (
                  <Field label="Wachtwoord (min. 8 tekens, optioneel)" value={edit.password} onChange={(v) => setEdit({ ...edit, password: v })} type="text" />
                )}
                {edit.id && (
                  <label className="block">
                    <span className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Status</span>
                    <select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as EditState["status"] })}
                            className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm">
                      <option value="active">Actief</option>
                      <option value="pending">In afwachting</option>
                      <option value="inactive">Inactief</option>
                    </select>
                  </label>
                )}
              </div>

              <div>
                <span className="block text-xs uppercase tracking-wider text-muted-foreground mb-2">Rollen / Expertise</span>
                <div className="flex flex-wrap gap-2">
                  {ROLES.map((r) => {
                    const active = edit.roles.includes(r);
                    return (
                      <button key={r} type="button"
                        onClick={() => setEdit({ ...edit, roles: active ? edit.roles.filter((x) => x !== r) : [...edit.roles, r] })}
                        className={`px-3 py-1.5 rounded text-xs border transition ${active ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="block">
                <span className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Bio</span>
                <textarea value={edit.bio} onChange={(e) => setEdit({ ...edit, bio: e.target.value })} rows={3}
                          className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm" />
              </label>
              <label className="block">
                <span className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Interne notities</span>
                <textarea value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} rows={3}
                          className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm" />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", disabled }: { label: string; value: string; onChange: (v: string) => void; type?: string; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} type={type} disabled={disabled}
             className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm disabled:opacity-50" />
    </label>
  );
}
