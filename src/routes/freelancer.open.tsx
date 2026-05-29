import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Globe, Calendar as CalendarIcon, Euro, Hand } from "lucide-react";
import { toast } from "sonner";
import { listOpenAssignments, claimAssignment } from "@/lib/freelancers.functions";

export const Route = createFileRoute("/freelancer/open")({
  component: OpenPool,
  head: () => ({ meta: [{ title: "Open opdrachten — NextGenMedia" }] }),
});

function OpenPool() {
  const qc = useQueryClient();
  const fn = useServerFn(listOpenAssignments);
  const claim = useServerFn(claimAssignment);
  const { data, isLoading } = useQuery({ queryKey: ["open-assignments"], queryFn: () => fn() });

  const onClaim = async (id: string) => {
    if (!confirm("Deze opdracht claimen?")) return;
    try {
      await claim({ data: { id } });
      toast.success("Geclaimd — staat nu in 'Mijn opdrachten'");
      qc.invalidateQueries({ queryKey: ["open-assignments"] });
      qc.invalidateQueries({ queryKey: ["my-freelancer"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Mislukt"); }
  };

  const list = (data?.assignments ?? []) as any[];

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-6 max-w-5xl">
      <header>
        <div className="text-xs uppercase tracking-[0.3em] text-primary mb-2">Partner</div>
        <h1 className="font-display text-4xl font-bold">Open opdrachten</h1>
        <p className="text-muted-foreground text-sm mt-1">Beschikbare opdrachten die je zelf kan claimen.</p>
      </header>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Globe className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Geen openstaande opdrachten op dit moment.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((a) => {
            const rolesArr: string[] = (a.roles && a.roles.length > 0 ? a.roles : a.role ? [a.role] : []) as string[];
            return (
              <div key={a.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">Open</span>
                      {rolesArr.map((r) => (
                        <span key={r} className="text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground uppercase tracking-wider">{r}</span>
                      ))}
                    </div>
                    <div className="font-semibold">{a.title ?? "Opdracht"}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.clients?.company_name ?? a.quote_requests?.company_name ?? a.quote_requests?.contact_name ?? "—"}
                    </div>
                    {a.description && <p className="text-sm mt-2 text-muted-foreground whitespace-pre-wrap">{a.description}</p>}
                    <div className="flex flex-wrap gap-4 mt-3 text-xs">
                      {a.budget != null && (
                        <span className="inline-flex items-center gap-1 text-primary font-semibold">
                          <Euro className="h-3 w-3" /> Jouw budget: € {Number(a.budget).toLocaleString("nl-BE")}
                        </span>
                      )}
                      {a.deadline && <span className="inline-flex items-center gap-1 text-muted-foreground"><CalendarIcon className="h-3 w-3" /> Deadline {new Date(a.deadline).toLocaleDateString("nl-BE")}</span>}
                    </div>
                  </div>
                  <button onClick={() => onClaim(a.id)}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 shrink-0">
                    <Hand className="h-4 w-4" /> Claim
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
