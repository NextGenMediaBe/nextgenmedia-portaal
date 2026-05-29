import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Loader2, Save, X, Inbox, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import {
  partnerListMyRequests, partnerCreateRequest,
} from "@/lib/partner-requests.functions";

export const Route = createFileRoute("/freelancer/requests")({
  component: PartnerRequestsPage,
  head: () => ({ meta: [{ title: "Mijn aanvragen — NextGenMedia" }] }),
});

const SERVICES = [
  { v: "social-media", l: "Social Media" },
  { v: "webdesign", l: "Webdesign" },
  { v: "marketing-consultancy", l: "Marketing Consultancy" },
  { v: "ads", l: "Ads" },
  { v: "photography", l: "Fotografie" },
  { v: "graphic-design", l: "Grafisch Ontwerp" },
  { v: "videography", l: "Videografie" },
  { v: "other", l: "Anders" },
] as const;

type Draft = {
  title: string;
  service_type: typeof SERVICES[number]["v"];
  description: string;
  budget: string;
  desired_deadline: string;
};

const emptyDraft: Draft = {
  title: "", service_type: "webdesign", description: "", budget: "", desired_deadline: "",
};

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(Number(n));
}

const STATUS_STYLE: Record<string, string> = {
  new: "bg-primary/15 text-primary border-primary/30",
  in_review: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  accepted: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  in_progress: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  delivered: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-400 border-red-500/30",
};

function PartnerRequestsPage() {
  const qc = useQueryClient();
  const fn = useServerFn(partnerListMyRequests);
  const create = useServerFn(partnerCreateRequest);
  const { data, isLoading } = useQuery({ queryKey: ["partner-my-requests"], queryFn: () => fn() });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (!draft) return;
    if (!draft.title.trim()) return toast.error("Titel verplicht");
    setSaving(true);
    try {
      await create({ data: {
        title: draft.title,
        service_type: draft.service_type,
        description: draft.description,
        budget: draft.budget ? Number(draft.budget.replace(",", ".")) : null,
        desired_deadline: draft.desired_deadline || null,
      }});
      toast.success("Aanvraag verstuurd naar NextGenMedia");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["partner-my-requests"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Mislukt"); }
    finally { setSaving(false); }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list: any[] = data?.requests ?? [];

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-primary mb-2">Partner</div>
          <h1 className="font-display text-4xl font-bold">Opdrachten aanvragen</h1>
          <p className="text-muted-foreground mt-1 text-sm">Schakel NextGenMedia in voor jouw projecten — webshops, campagnes, video, design.</p>
        </div>
        <button onClick={() => setDraft({ ...emptyDraft })} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm">
          <Plus className="h-4 w-4" /> Nieuwe opdracht aanvragen
        </button>
      </header>

      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Inbox className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Nog geen aanvragen ingediend.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {list.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{r.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {SERVICES.find((s) => s.v === r.service_type)?.l ?? r.service_type}
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-semibold border ${STATUS_STYLE[r.status] ?? "bg-muted text-muted-foreground border-border"}`}>{r.status}</span>
              </div>
              {r.description && <p className="text-xs text-muted-foreground line-clamp-3 mb-3">{r.description}</p>}
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground border-t border-border pt-3">
                <span>Budget: <strong className="text-foreground">{fmt(r.budget)}</strong></span>
                {r.desired_deadline && <span>Deadline: <strong className="text-foreground">{r.desired_deadline}</strong></span>}
              </div>
              {r.admin_notes && (
                <div className="mt-3 rounded-lg bg-secondary/40 p-3 text-xs">
                  <div className="font-semibold mb-1 flex items-center gap-1.5"><ArrowUpRight className="h-3 w-3" /> Reactie NextGenMedia</div>
                  <p className="text-muted-foreground whitespace-pre-wrap">{r.admin_notes}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {draft && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-stretch">
          <div className="ml-auto w-full max-w-lg bg-background border-l border-border overflow-y-auto">
            <div className="sticky top-0 z-10 bg-background border-b border-border p-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-bold">Nieuwe aanvraag</h2>
              <div className="flex gap-2">
                <button onClick={onSave} disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Versturen
                </button>
                <button onClick={() => setDraft(null)} className="p-2 rounded-lg hover:bg-secondary"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <label className="block">
                <span className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Titel *</span>
                <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                       className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm" placeholder="bv. Webshop voor klant X" />
              </label>
              <label className="block">
                <span className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Dienst</span>
                <select value={draft.service_type} onChange={(e) => setDraft({ ...draft, service_type: e.target.value as Draft["service_type"] })}
                        className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm">
                  {SERVICES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Beschrijving</span>
                <textarea rows={5} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm" placeholder="Scope, doelen, doelgroep, referenties…" />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Budget (€)</span>
                  <input value={draft.budget} onChange={(e) => setDraft({ ...draft, budget: e.target.value })} type="number" min="0"
                         className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm" />
                </label>
                <label className="block">
                  <span className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Gewenste deadline</span>
                  <input value={draft.desired_deadline} onChange={(e) => setDraft({ ...draft, desired_deadline: e.target.value })} type="date"
                         className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm" />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
