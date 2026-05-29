import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listClients } from "@/lib/clients.functions";
import { Plus, Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin/clients/")({
  component: ClientsList,
  head: () => ({ meta: [{ title: "Klanten — NextGenMedia" }] }),
});

function ClientsList() {
  const fn = useServerFn(listClients);
  const { data, isLoading } = useQuery({ queryKey: ["clients"], queryFn: () => fn() });

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-primary mb-2">Admin</div>
          <h1 className="font-display text-4xl font-bold">Klanten</h1>
        </div>
        <Link
          to="/admin/clients/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition glow-yellow"
        >
          <Plus className="h-4 w-4" /> Nieuwe klant
        </Link>
      </header>

      {isLoading ? (
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Laden…
        </div>
      ) : (data ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <p className="text-muted-foreground">Nog geen klanten. Maak er één aan om te starten.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data!.map((c) => (
            <Link
              key={c.id}
              to="/admin/clients/$clientId"
              params={{ clientId: c.id }}
              className="p-5 rounded-xl border border-border bg-card hover:border-primary/40 transition"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-display font-bold text-lg">{c.company_name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{c.niche}</div>
                </div>
                <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-primary/10 text-primary">
                  {c.contract_months}M
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {(c.platforms ?? []).map((p) => (
                  <span key={p} className="text-[10px] uppercase px-2 py-0.5 rounded bg-secondary">
                    {p}
                  </span>
                ))}
              </div>
              <div className="mt-4 text-xs text-muted-foreground">
                {c.posts_per_month} posts · {c.reels_per_month} reels · {c.stories_per_month} stories
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
