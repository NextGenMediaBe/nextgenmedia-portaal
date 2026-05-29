import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Loader2, Save, X, Trash2, Briefcase, Lock, Globe, Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import {
  adminListAssignments,
  adminCreateAssignment,
  adminUpdateAssignment,
  adminDeleteAssignment,
  adminListFreelancers,
} from "@/lib/freelancers.functions";
import { listClients } from "@/lib/clients.functions";

export const Route = createFileRoute("/admin/assignments/")({
  component: AssignmentsPage,
  head: () => ({ meta: [{ title: "Opdrachten — NextGenMedia" }] }),
});

const ROLES = ["photographer","videographer","editor","designer","copywriter","developer","strategist","other"] as const;
type Role = typeof ROLES[number];

type EditState = {
  id?: string;
  title: string;
  description: string;
  roles: Role[];
  client_id: string;
  freelancer_id: string;
  freelancer_budget: string;
  deadline: string;
};

const empty: EditState = {
  title: "", description: "", roles: [], client_id: "", freelancer_id: "",
  freelancer_budget: "", deadline: "",
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  invited: "bg-sky-500/15 text-sky-400 border border-sky-500/30",
  accepted: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
  declined: "bg-red-500/15 text-red-400 border border-red-500/30",
  done: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
};

/**
 * Slim deadline-label op basis van geselecteerde rollen.
 * Photographer/Videographer → Shoot Datum
 * Developer → Opleverdeadline
 * Designer → Design Deadline
 * Anders → Deadline
 */
function deadlineLabel(roles: Role[]): string {
  if (roles.includes("photographer") || roles.includes("videographer")) return "Shoot Datum";
  if (roles.includes("developer")) return "Opleverdeadline";
  if (roles.includes("designer")) return "Design Deadline";
  if (roles.includes("editor")) return "Edit Deadline";
  return "Deadline";
}

function rolesLabel(a: { roles?: string[] | null; role?: string | null }): string {
  if (a.roles && a.roles.length > 0) return a.roles.join(" · ");
  return a.role ?? "—";
}

function AssignmentsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListAssignments);
  const flFn = useServerFn(adminListFreelancers);
  const clFn = useServerFn(listClients);
  const create = useServerFn(adminCreateAssignment);
  const update = useServerFn(adminUpdateAssignment);
  const del = useServerFn(adminDeleteAssignment);

  const { data, isLoading } = useQuery({ queryKey: ["assignments"], queryFn: () => listFn() });
  const { data: flData } = useQuery({ queryKey: ["freelancers"], queryFn: () => flFn() });
  const { data: clData } = useQuery({ queryKey: ["clients"], queryFn: () => clFn() });

  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all"|"open"|"assigned"|"done">("all");

  const refresh = () => qc.invalidateQueries({ queryKey: ["assignments"] });

  const onSave = async () => {
    if (!edit) return;
    if (!edit.title.trim()) { toast.error("Titel verplicht"); return; }
    if (edit.roles.length === 0) { toast.error("Kies minstens één rol"); return; }
    setSaving(true);
    try {
      const payload = {
        title: edit.title,
        description: edit.description,
        roles: edit.roles,
        client_id: edit.client_id || null,
        freelancer_id: edit.freelancer_id || null,
        freelancer_budget: edit.freelancer_budget ? Number(edit.freelancer_budget) : null,
        deadline: edit.deadline || null,
      };
      if (edit.id) {
        await update({ data: { id: edit.id, ...payload } });
      } else {
        await create({ data: payload });
      }
      toast.success("Opgeslagen");
      setEdit(null);
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Mislukt"); }
    finally { setSaving(false); }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Opdracht verwijderen?")) return;
    try { await del({ data: { id } }); toast.success("Verwijderd"); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Mislukt"); }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = (data?.assignments ?? []) as any[];
  const list = all.filter((a) => {
    if (filter === "open") return !a.freelancer_id && a.status === "open";
    if (filter === "assigned") return !!a.freelancer_id && a.status !== "done";
    if (filter === "done") return a.status === "done";
    return true;
  });

  const counts = {
    all: all.length,
    open: all.filter((a) => !a.freelancer_id && a.status === "open").length,
    assigned: all.filter((a) => !!a.freelancer_id && a.status !== "done").length,
    done: all.filter((a) => a.status === "done").length,
  };

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-primary mb-2">Admin</div>
          <h1 className="font-display text-4xl font-bold">Opdrachten</h1>
          <p className="text-muted-foreground mt-1 text-sm">Wijs een partner toe of laat de opdracht open zodat geschikte partners hem kunnen claimen.</p>
        </div>
        <button onClick={() => setEdit({ ...empty })} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm">
          <Plus className="h-4 w-4" /> Nieuwe opdracht
        </button>
      </header>

      <div className="flex flex-wrap gap-2">
        {([
          ["all","Alles"],["open","Open pool"],["assigned","Toegewezen"],["done","Afgerond"],
        ] as const).map(([k,label]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${filter===k ? "bg-foreground text-background border-foreground" : "border-border hover:bg-secondary"}`}>
            {label} <span className="opacity-60 ml-1">{counts[k]}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Briefcase className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Geen opdrachten in deze weergave.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {list.map((a) => {
            const rolesArr: Role[] = (a.roles && a.roles.length > 0 ? a.roles : a.role ? [a.role] : []) as Role[];
            return (
              <div key={a.id} className="rounded-xl border border-border bg-card p-5 hover:border-primary/40 transition">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-semibold ${STATUS_STYLES[a.status] ?? "bg-muted"}`}>{a.status}</span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{rolesLabel(a)}</span>
                      {!a.freelancer_id ? (
                        <span className="text-[10px] inline-flex items-center gap-1 text-amber-400"><Globe className="h-3 w-3" /> Open</span>
                      ) : (
                        <span className="text-[10px] inline-flex items-center gap-1 text-emerald-400"><Lock className="h-3 w-3" /> Toegewezen</span>
                      )}
                    </div>
                    <div className="font-semibold truncate">{a.title ?? "Opdracht"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {a.clients?.company_name ?? a.quote_requests?.company_name ?? a.quote_requests?.contact_name ?? "Geen klant"}
                      {a.freelancers?.full_name ? ` · ${a.freelancers.full_name}` : ""}
                    </div>
                  </div>
                </div>
                {a.description && <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{a.description}</p>}
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-3">
                  {a.budget != null && <span>Partner € {Number(a.budget).toLocaleString("nl-BE")}</span>}
                  {a.deadline && <span className="inline-flex items-center gap-1"><CalendarIcon className="h-3 w-3" /> {deadlineLabel(rolesArr)}: {new Date(a.deadline).toLocaleDateString("nl-BE")}</span>}
                </div>
                <div className="flex gap-2 pt-3 border-t border-border">
                  <button onClick={() => setEdit({
                    id: a.id, title: a.title ?? "", description: a.description ?? "",
                    roles: rolesArr, client_id: a.client_id ?? "", freelancer_id: a.freelancer_id ?? "",
                    freelancer_budget: a.budget?.toString() ?? "",
                    deadline: a.deadline ?? "",
                  })} className="flex-1 px-3 py-1.5 rounded border border-border hover:bg-secondary text-xs">Bewerken</button>
                  <button onClick={() => onDelete(a.id)} className="px-2 py-1.5 rounded border border-border hover:bg-secondary text-xs text-red-400">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {edit && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-stretch">
          <div className="ml-auto w-full max-w-xl bg-background border-l border-border overflow-y-auto">
            <div className="sticky top-0 z-10 bg-background border-b border-border p-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-bold">{edit.id ? "Opdracht bewerken" : "Nieuwe opdracht"}</h2>
              <div className="flex gap-2">
                <button onClick={onSave} disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Opslaan
                </button>
                <button onClick={() => setEdit(null)} className="p-2 rounded-lg hover:bg-secondary"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <Field label="Titel" value={edit.title} onChange={(v) => setEdit({ ...edit, title: v })} />
              <label className="block">
                <span className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Omschrijving</span>
                <textarea value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                  rows={4} className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm" />
              </label>

              <div>
                <span className="block text-xs uppercase tracking-wider text-muted-foreground mb-2">Rol(len) <span className="text-muted-foreground/60 normal-case tracking-normal">— meerdere mogelijk</span></span>
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

              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block sm:col-span-2">
                  <span className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Klant</span>
                  <select value={edit.client_id} onChange={(e) => setEdit({ ...edit, client_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm">
                    <option value="">— Geen —</option>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(clData ?? []).map((c: any) => (
                      <option key={c.id} value={c.id}>{c.company_name}</option>
                    ))}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Toegewezen partner</span>
                  <select value={edit.freelancer_id} onChange={(e) => setEdit({ ...edit, freelancer_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm">
                    <option value="">— Laat open (geschikte partners kunnen claimen) —</option>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(flData?.freelancers ?? []).map((f: any) => (
                      <option key={f.id} value={f.id}>{f.full_name} ({(f.roles ?? []).join(", ")})</option>
                    ))}
                  </select>
                </label>
                <Field label="Partner payout (€)" value={edit.freelancer_budget} onChange={(v) => setEdit({ ...edit, freelancer_budget: v })} type="number" />
                <Field label={deadlineLabel(edit.roles)} value={edit.deadline} onChange={(v) => setEdit({ ...edit, deadline: v })} type="date" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-card border border-border text-sm" />
    </label>
  );
}
