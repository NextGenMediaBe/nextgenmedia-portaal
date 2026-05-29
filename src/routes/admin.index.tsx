import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminOverview } from "@/lib/clients.functions";
import {
  AlertTriangle, Users, FileText, ArrowRight, Loader2, Send,
  MessageSquare, Globe, Calendar, Camera, FileSignature, ClipboardList, AlertCircle, CheckCircle2,
} from "lucide-react";


export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
  head: () => ({ meta: [{ title: "Operations Center — NextGenMedia" }] }),
});

function fmt(d: string | null | undefined) {
  return d ? new Date(d).toLocaleDateString("nl-BE", { day: "2-digit", month: "short" }) : "—";
}

function AdminDashboard() {
  const fn = useServerFn(adminOverview);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => fn(),
    staleTime: 30_000,
  });

  if (isLoading)
    return (
      <div className="p-10 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Laden…
      </div>
    );
  if (error) return <div className="p-10 text-destructive">Fout: {(error as Error).message}</div>;
  if (!data) return null;

  const {
    clients, renewals, pendingContracts, pendingScripts, rejectedScripts,
    openWebdesign, upcomingTasks, openAssignments,
  } = data;

  

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-8">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-primary mb-2">Operations Center</div>
          <h1 className="font-display text-4xl font-bold">Command Hub</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Alle live activiteit, aanvragen en goedkeuringen in één blik.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/admin/clients/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 glow-yellow"
          >
            Nieuwe klant <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>


      {renewals.length > 0 && (
        <div className="rounded-xl border border-primary bg-primary/10 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 mt-0.5" />
          <div>
            <div className="font-semibold">{renewals.length} contract(en) verlopen binnen 14 dagen</div>
            <div className="text-sm text-muted-foreground mt-1">
              {renewals.map((r) => `${r.company_name} (${r.contract_end})`).join(" · ")}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat icon={Users} label="Klanten" value={clients.length} to="/admin/clients" />
        <Stat icon={MessageSquare} label="Scripts in review" value={pendingScripts.length} to="/admin/services/social-media" />
        <Stat icon={AlertCircle} label="Afgekeurde scripts" value={rejectedScripts.length} to="/admin/services/social-media" />
        <Stat icon={Globe} label="Webdesign open" value={openWebdesign.length} to="/admin/webdesign" />
        <Stat icon={FileSignature} label="Contracten openstaand" value={pendingContracts.length} to="/admin/contracts" />
        <Stat icon={Camera} label="Shoots/Taken (14d)" value={upcomingTasks.length} to="/admin/assignments" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel
          title="Scripts in afwachting"
          icon={MessageSquare}
          accent="orange"
          link={{ to: "/admin/services/social-media", label: "Alle scripts" }}
        >
          {pendingScripts.length === 0 ? <Empty text="Niets in afwachting." /> : (
            <ItemList
              items={pendingScripts.map((s) => ({
                id: s.id,
                primary: s.title,
                secondary: `${s.client_name} · ${s.platform} · ${fmt(s.planned_date)}`,
                badge: "pending",
                clientId: s.client_id,
              }))}
            />
          )}
        </Panel>

        <Panel
          title="Afgekeurde scripts"
          icon={AlertCircle}
          accent="red"
          link={{ to: "/admin/services/social-media", label: "Bekijk feedback" }}
        >
          {rejectedScripts.length === 0 ? <Empty text="Geen afkeuringen." /> : (
            <ItemList
              items={rejectedScripts.map((s) => ({
                id: s.id,
                primary: s.title,
                secondary: `${s.client_name} · ${s.client_feedback?.slice(0, 70) ?? "Klant vraagt aanpassing"}`,
                badge: "rejected",
                clientId: s.client_id,
              }))}
            />
          )}
        </Panel>

        <Panel
          title="Webdesign aanvragen"
          icon={Globe}
          link={{ to: "/admin/webdesign", label: "Beheer" }}
        >
          {openWebdesign.length === 0 ? <Empty text="Geen open aanvragen." /> : (
            <ItemList
              items={openWebdesign.map((w) => ({
                id: w.id,
                primary: w.title,
                secondary: `${w.client_name} · ${w.kind === "major" ? "Groot" : "Klein"} · ${fmt(w.created_at)}`,
                badge: w.status,
              }))}
            />
          )}
        </Panel>


        <Panel
          title="Komende shoots & taken"
          icon={Calendar}
          link={{ to: "/admin/assignments", label: "Planning" }}
        >
          {upcomingTasks.length === 0 ? <Empty text="Geen geplande taken binnen 14 dagen." /> : (
            <ItemList
              items={upcomingTasks.map((t) => ({
                id: t.id,
                primary: t.title ?? t.type,
                secondary: `${t.client_name} · ${fmt(t.scheduled_for)}`,
                badge: t.status,
              }))}
            />
          )}
        </Panel>

        <Panel
          title="Partner-opdrachten open"
          icon={ClipboardList}
          link={{ to: "/admin/freelancers", label: "Partners" }}
        >
          {openAssignments.length === 0 ? <Empty text="Alles toegewezen." /> : (
            <ItemList
              items={openAssignments.map((a) => ({
                id: a.id,
                primary: a.title ?? "Opdracht",
                secondary: `${a.client_name} · ${a.role} · ${fmt(a.scheduled_date)}`,
                badge: a.status,
              }))}
            />
          )}
        </Panel>

        <Panel
          title="Contracten in afwachting"
          icon={FileSignature}
          link={{ to: "/admin/contracts", label: "Alle contracten" }}
        >
          {pendingContracts.length === 0 ? <Empty text="Geen openstaande contracten." /> : (
            <ul className="divide-y divide-border">
              {pendingContracts.map((c) => (
                <li key={c.id} className="py-2.5 flex justify-between gap-4 text-sm">
                  <div className="min-w-0">
                    <Link to="/admin/contracts/$id" params={{ id: c.id }} className="font-medium hover:text-primary truncate block">
                      {c.title}
                    </Link>
                    <div className="text-xs text-muted-foreground">{c.clients?.company_name} · {c.status}</div>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">{fmt(c.created_at)}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Diensten — quick jump" icon={FileText}>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <ServiceJump to="/admin/services/social-media" label="Social Media" icon={MessageSquare} />
            <ServiceJump to="/admin/services/webdesign" label="Webdesign" icon={Globe} />
            <ServiceJump to="/admin/services/marketing-consultancy" label="Consultancy" icon={CheckCircle2} />
            <ServiceJump to="/admin/services/ads" label="Ads" icon={Send} />
            <ServiceJump to="/admin/services/foto-video" label="Foto & Video" icon={Camera} />
            <ServiceJump to="/admin/services/grafisch-ontwerp" label="Grafisch" icon={FileText} />

          </div>
        </Panel>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon, label, value, accent, to,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent?: boolean;
  to?: string;
}) {
  const body = (
    <div className={`p-4 rounded-xl border h-full ${accent ? "border-primary/40 bg-primary/5" : "border-border bg-card"} hover:bg-secondary/40 transition`}>
      <Icon className={`h-4 w-4 ${accent ? "text-primary" : "text-muted-foreground"}`} />
      <div className="mt-3 font-display text-2xl font-bold">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1 leading-tight">{label}</div>
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

function Panel({
  title, icon: Icon, children, link, accent,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  link?: { to: string; label: string };
  accent?: "orange" | "red";
}) {
  const accentClass =
    accent === "orange" ? "border-orange-500/40" :
    accent === "red" ? "border-red-500/40" : "border-border";
  return (
    <section className={`rounded-xl border ${accentClass} bg-card p-5`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-semibold flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </h2>
        {link && (
          <Link to={link.to} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            {link.label} <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-sm text-muted-foreground py-4">{text}</div>;
}

function ItemList({
  items,
}: {
  items: Array<{ id: string; primary: string; secondary: string; badge: string; clientId?: string | null }>;
}) {
  return (
    <ul className="divide-y divide-border">
      {items.slice(0, 6).map((i) => (
        <li key={i.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
          <div className="min-w-0">
            <div className="font-medium truncate">{i.primary}</div>
            <div className="text-xs text-muted-foreground truncate">{i.secondary}</div>
          </div>
          <BadgePill status={i.badge} />
        </li>
      ))}
    </ul>
  );
}

function BadgePill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    pending_review: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    rejected: "bg-red-500/15 text-red-300 border-red-500/30",
    changes_requested: "bg-red-500/15 text-red-300 border-red-500/30",
    approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    scheduled: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    in_progress: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    new: "bg-primary/15 text-primary border-primary/30",
  };
  const cls = map[status] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border whitespace-nowrap ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function ServiceJump({ to, label, icon: Icon }: { to: string; label: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Link to={to} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-secondary transition text-sm">
      <Icon className="h-3.5 w-3.5 text-primary" /> <span className="truncate">{label}</span>
    </Link>
  );
}
