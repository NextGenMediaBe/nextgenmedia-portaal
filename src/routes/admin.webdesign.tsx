import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  Globe,
  Loader2,
  ExternalLink,
  Wrench,
  Sparkles,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  adminListWebdesignRequests,
  adminUpdateWebdesignRequest,
  adminGetUploadUrl,
  WD_ADMIN_STATUS_OPTIONS,
  WD_STATUS_LABELS,
} from "@/lib/webdesign.functions";

export const Route = createFileRoute("/admin/webdesign")({
  component: AdminWebdesign,
  head: () => ({ meta: [{ title: "Webdesign — NextGenMedia Admin" }] }),
});

type Attachment = { path: string; name: string; size?: number; type?: string };

const STATUS_BADGE: Record<string, string> = {
  new: "bg-primary/15 text-primary border-primary/30",
  in_review: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  estimated: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  in_progress: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  done: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
};

function AdminWebdesign() {
  const fn = useServerFn(adminListWebdesignRequests);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-webdesign"],
    queryFn: () => fn(),
  });

  const [filter, setFilter] = useState<"all" | "minor" | "major">("all");

  if (isLoading)
    return (
      <div className="p-10 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Laden…
      </div>
    );

  const items = (data?.items ?? []).filter((i) =>
    filter === "all" ? true : i.kind === filter,
  );

  const counts = {
    all: data?.items.length ?? 0,
    minor: data?.items.filter((i) => i.kind === "minor").length ?? 0,
    major: data?.items.filter((i) => i.kind === "major").length ?? 0,
  };

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-7">
      <header>
        <div className="text-xs uppercase tracking-[0.3em] text-primary mb-2">
          Diensten · Webdesign
        </div>
        <h1 className="font-display text-4xl font-bold flex items-center gap-3">
          <Globe className="h-7 w-7 text-primary" /> Webdesign-aanvragen
        </h1>
        <p className="text-muted-foreground mt-2">
          Alle inkomende klein en groot onderhoud, met uploads en status.
        </p>
      </header>

      <div className="inline-flex rounded-xl border border-border bg-card p-1">
        {[
          { id: "all" as const, label: `Alles (${counts.all})` },
          { id: "minor" as const, label: `Klein (${counts.minor})` },
          { id: "major" as const, label: `Groot (${counts.major})` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              filter === t.id
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-sm text-muted-foreground text-center">
          Geen aanvragen.
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map((r) => (
            <RequestCard key={r.id} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}

type Row = {
  id: string;
  title: string;
  description: string;
  status: string;
  kind: string;
  categories: string[] | null;
  hourly_rate: number;
  estimated_hours: number | null;
  estimated_cost: number | null;
  pages_count: number | null;
  extra_features: string | null;
  attachments: unknown;
  admin_notes: string | null;
  created_at: string;
  client_id: string;
  client_name: string;
  maintenance_included: boolean;
};

function RequestCard({ row }: { row: Row }) {
  const update = useServerFn(adminUpdateWebdesignRequest);
  const getUrl = useServerFn(adminGetUploadUrl);
  const qc = useQueryClient();
  const [status, setStatus] = useState(row.status);
  const [hours, setHours] = useState<string>(row.estimated_hours?.toString() ?? "");
  const [cost, setCost] = useState<string>(row.estimated_cost?.toString() ?? "");
  const [costDirty, setCostDirty] = useState(false);
  const [notes, setNotes] = useState(row.admin_notes ?? "");
  const atts = Array.isArray(row.attachments) ? (row.attachments as Attachment[]) : [];
  const rate = Number(row.hourly_rate) || 95;

  // Auto-compute cost = hours × rate (unless admin manually edited cost)
  const onHoursChange = (v: string) => {
    setHours(v);
    if (!costDirty) {
      const h = Number(v.replace(",", "."));
      if (Number.isFinite(h) && h > 0) {
        setCost((h * rate).toFixed(2));
      } else {
        setCost("");
      }
    }
  };

  const mutate = useMutation({
    mutationFn: () =>
      update({
        data: {
          id: row.id,
          status: status as
            | "new"
            | "in_review"
            | "estimated"
            | "approved"
            | "in_progress"
            | "done"
            | "rejected",
          estimated_hours: hours ? Number(hours.replace(",", ".")) : null,
          estimated_cost: cost ? Number(cost.replace(",", ".")) : null,
          admin_notes: notes || null,
        },
      }),

    onSuccess: () => {
      toast.success("Bijgewerkt");
      qc.invalidateQueries({ queryKey: ["admin-webdesign"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Mislukt"),
  });

  const openAttachment = async (path: string) => {
    try {
      const res = await getUrl({ data: { path } });
      window.open(res.url, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bestand niet beschikbaar");
    }
  };

  const KindIcon = row.kind === "major" ? Sparkles : Wrench;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-5 flex items-start justify-between gap-4 flex-wrap border-b border-border">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <KindIcon className="h-4 w-4 text-primary" />
            <span className="font-display font-semibold">{row.title}</span>
            <span
              className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                STATUS_BADGE[row.status] ?? "bg-muted text-muted-foreground border-border"
              }`}
            >
              {WD_STATUS_LABELS[row.status] ?? row.status}
            </span>
            {row.maintenance_included ? (
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Onderhoud inbegrepen
              </span>
            ) : (
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/30 inline-flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Offerte nodig
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {row.client_name} ·{" "}
            {new Date(row.created_at).toLocaleString("nl-BE", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>
      </div>

      <div className="p-5 grid lg:grid-cols-[1fr_320px] gap-5">
        <div className="space-y-3 min-w-0">
          <p className="text-sm whitespace-pre-wrap">{row.description}</p>

          {row.kind === "major" && (row.pages_count || row.extra_features) && (
            <div className="text-xs text-muted-foreground space-y-1">
              {row.pages_count != null && <div>📄 Nieuwe pagina&apos;s: {row.pages_count}</div>}
              {row.extra_features && (
                <div>⚙️ Extra: <span className="text-foreground">{row.extra_features}</span></div>
              )}
            </div>
          )}

          {atts.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                Bijlages ({atts.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {atts.map((a) => (
                  <button
                    key={a.path}
                    onClick={() => openAttachment(a.path)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border hover:border-foreground/40 text-xs transition"
                  >
                    <ExternalLink className="h-3 w-3" /> {a.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3 lg:border-l lg:border-border lg:pl-5">
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5 block font-medium">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-foreground"
            >
              {WD_ADMIN_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5 block font-medium">
                Uren
              </label>
              <input
                type="number"
                min={0}
                step={0.25}
                value={hours}
                onChange={(e) => onHoursChange(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5 block font-medium">
                Prijs (€)
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={cost}
                onChange={(e) => {
                  setCost(e.target.value);
                  setCostDirty(true);
                }}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-1">
            Tarief €{rate}/u · {hours ? `${hours}u × €${rate} = €${(Number(hours.replace(",", ".")) * rate).toFixed(2)}` : "vul uren in"}
          </p>

          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5 block font-medium">
              Interne notitie
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={() => mutate.mutate()}
            disabled={mutate.isPending}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition"
          >
            {mutate.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Opslaan"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
