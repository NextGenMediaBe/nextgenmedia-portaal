import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { Loader2, Package, Search } from "lucide-react";
import { adminListAllServiceContracts } from "@/lib/revenue.functions";

export const Route = createFileRoute("/admin/services")({
  component: ServicesOverview,
  head: () => ({ meta: [{ title: "Diensten — NextGenMedia" }] }),
});

const SERVICE_LABEL: Record<string, string> = {
  "social-media": "Social Media",
  "foto-video": "Foto & Video",
  "grafisch-ontwerp": "Grafisch Ontwerp",
  webdesign: "Webdesign",
  "marketing-consultancy": "Consultancy",
  ads: "Ads",
};
const MODEL_LABEL: Record<string, string> = {
  social_recurring: "Recurring (maand)",
  webdesign_project: "Project",
  webdesign_maintenance: "Maintenance",
  consultancy_hours: "Uren-bundel",
  consultancy_recurring: "Recurring (maand)",
  ads_recurring: "Recurring (maand)",
  photo_video_project: "Project",
  design_project: "Project",
};
const eur = (n: number | null) => n == null ? "—" : new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

function ServicesOverview() {
  const fn = useServerFn(adminListAllServiceContracts);
  const { data, isLoading } = useQuery({ queryKey: ["all-service-contracts"], queryFn: () => fn() });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all"|"active"|"paused"|"cancelled">("all");
  const [service, setService] = useState<string>("all");

  const list = (data?.contracts ?? []) as any[];
  const filtered = useMemo(() => {
    return list.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (service !== "all" && c.service_slug !== service) return false;
      if (q) {
        const hay = `${c.clients?.company_name ?? ""} ${c.service_slug} ${c.notes ?? ""}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [list, status, service, q]);

  const serviceSlugs = Array.from(new Set(list.map((c) => c.service_slug)));

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-6">
      <header>
        <div className="text-xs uppercase tracking-[0.3em] text-primary mb-2">Admin</div>
        <h1 className="font-display text-4xl font-bold">Diensten</h1>
        <p className="text-muted-foreground text-sm mt-1">Overzicht van alle dienst-contracten per klant — prijzen, status en looptijd.</p>
      </header>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek klant of dienst…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-card border border-border text-sm" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="px-3 py-2 rounded-lg bg-card border border-border text-sm">
          <option value="all">Alle statussen</option>
          <option value="active">Actief</option>
          <option value="paused">Gepauzeerd</option>
          <option value="cancelled">Geannuleerd</option>
        </select>
        <select value={service} onChange={(e) => setService(e.target.value)} className="px-3 py-2 rounded-lg bg-card border border-border text-sm">
          <option value="all">Alle diensten</option>
          {serviceSlugs.map((s) => <option key={s} value={s}>{SERVICE_LABEL[s] ?? s}</option>)}
        </select>
      </div>

      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Geen dienst-contracten in deze weergave.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Klant</th>
                <th className="text-left px-4 py-3">Dienst</th>
                <th className="text-left px-4 py-3">Model</th>
                <th className="text-right px-4 py-3">Maand</th>
                <th className="text-right px-4 py-3">Setup</th>
                <th className="text-right px-4 py-3">Uren</th>
                <th className="text-left px-4 py-3">Periode</th>
                <th className="text-left px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-secondary/30">
                  <td className="px-4 py-3">
                    <Link to="/admin/clients/$clientId" params={{ clientId: c.client_id }} className="font-medium hover:text-primary">
                      {c.clients?.company_name ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{SERVICE_LABEL[c.service_slug] ?? c.service_slug}</td>
                  <td className="px-4 py-3 text-muted-foreground">{MODEL_LABEL[c.model] ?? c.model}</td>
                  <td className="px-4 py-3 text-right">{eur(c.monthly_fee)}</td>
                  <td className="px-4 py-3 text-right">{eur(c.setup_fee)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {c.hours_purchased ? `${c.hours_used ?? 0} / ${c.hours_purchased}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {c.start_date ?? "—"} {c.end_date ? `→ ${c.end_date}` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-semibold ${
                      c.status === "active" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      : c.status === "paused" ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                      : "bg-muted text-muted-foreground"
                    }`}>{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
