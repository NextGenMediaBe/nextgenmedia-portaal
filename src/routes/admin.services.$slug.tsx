import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  Users,
  ClipboardList,
  Calendar,
  ArrowRight,
  Package,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import {
  adminServiceDashboard,
  adminSocialClientsOverview,
  SERVICE_META,
} from "@/lib/admin-services.functions";

type AdminServiceSlug =
  | "social-media"
  | "webdesign"
  | "marketing-consultancy"
  | "ads"
  | "fotografie"
  | "grafisch-ontwerp"
  | "videografie"
  | "foto-video";

const VALID = new Set<AdminServiceSlug>([
  "social-media",
  "webdesign",
  "marketing-consultancy",
  "ads",
  "fotografie",
  "grafisch-ontwerp",
  "videografie",
  "foto-video",
]);

export const Route = createFileRoute("/admin/services/$slug")({
  component: ServiceDashboard,
  head: ({ params }) => ({
    meta: [
      {
        title: `${SERVICE_META[params.slug]?.label ?? "Dienst"} — NextGenMedia Admin`,
      },
    ],
  }),
});

function ServiceDashboard() {
  const { slug } = useParams({ from: "/admin/services/$slug" });
  const fn = useServerFn(adminServiceDashboard);
  const valid = VALID.has(slug as AdminServiceSlug);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-service", slug],
    queryFn: () => fn({ data: { slug: slug as AdminServiceSlug } }),
    enabled: valid,
  });

  if (!valid)
    return (
      <div className="p-10 text-sm text-muted-foreground">Onbekende dienst.</div>
    );
  if (isLoading)
    return (
      <div className="p-10 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Laden…
      </div>
    );
  if (error)
    return (
      <div className="p-10 text-sm text-destructive">
        {error instanceof Error ? error.message : "Fout bij laden"}
      </div>
    );
  if (!data) return null;

  const meta = SERVICE_META[slug] ?? { label: slug, description: "" };

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-7">
      <header>
        <div className="text-xs uppercase tracking-[0.3em] text-primary mb-2">
          Diensten
        </div>
        <h1 className="font-display text-4xl font-bold flex items-center gap-3">
          <Package className="h-7 w-7 text-primary" /> {meta.label}
        </h1>
        <p className="text-muted-foreground mt-2">{meta.description}</p>
      </header>

      <div className="grid sm:grid-cols-3 gap-3">
        <Stat label="Actieve klanten" value={data.counts.activeClients} icon={Users} />
        <Stat label="Open taken" value={data.counts.openTasks} icon={ClipboardList} />
        <Stat label="Contracten" value={data.counts.totalContracts} icon={Package} />
      </div>

      {slug === "webdesign" && (
        <>
          <Link
            to="/admin/webdesign"
            className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
          >
            Open volledige webdesign-aanvragen <ArrowRight className="h-4 w-4" />
          </Link>
          <WebdesignByClient
            items={
              data.webdesignOpen as Array<{
                id: string;
                title: string;
                kind: string;
                status: string;
                client_id: string;
                client_name: string;
              }>
            }
          />
        </>
      )}

      {slug === "social-media" && (
        <>
          <SocialClientsOverview />
          {data.socialPending.length > 0 && (
            <Section title="Scripts in afwachting van klant" icon={AlertCircle}>
              <SocialList
                items={
                  data.socialPending as Array<{
                    id: string;
                    title: string;
                    platform: string;
                    planned_date: string;
                    status: string;
                  }>
                }
              />
            </Section>
          )}
          {data.socialUpcoming.length > 0 && (
            <Section title="Komende publicaties" icon={Calendar}>
              <SocialList
                items={
                  data.socialUpcoming as Array<{
                    id: string;
                    title: string;
                    platform: string;
                    planned_date: string;
                    status: string;
                  }>
                }
              />
            </Section>
          )}
        </>
      )}

      <Section title="Actieve klanten" icon={Users}>
        {data.clients.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nog geen actieve klanten.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.clients.map((c) => (
              <li
                key={c.contract_id}
                className="py-3 flex items-center justify-between gap-3 flex-wrap"
              >
                <Link
                  to="/admin/clients/$clientId"
                  params={{ clientId: c.client_id }}
                  className="min-w-0 group"
                >
                  <div className="font-semibold group-hover:text-primary transition truncate">
                    {c.company_name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.niche ?? "—"}
                    {c.website ? ` · ${c.website}` : ""}
                  </div>
                </Link>
                <div className="flex items-center gap-2 text-xs">
                  {c.maintenance_included && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Onderhoud
                    </span>
                  )}
                  {c.monthly_fee ? (
                    <span className="text-muted-foreground">
                      €{Number(c.monthly_fee).toFixed(0)}/m
                    </span>
                  ) : c.hourly_rate ? (
                    <span className="text-muted-foreground">
                      €{Number(c.hourly_rate).toFixed(2)}/u
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {data.tasks.length > 0 && (
        <Section title="Recente productietaken" icon={ClipboardList}>
          <ul className="divide-y divide-border">
            {data.tasks.slice(0, 15).map((t) => (
              <li key={t.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{t.title ?? t.type}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.client_name}
                    {t.scheduled_for
                      ? ` · ${new Date(t.scheduled_for).toLocaleDateString("nl-BE")}`
                      : ""}
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                  {t.status}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="font-display text-3xl font-bold mt-1">{value}</div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-display font-semibold text-lg flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </h2>
      {children}
    </section>
  );
}

function SocialList({
  items,
}: {
  items: Array<{
    id: string;
    title: string;
    platform: string;
    planned_date: string;
    status: string;
  }>;
}) {
  return (
    <ul className="divide-y divide-border">
      {items.map((i) => (
        <li key={i.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
          <div className="min-w-0">
            <div className="font-medium truncate">{i.title}</div>
            <div className="text-xs text-muted-foreground capitalize">
              {i.platform} · {new Date(i.planned_date).toLocaleDateString("nl-BE")}
            </div>
          </div>
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
            {i.status}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SocialClientsOverview() {
  const fn = useServerFn(adminSocialClientsOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-social-clients-overview"],
    queryFn: () => fn(),
    staleTime: 30_000,
  });
  if (isLoading)
    return (
      <Section title="Alle social media klanten" icon={Users}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Laden…
        </div>
      </Section>
    );
  if (!data || data.clients.length === 0)
    return (
      <Section title="Alle social media klanten" icon={Users}>
        <p className="text-sm text-muted-foreground">Nog geen klanten met een actieve social media dienst.</p>
      </Section>
    );
  return (
    <Section title="Alle social media klanten" icon={Users}>
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <th className="text-left py-2 font-medium">Klant</th>
              <th className="text-left py-2 font-medium hidden md:table-cell">Frequentie</th>
              <th className="text-left py-2 font-medium hidden lg:table-cell">Kanalen</th>
              <th className="text-center py-2 font-medium">Scripts</th>
              <th className="text-right py-2 font-medium">Kalender</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.clients.map((c) => (
              <tr key={c.id} className="hover:bg-secondary/30">
                <td className="py-3">
                  <div className="font-semibold">{c.company_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.niche ?? "—"} · {c.contract_status}
                  </div>
                </td>
                <td className="py-3 text-xs text-muted-foreground hidden md:table-cell">
                  {c.posts_per_month}p · {c.reels_per_month}r · {c.stories_per_month}s
                </td>
                <td className="py-3 text-xs text-muted-foreground hidden lg:table-cell capitalize">
                  {(c.platforms ?? []).join(", ") || "—"}
                </td>
                <td className="py-3">
                  <div className="flex items-center justify-center gap-1.5">
                    <Dot color="orange" count={c.counts?.pending ?? 0} label="In review" />
                    <Dot color="red" count={c.counts?.rejected ?? 0} label="Afgekeurd" />
                    <Dot color="emerald" count={c.counts?.approved ?? 0} label="Goedgekeurd" />
                  </div>
                </td>
                <td className="py-3 text-right">
                  <Link
                    to="/admin/clients/$clientId"
                    params={{ clientId: c.id }}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Open <ArrowRight className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Dot({ color, count, label }: { color: "orange" | "red" | "emerald"; count: number; label: string }) {
  const cls =
    color === "orange" ? "bg-orange-500/20 text-orange-300 border-orange-500/40" :
    color === "red" ? "bg-red-500/20 text-red-300 border-red-500/40" :
    "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
  return (
    <span
      title={`${label}: ${count}`}
      className={`min-w-[1.5rem] px-1.5 py-0.5 rounded-full border text-[10px] font-semibold text-center ${count === 0 ? "opacity-30" : ""} ${cls}`}
    >
      {count}
    </span>
  );
}

function WebdesignByClient({
  items,
}: {
  items: Array<{ id: string; title: string; kind: string; status: string; client_id: string; client_name: string }>;
}) {
  if (items.length === 0) {
    return (
      <Section title="Open webdesign-aanvragen per klant" icon={AlertCircle}>
        <p className="text-sm text-muted-foreground">Geen open aanvragen.</p>
      </Section>
    );
  }
  const byClient = new Map<string, { client_name: string; rows: typeof items }>();
  for (const r of items) {
    const entry = byClient.get(r.client_id) ?? { client_name: r.client_name, rows: [] as typeof items };
    entry.rows.push(r);
    byClient.set(r.client_id, entry);
  }
  return (
    <Section title="Open webdesign-aanvragen per klant" icon={AlertCircle}>
      <div className="space-y-4">
        {Array.from(byClient.entries()).map(([clientId, group]) => (
          <div key={clientId} className="rounded-lg border border-border bg-background/40">
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border">
              <Link
                to="/admin/clients/$clientId"
                params={{ clientId }}
                className="font-semibold text-sm hover:text-primary"
              >
                {group.client_name}
              </Link>
              <span className="text-xs text-muted-foreground">{group.rows.length} open</span>
            </div>
            <ul className="divide-y divide-border">
              {group.rows.map((r) => (
                <li key={r.id} className="px-4 py-2 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.title}</div>
                    <div className="text-xs text-muted-foreground">{r.kind === "major" ? "Groot onderhoud" : "Klein onderhoud"}</div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                    {r.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}
