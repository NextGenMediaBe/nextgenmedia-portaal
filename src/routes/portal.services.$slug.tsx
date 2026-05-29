import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyServiceModule, SERVICE_LABELS, type ServiceSlug } from "@/lib/services.functions";
import {
  Loader2, ArrowLeft, Calendar, Clock, FileText, Wrench, Instagram,
  Camera, PaintBucket, Globe, Megaphone, GraduationCap, CheckCircle2, AlertCircle,
  BarChart3, Target, UploadCloud, ListChecks, MessageSquare, ShieldCheck, TrendingUp, PenTool,
} from "lucide-react";

export const Route = createFileRoute("/portal/services/$slug")({
  component: ServiceModulePage,
});

const ICONS: Record<ServiceSlug, React.ComponentType<{ className?: string }>> = {
  "social-media": Instagram,
  "foto-video": Camera,
  "grafisch-ontwerp": PaintBucket,
  webdesign: Globe,
  "marketing-consultancy": GraduationCap,
  ads: Megaphone,
};

function fmtDate(d?: string | null) {
  return d ? new Date(d).toLocaleDateString("nl-BE", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}
function fmtEur(n?: number | null) {
  return typeof n === "number" ? `€${n.toLocaleString("nl-BE")}` : "—";
}

function ServiceModulePage() {
  const { slug } = Route.useParams();
  const fn = useServerFn(getMyServiceModule);
  const { data, isLoading, error } = useQuery({
    queryKey: ["module", slug],
    queryFn: () => fn({ data: { slug: slug as ServiceSlug } }),
    retry: false,
  });

  if (isLoading) return <div className="p-10 flex items-center gap-3 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Laden…</div>;
  if (error) return <ModuleError slug={slug as ServiceSlug} message={error instanceof Error ? error.message : "Onbekende fout"} />;
  if (!data) return null;

  const label = SERVICE_LABELS[slug as ServiceSlug] ?? "Module";
  const Icon = ICONS[slug as ServiceSlug] ?? FileText;

  if (!data.hasActive) {
    const pending = data.contracts.find((c) => c.status === "pending");
    return (
      <div className="p-4 sm:p-6 md:p-10 max-w-2xl space-y-5">
        <Link to="/portal" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Terug
        </Link>
        <header className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary/15 grid place-items-center"><Icon className="h-6 w-6 text-primary" /></div>
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-primary mb-1">Module</div>
            <h1 className="font-display text-3xl font-bold">{label}</h1>
          </div>
        </header>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold mb-1">Nog niet geactiveerd</div>
            <p className="text-muted-foreground">
              {pending
                ? "Deze module activeert automatisch zodra het bijhorende contract is ondertekend. Check je portaal voor openstaande contracten."
                : "Deze dienst staat niet in jouw pakket. Neem contact op met NextGenMedia om deze toe te voegen."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const contract = data.activeContracts[0];

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-8 max-w-6xl">
      <Link to="/portal" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Terug naar portaal
      </Link>

      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-xl bg-primary/15 grid place-items-center"><Icon className="h-7 w-7 text-primary" /></div>
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-primary mb-1">Module</div>
            <h1 className="font-display text-4xl font-bold">{label}</h1>
            <p className="text-sm text-emerald-400 mt-1 flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Actief sinds {fmtDate(contract.start_date)}</p>
          </div>
        </div>


      </header>

      {/* Contract overview cards */}
      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {contract.monthly_fee != null && contract.monthly_fee > 0 && (
          <StatCard label="Maandelijks" value={fmtEur(Number(contract.monthly_fee))} />
        )}
        {contract.setup_fee != null && contract.setup_fee > 0 && (
          <StatCard label="Setup" value={fmtEur(Number(contract.setup_fee))} />
        )}
        {contract.hours_purchased != null && (
          <StatCard
            label="Uren"
            value={`${Number(contract.hours_used ?? 0)} / ${Number(contract.hours_purchased)}`}
            sub={`${Math.max(0, Number(contract.hours_purchased) - Number(contract.hours_used ?? 0))} resterend`}
          />
        )}
        {contract.end_date && (
          <StatCard label="Einddatum" value={fmtDate(contract.end_date)} />
        )}
        <StatCard label="Type" value={contract.model.replace(/_/g, " ")} />
      </section>

      {/* Service-specific blocks */}
      {slug === "social-media" && <SocialBlock client={data.client} requests={[]} assignments={data.assignments} />}
      {slug === "webdesign" && <WebdesignBlock maintenance={data.contracts.some((c) => c.model === "webdesign_maintenance" && c.status === "active")} requests={[]} />}
      {slug === "foto-video" && <ShootBlock requests={[]} assignments={data.assignments} />}
      {slug === "grafisch-ontwerp" && <DesignBlock requests={[]} assignments={data.assignments} />}
      {slug === "marketing-consultancy" && <ConsultancyBlock contract={contract} requests={[]} assignments={data.assignments} />}
      {slug === "ads" && <AdsBlock contract={contract} requests={[]} assignments={data.assignments} />}

      {/* Planning / assignments */}
      {data.assignments.length > 0 && (
        <section>
          <h2 className="font-display font-semibold mb-3 flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" /> Planning</h2>
          <div className="grid gap-2">
            {data.assignments.map((a) => (
              <div key={a.id} className="rounded-lg border border-border bg-card p-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-sm">{a.title ?? "Opdracht"}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.scheduled_date ? `Gepland: ${fmtDate(a.scheduled_date)}` : a.deadline ? `Deadline: ${fmtDate(a.deadline)}` : "Nog te plannen"}
                    {a.estimated_hours ? ` · ${a.estimated_hours}u` : ""}
                  </div>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground capitalize">{a.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ModuleError({ slug, message }: { slug: ServiceSlug; message: string }) {
  return (
    <div className="p-10 max-w-xl space-y-3">
      <Link to="/portal" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3 w-3" /> Terug</Link>
      <h1 className="font-display text-3xl font-bold">{SERVICE_LABELS[slug] ?? "Module"}</h1>
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-display text-xl font-bold mt-1 capitalize">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

type ModuleRequest = { id: string; reference: string; status: string; created_at: string; scheduled_start?: string | null; client_visible_total?: number | null; client_visible_monthly?: number | null };
type ModuleAssignment = { id: string; title?: string | null; status: string; scheduled_date?: string | null; deadline?: string | null; estimated_hours?: number | null };
type ModuleContract = { monthly_fee?: number | null; setup_fee?: number | null; hours_purchased?: number | null; hours_used?: number | null; config?: unknown };

function SocialBlock({ client, requests, assignments }: { client: { platforms: string[]; posts_per_month: number; reels_per_month: number; stories_per_month: number }; requests: ModuleRequest[]; assignments: ModuleAssignment[] }) {
  const nextAssignment = assignments[0];
  return (
    <section className="grid lg:grid-cols-[1.2fr_0.8fr] gap-4">
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <h2 className="font-display font-semibold flex items-center gap-2"><Instagram className="h-4 w-4 text-primary" /> Content dashboard</h2>
        <div className="grid grid-cols-3 gap-3">
          <Metric label="Posts / maand" value={client.posts_per_month} />
          <Metric label="Reels / maand" value={client.reels_per_month} />
          <Metric label="Stories / maand" value={client.stories_per_month} />
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <ActionLink to="/portal/services/social-media/calendar" icon={Calendar} title="Contentkalender" body={nextAssignment?.scheduled_date ? `Volgende publicatie: ${fmtDate(nextAssignment.scheduled_date)}` : "Bekijk en keur geplande content goed."} />
          <ActionLink to="/portal/services/social-media/scripts" icon={UploadCloud} title="Scripts & captions" body="Bekijk scripts, hooks en captions die klaarstaan voor review." />
          
        </div>
        {client.platforms.length > 0 && <PlatformPills platforms={client.platforms} />}
      </div>
      <MiniPanel title="Social Media aanvragen" icon={MessageSquare} items={requests} empty="Nog geen social media aanvragen." />
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3 text-center">
      <div className="font-display text-2xl font-bold text-primary">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function WebdesignBlock({ maintenance, requests }: { maintenance: boolean; requests: ModuleRequest[] }) {
  return (
    <section className="grid lg:grid-cols-[1.2fr_0.8fr] gap-4">
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <h2 className="font-display font-semibold flex items-center gap-2"><Globe className="h-4 w-4 text-primary" /> Website cockpit</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <ActionTile icon={ListChecks} title="Projectstatus" body="Nieuwe pagina’s, copy en assets worden als aanvragen opgevolgd." />
          <ActionTile icon={ShieldCheck} title="Kwaliteit" body="Wijzigingen worden gecontroleerd op mobiel, snelheid en consistente styling." />
          <ActionTile icon={Wrench} title="Onderhoud" body={maintenance ? "Onderhoud is actief voor snelle website-aanpassingen." : "Onderhoud is niet inbegrepen in dit contract."} />
        </div>
        {maintenance ? (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/10 border border-primary/20">
            <Wrench className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-sm">Website wijzigingen</div>
              <p className="text-xs text-muted-foreground mt-1">Beschrijf de gewenste aanpassing; wij plannen die als onderhoudstaak in.</p>
              <Link to="/portal/services/webdesign/maintenance" className="inline-flex items-center gap-1 text-xs font-semibold text-primary mt-2">Wijziging aanvragen →</Link>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Voor wijzigingen aan je website kan je een nieuwe aanvraag indienen onder Webdesign.</p>
        )}
      </div>
      <MiniPanel title="Webdesign aanvragen" icon={FileText} items={requests} empty="Nog geen webdesign aanvragen." />
    </section>
  );
}

function ShootBlock({ requests, assignments }: { requests: ModuleRequest[]; assignments: ModuleAssignment[] }) {
  return (
    <section className="grid lg:grid-cols-[1.2fr_0.8fr] gap-4">
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <h2 className="font-display font-semibold flex items-center gap-2"><Camera className="h-4 w-4 text-primary" /> Shoot planning</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <ActionTile icon={Calendar} title="Shootdatum" body={assignments[0]?.scheduled_date ? fmtDate(assignments[0].scheduled_date) : "Nog te plannen via je volgende briefing."} />
          <ActionTile icon={UploadCloud} title="Referenties" body="Upload moodboards, shotlists en voorbeeldbeelden bij je aanvraag." />
          <ActionTile icon={FileText} title="Deliverables" body="Foto’s, reels en edits worden als opdracht opgevolgd." />
        </div>
      </div>
      <MiniPanel title="Foto & video aanvragen" icon={Camera} items={requests} empty="Nog geen shoot-aanvragen." />
    </section>
  );
}

function DesignBlock({ requests, assignments }: { requests: ModuleRequest[]; assignments: ModuleAssignment[] }) {
  return (
    <section className="grid lg:grid-cols-[1.2fr_0.8fr] gap-4">
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <h2 className="font-display font-semibold flex items-center gap-2"><PaintBucket className="h-4 w-4 text-primary" /> Design studio</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <ActionTile icon={PenTool} title="Merkrichting" body="Bezorg ons je merkrichting via je vaste designer — geen losse aanvragen meer nodig." />
          <ActionTile icon={UploadCloud} title="Merkbestanden" body="Voeg brand assets, formaten en referenties toe aan je aanvraag." />
          <ActionTile icon={Clock} title="Deadline" body={assignments[0]?.deadline ? fmtDate(assignments[0].deadline) : "Deadlines verschijnen zodra een opdracht ingepland is."} />
        </div>
      </div>
      <MiniPanel title="Design aanvragen" icon={PaintBucket} items={requests} empty="Nog geen design-aanvragen." />
    </section>
  );
}

function ConsultancyBlock({ contract, requests, assignments }: { contract: ModuleContract; requests: ModuleRequest[]; assignments: ModuleAssignment[] }) {
  const used = Number(contract.hours_used ?? 0);
  const total = Number(contract.hours_purchased ?? 0);
  return (
    <section className="grid lg:grid-cols-[1.2fr_0.8fr] gap-4">
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <h2 className="font-display font-semibold flex items-center gap-2"><GraduationCap className="h-4 w-4 text-primary" /> Consultancy workspace</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <ActionTile icon={Clock} title="Urenstand" body={total > 0 ? `${Math.max(0, total - used)} van ${total} uur beschikbaar` : "Uren worden bijgehouden per sessie."} />
          <ActionTile icon={Target} title="Strategievragen" body="Stel vragen over funnels, content, positionering of campagnes." />
          <ActionTile icon={Calendar} title="Sessies" body={assignments[0]?.scheduled_date ? `Volgende sessie: ${fmtDate(assignments[0].scheduled_date)}` : "Nieuwe sessies verschijnen in de planning."} />
        </div>
      </div>
      <MiniPanel title="Consultancy aanvragen" icon={MessageSquare} items={requests} empty="Nog geen consultancy-aanvragen." />
    </section>
  );
}

function AdsBlock({ contract, requests, assignments }: { contract: ModuleContract; requests: ModuleRequest[]; assignments: ModuleAssignment[] }) {
  return (
    <section className="grid lg:grid-cols-[1.2fr_0.8fr] gap-4">
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <h2 className="font-display font-semibold flex items-center gap-2"><Megaphone className="h-4 w-4 text-primary" /> Ads cockpit</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          <ActionTile icon={TrendingUp} title="Retainer" body={contract.monthly_fee ? `${fmtEur(Number(contract.monthly_fee))} per maand` : "Campagnebeheer actief binnen je pakket."} />
          <ActionTile icon={Target} title="Campagnes" body={assignments[0]?.title ?? "Campagnes worden hier opgevolgd zodra ze ingepland zijn."} />
          <ActionTile icon={BarChart3} title="Rapportage" body="Nieuwe resultaten en optimalisaties worden aan je aanvragen gekoppeld." />
        </div>
      </div>
      <MiniPanel title="Ads aanvragen" icon={Megaphone} items={requests} empty="Nog geen ads-aanvragen." />
    </section>
  );
}

function PlatformPills({ platforms }: { platforms: string[] }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Platforms</div>
      <div className="flex flex-wrap gap-2">
        {platforms.map((p) => (
          <span key={p} className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 capitalize">{p}</span>
        ))}
      </div>
    </div>
  );
}

function ActionTile({ icon: Icon, title, body }: { icon: React.ComponentType<{ className?: string }>; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4 min-h-32">
      <Icon className="h-4 w-4 text-primary mb-3" />
      <div className="font-medium text-sm">{title}</div>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{body}</p>
    </div>
  );
}

function ActionLink({ icon: Icon, title, body, to, search }: { icon: React.ComponentType<{ className?: string }>; title: string; body: string; to: string; search?: Record<string, string> }) {
  return (
    <Link to={to} search={search as never} className="rounded-lg border border-border bg-background p-4 min-h-32 hover:border-primary/40 transition block">
      <Icon className="h-4 w-4 text-primary mb-3" />
      <div className="font-medium text-sm">{title}</div>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{body}</p>
    </Link>
  );
}

function MiniPanel({ title, icon: Icon, items, empty }: { title: string; icon: React.ComponentType<{ className?: string }>; items: ModuleRequest[]; empty: string }) {
  return (
    <aside className="rounded-xl border border-border bg-card p-5 space-y-3">
      <h2 className="font-display font-semibold flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /> {title}</h2>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">{empty}</div>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 4).map((item) => (
            <div key={item.id} className="block rounded-lg border border-border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground">{item.reference}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">{item.status}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">{item.scheduled_start ? `Start: ${fmtDate(item.scheduled_start)}` : fmtDate(item.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
