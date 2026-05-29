import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Inbox, Save } from "lucide-react";
import { toast } from "sonner";
import {
  adminListPartnerRequests, adminUpdatePartnerRequest,
} from "@/lib/partner-requests.functions";

export const Route = createFileRoute("/admin/partner-requests")({
  component: AdminPartnerRequestsPage,
  head: () => ({ meta: [{ title: "Aanvragen van partners — NextGenMedia" }] }),
});

const STATUSES = ["new", "in_review", "accepted", "in_progress", "delivered", "rejected"] as const;
type Status = typeof STATUSES[number];

const STATUS_LABEL: Record<Status, string> = {
  new: "Nieuw", in_review: "In review", accepted: "Geaccepteerd",
  in_progress: "In productie", delivered: "Opgeleverd", rejected: "Afgewezen",
};

const STATUS_STYLE: Record<string, string> = {
  new: "bg-primary/15 text-primary border-primary/30",
  in_review: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  accepted: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  in_progress: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  delivered: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-400 border-red-500/30",
};

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(Number(n));
}

function AdminPartnerRequestsPage() {
  const qc = useQueryClient();
  const fn = useServerFn(adminListPartnerRequests);
  const update = useServerFn(adminUpdatePartnerRequest);
  const { data, isLoading } = useQuery({ queryKey: ["admin-partner-requests"], queryFn: () => fn() });
  const [edits, setEdits] = useState<Record<string, { status: Status; admin_notes: string }>>({});
  const [filter, setFilter] = useState<Status | "all">("all");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list: any[] = data?.requests ?? [];
  const filtered = filter === "all" ? list : list.filter((r) => r.status === filter);
  const counts: Record<string, number> = {};
  for (const r of list) counts[r.status] = (counts[r.status] ?? 0) + 1;

  const save = async (id: string) => {
    const e = edits[id];
    if (!e) return;
    try {
      await update({ data: { id, status: e.status, admin_notes: e.admin_notes } });
      toast.success("Opgeslagen");
      setEdits((s) => { const c = { ...s }; delete c[id]; return c; });
      qc.invalidateQueries({ queryKey: ["admin-partner-requests"] });
    } catch (err) { toast.error(err instanceof Error ? err.message : "Mislukt"); }
  };

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-6">
      <header>
        <div className="text-xs uppercase tracking-[0.3em] text-primary mb-2">Admin</div>
        <h1 className="font-display text-4xl font-bold">Aanvragen van partners</h1>
        <p className="text-muted-foreground mt-1 text-sm">Opdrachten die partners bij NextGenMedia indienen.</p>
      </header>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilter("all")} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${filter === "all" ? "bg-foreground text-background border-foreground" : "border-border hover:bg-secondary"}`}>
          Alles ({list.length})
        </button>
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${filter === s ? "bg-foreground text-background border-foreground" : "border-border hover:bg-secondary"}`}>
            {STATUS_LABEL[s]} ({counts[s] ?? 0})
          </button>
        ))}
      </div>

      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Inbox className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Geen aanvragen.</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {filtered.map((r) => {
            const e = edits[r.id] ?? { status: r.status as Status, admin_notes: r.admin_notes ?? "" };
            const dirty = edits[r.id] !== undefined;
            return (
              <div key={r.id} className="rounded-xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{r.title}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.freelancers?.full_name ?? "Partner"}{r.freelancers?.company_name ? ` · ${r.freelancers.company_name}` : ""}
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 mt-0.5">{r.service_type} · {new Date(r.created_at).toLocaleDateString("nl-BE")}</div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-semibold border ${STATUS_STYLE[r.status] ?? "bg-muted text-muted-foreground border-border"}`}>{STATUS_LABEL[r.status as Status] ?? r.status}</span>
                </div>
                {r.description && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{r.description}</p>}
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>Budget: <strong className="text-foreground">{fmt(r.budget)}</strong></span>
                  {r.desired_deadline && <span>Deadline: <strong className="text-foreground">{r.desired_deadline}</strong></span>}
                </div>
                <div className="border-t border-border pt-3 space-y-2">
                  <div className="grid grid-cols-[auto,1fr] gap-2 items-center">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</label>
                    <select value={e.status}
                            onChange={(ev) => setEdits((s) => ({ ...s, [r.id]: { ...e, status: ev.target.value as Status } }))}
                            className="px-2 py-1.5 rounded-lg bg-background border border-border text-xs">
                      {STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABEL[st]}</option>)}
                    </select>
                  </div>
                  <textarea rows={2} value={e.admin_notes} placeholder="Reactie / notitie voor partner…"
                            onChange={(ev) => setEdits((s) => ({ ...s, [r.id]: { ...e, admin_notes: ev.target.value } }))}
                            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs" />
                  {dirty && (
                    <button onClick={() => save(r.id)} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center gap-1.5">
                      <Save className="h-3 w-3" /> Opslaan
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
