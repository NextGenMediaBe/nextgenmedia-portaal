import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { myPortal } from "@/lib/clients.functions";
import { getMyUpcomingShoots } from "@/lib/social-intake.functions";
import { FileText, Loader2, CheckCircle2, Clock, Calendar } from "lucide-react";
import { SERVICE_LABELS, type ServiceSlug } from "@/lib/services.functions";

export const Route = createFileRoute("/portal/")({
  component: PortalDashboard,
  head: () => ({ meta: [{ title: "Mijn portaal — NextGenMedia" }] }),
});

function PortalDashboard() {
  const fn = useServerFn(myPortal);
  const shootsFn = useServerFn(getMyUpcomingShoots);
  const { data, isLoading } = useQuery({ queryKey: ["portal"], queryFn: () => fn() });
  const { data: shootsData } = useQuery({ queryKey: ["portal-shoots"], queryFn: () => shootsFn() });

  if (isLoading) return <div className="p-10 flex items-center gap-3 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Laden…</div>;
  if (!data?.client) return <div className="p-10"><h1 className="font-display text-3xl font-bold">Welkom</h1><p className="text-muted-foreground mt-2">Nog geen klantprofiel gekoppeld.</p></div>;

  const { client, services, pendingContracts } = data;
  const active = services.filter((s) => s.status === "active");
  const pending = services.filter((s) => s.status === "pending");

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-8">
      <header>
        <div className="text-xs uppercase tracking-[0.3em] text-primary mb-2">Welkom</div>
        <h1 className="font-display text-4xl font-bold">{client.company_name}</h1>
        <p className="text-muted-foreground mt-1">{client.niche}</p>
      </header>

      {pendingContracts.length > 0 && (
        <section className="rounded-xl border border-primary bg-primary/10 p-5">
          <div className="flex items-center gap-2 mb-3"><FileText className="h-5 w-5 text-primary" />
            <h2 className="font-display font-semibold">Contract{pendingContracts.length > 1 ? "en" : ""} klaar om te ondertekenen</h2></div>
          <ul className="space-y-2">
            {pendingContracts.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
                <div><div className="font-medium text-sm">{c.title}</div>
                  <div className="text-xs text-muted-foreground">Verzonden: {c.sent_at ? new Date(c.sent_at).toLocaleDateString("nl-BE") : "—"}</div></div>
                <a href={`/sign/${c.access_token}`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">
                  Ondertekenen →
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="font-display font-semibold mb-3 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Actieve diensten</h2>
        {active.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground text-center">Nog geen actieve diensten. Je krijgt toegang zodra de bijhorende contracten getekend zijn.</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {active.map((s) => (
              <Link key={s.id} to="/portal/services/$slug" params={{ slug: s.service_slug }}
                className="p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition">
                <div className="font-medium">{SERVICE_LABELS[s.service_slug as ServiceSlug] ?? s.service_slug}</div>
                <div className="text-xs text-muted-foreground mt-1">Sinds {s.start_date ?? "—"}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {(shootsData?.tasks?.length ?? 0) > 0 && (
        <section>
          <h2 className="font-display font-semibold mb-3 flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" /> Geplande afspraken</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {shootsData!.tasks.map((t) => (
              <div key={t.id} className="p-4 rounded-xl border border-border bg-card">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-primary/15 text-primary font-semibold">{t.type === "intake" ? "Intake" : "Shoot"}</span>
                  <span className="text-xs text-muted-foreground">{t.scheduled_for}</span>
                </div>
                <div className="font-medium text-sm">{t.title}</div>
                {t.notes && <div className="text-xs text-muted-foreground mt-1">{t.notes}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {pending.length > 0 && (
        <section>
          <h2 className="font-display font-semibold mb-3 flex items-center gap-2"><Clock className="h-4 w-4 text-amber-400" /> In afwachting</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {pending.map((s) => (
              <div key={s.id} className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
                <div className="font-medium">{SERVICE_LABELS[s.service_slug as ServiceSlug] ?? s.service_slug}</div>
                <div className="text-xs text-muted-foreground mt-1">Wacht op ondertekening contract</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
