import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Briefcase, Calendar as CalendarIcon, Check, X } from "lucide-react";
import { toast } from "sonner";
import { myFreelancerProfile, updateAssignmentStatus } from "@/lib/freelancers.functions";

export const Route = createFileRoute("/freelancer/")({
  component: FreelancerHome,
  head: () => ({ meta: [{ title: "Mijn opdrachten — NextGenMedia" }] }),
});

const STATUS_COLORS: Record<string, string> = {
  invited: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  accepted: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
  declined: "bg-red-500/15 text-red-400 border border-red-500/30",
  done: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
};

function FreelancerHome() {
  const qc = useQueryClient();
  const fn = useServerFn(myFreelancerProfile);
  const upd = useServerFn(updateAssignmentStatus);
  const { data, isLoading } = useQuery({ queryKey: ["my-freelancer"], queryFn: () => fn() });

  if (isLoading) return <div className="p-10"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!data?.freelancer) return <div className="p-10 text-muted-foreground">Geen partner-profiel gevonden voor jouw account.</div>;

  const setStatus = async (id: string, status: "accepted" | "declined" | "done") => {
    try {
      await upd({ data: { id, status } });
      toast.success("Bijgewerkt");
      qc.invalidateQueries({ queryKey: ["my-freelancer"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Mislukt"); }
  };

  const f = data.freelancer;
  const assignments = data.assignments;

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-6 max-w-5xl">
      <header>
        <div className="text-xs uppercase tracking-[0.3em] text-primary mb-2">Partner</div>
        <h1 className="font-display text-4xl font-bold">Welkom, {f.full_name}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {(f.roles ?? []).join(" · ")}{f.hourly_rate ? ` · € ${f.hourly_rate}/uur` : ""}
        </p>
      </header>

      <h2 className="font-display text-2xl font-bold pt-4">Opdrachten</h2>

      {assignments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Briefcase className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Nog geen opdrachten toegewezen.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {assignments.map((a: any) => (
            <div key={a.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-semibold ${STATUS_COLORS[a.status] ?? "bg-muted"}`}>
                      {a.status}
                    </span>
                    <span className="text-xs text-muted-foreground">{a.role}</span>
                  </div>
                  <div className="font-semibold">
                    {a.clients?.company_name ?? a.quote_requests?.company_name ?? a.quote_requests?.contact_name ?? "Opdracht"}
                  </div>
                  {a.quote_requests?.reference && (
                    <div className="text-xs text-muted-foreground">Ref: {a.quote_requests.reference}</div>
                  )}
                  <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
                    {a.scheduled_date && <span className="inline-flex items-center gap-1"><CalendarIcon className="h-3 w-3" /> {new Date(a.scheduled_date).toLocaleDateString("nl-BE")}</span>}
                    {a.estimated_hours != null && <span>{a.estimated_hours} uur</span>}
                    {a.agreed_rate != null && <span>€ {a.agreed_rate}/uur</span>}
                  </div>
                  {a.notes && <p className="text-sm mt-3 text-muted-foreground whitespace-pre-wrap">{a.notes}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  {a.status === "invited" && (
                    <>
                      <button onClick={() => setStatus(a.id, "accepted")} className="px-3 py-1.5 rounded border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-xs inline-flex items-center gap-1">
                        <Check className="h-3 w-3" /> Aanvaarden
                      </button>
                      <button onClick={() => setStatus(a.id, "declined")} className="px-3 py-1.5 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs inline-flex items-center gap-1">
                        <X className="h-3 w-3" /> Weigeren
                      </button>
                    </>
                  )}
                  {a.status === "accepted" && (
                    <button onClick={() => setStatus(a.id, "done")} className="px-3 py-1.5 rounded border border-border hover:bg-secondary text-xs">
                      Markeer afgerond
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
