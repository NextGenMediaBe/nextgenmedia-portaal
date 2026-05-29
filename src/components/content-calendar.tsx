import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X, Check, RefreshCw, Send, Pencil, Save, Image as ImageIcon, Video, FileText } from "lucide-react";
import type { SocialContentItem, SocialContentStatus } from "@/lib/social-content.functions";

export type CalendarMode = "admin" | "client";

const STATUS_TONE: Record<SocialContentStatus, string> = {
  draft: "bg-zinc-500/20 text-zinc-300 border-zinc-500/40",
  ready_for_review: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  approved: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  changes_requested: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  scheduled: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  published: "bg-violet-500/20 text-violet-300 border-violet-500/40",
};

const STATUS_LABELS: Record<SocialContentStatus, string> = {
  draft: "Concept",
  ready_for_review: "Bij klant",
  approved: "Goedgekeurd",
  changes_requested: "Feedback",
  scheduled: "Ingepland",
  published: "Gepubliceerd",
};

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  reel: Video,
  story: ImageIcon,
  post: FileText,
  carousel: FileText,
};

function startOfMonthGrid(d: Date): Date {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const dow = (first.getDay() + 6) % 7; // make Monday = 0
  return new Date(first.getFullYear(), first.getMonth(), 1 - dow);
}

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const WEEKDAYS = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

export type CalendarActions = {
  // admin
  onUpdate?: (id: string, patch: Partial<SocialContentItem>) => Promise<void> | void;
  onMove?: (id: string, planned_date: string) => Promise<void> | void;
  onSetStatus?: (id: string, status: SocialContentStatus) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
  onCreateOnDay?: (planned_date: string) => void;
  // client
  onApprove?: (id: string) => Promise<void> | void;
  onRequestChanges?: (id: string, feedback: string) => Promise<void> | void;
};


export function ContentCalendar({
  items, mode, actions,
}: {
  items: SocialContentItem[];
  mode: CalendarMode;
  actions: CalendarActions;
}) {
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"month" | "week">("month");

  const selected = items.find((i) => i.id === selectedId) ?? null;

  const days = useMemo(() => {
    const start = view === "month"
      ? startOfMonthGrid(cursor)
      : (() => { const s = new Date(cursor); const dow = (s.getDay() + 6) % 7; return new Date(s.getFullYear(), s.getMonth(), s.getDate() - dow); })();
    const count = view === "month" ? 42 : 7;
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor, view]);

  const byDay = useMemo(() => {
    const map = new Map<string, SocialContentItem[]>();
    for (const it of items) {
      const list = map.get(it.planned_date) ?? [];
      list.push(it);
      map.set(it.planned_date, list);
    }
    return map;
  }, [items]);

  const title = cursor.toLocaleDateString("nl-BE", { month: "long", year: "numeric" });
  const today = ymd(new Date());

  const navigate = (delta: number) => {
    const d = new Date(cursor);
    if (view === "month") d.setMonth(d.getMonth() + delta);
    else d.setDate(d.getDate() + delta * 7);
    setCursor(d);
  };

  const onDrop = async (e: React.DragEvent, dayStr: string) => {
    if (mode !== "admin") return;
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (id && actions.onMove) await actions.onMove(id, dayStr);
  };

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-4">
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-3 border-b border-border flex-wrap">
          <div className="flex items-center gap-1">
            <button onClick={() => navigate(-1)} className="h-8 w-8 grid place-items-center rounded-md hover:bg-secondary"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={() => setCursor(new Date())} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-secondary">Vandaag</button>
            <button onClick={() => navigate(1)} className="h-8 w-8 grid place-items-center rounded-md hover:bg-secondary"><ChevronRight className="h-4 w-4" /></button>
            <div className="ml-3 font-display font-semibold capitalize">{title}</div>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <button onClick={() => setView("month")} className={`px-2.5 py-1 rounded-md border ${view === "month" ? "bg-foreground text-background border-foreground" : "border-border hover:bg-secondary"}`}>Maand</button>
            <button onClick={() => setView("week")} className={`px-2.5 py-1 rounded-md border ${view === "week" ? "bg-foreground text-background border-foreground" : "border-border hover:bg-secondary"}`}>Week</button>
          </div>
        </div>

        <div className="grid grid-cols-7 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
          {WEEKDAYS.map((w) => <div key={w} className="px-2 py-1.5 text-center">{w}</div>)}
        </div>

        <div className={`grid grid-cols-7 ${view === "month" ? "grid-rows-6" : "grid-rows-1"}`}>
          {days.map((d, idx) => {
            const dayStr = ymd(d);
            const inMonth = view === "week" || d.getMonth() === cursor.getMonth();
            const isToday = dayStr === today;
            const dayItems = byDay.get(dayStr) ?? [];
            const canAdd = mode === "admin" && !!actions.onCreateOnDay;
            return (
              <div
                key={idx}
                onDragOver={(e) => mode === "admin" && e.preventDefault()}
                onDrop={(e) => onDrop(e, dayStr)}
                className={`group relative min-h-[110px] border-r border-b border-border p-1.5 flex flex-col gap-1 ${inMonth ? "" : "bg-background/40 opacity-50"} ${canAdd ? "hover:bg-secondary/40 transition" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <div className={`text-[11px] font-medium px-1 ${isToday ? "text-primary font-bold" : inMonth ? "text-foreground" : "text-muted-foreground"}`}>
                    {d.getDate()}
                  </div>
                  {canAdd && inMonth && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); actions.onCreateOnDay?.(dayStr); }}
                      className="opacity-0 group-hover:opacity-100 transition h-5 w-5 grid place-items-center rounded text-muted-foreground hover:bg-primary hover:text-primary-foreground"
                      title="Content toevoegen op deze dag"
                    >
                      +
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-1 overflow-hidden">
                  {dayItems.slice(0, view === "week" ? 12 : 4).map((it) => {
                    const Icon = TYPE_ICONS[it.content_type] ?? FileText;
                    return (
                      <button
                        key={it.id}
                        draggable={mode === "admin"}
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", it.id)}
                        onClick={() => setSelectedId(it.id)}
                        className={`text-left text-[11px] px-1.5 py-1 rounded border ${STATUS_TONE[it.status]} hover:brightness-125 transition truncate flex items-center gap-1`}
                        title={it.title}
                      >
                        <Icon className="h-3 w-3 shrink-0" />
                        <span className="truncate">{it.title}</span>
                      </button>
                    );
                  })}
                  {dayItems.length > (view === "week" ? 12 : 4) && (
                    <div className="text-[10px] text-muted-foreground px-1">+ {dayItems.length - (view === "week" ? 12 : 4)} meer</div>
                  )}
                </div>
              </div>
            );
          })}

        </div>

        <div className="p-3 border-t border-border flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          {(Object.keys(STATUS_LABELS) as SocialContentStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={`inline-block h-2 w-2 rounded-sm border ${STATUS_TONE[s]}`} />
              {STATUS_LABELS[s]}
            </span>
          ))}
        </div>
      </div>

      <ScriptPanel item={selected} mode={mode} actions={actions} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function ScriptPanel({ item, mode, actions, onClose }: { item: SocialContentItem | null; mode: CalendarMode; actions: CalendarActions; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<SocialContentItem | null>(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  // Reset form whenever item changes
  if (item && form?.id !== item.id) {
    setForm(item);
    setEditing(false);
    setFeedback(item.client_feedback ?? "");
  }

  if (!item) {
    return (
      <aside className="rounded-xl border border-border bg-card p-5 h-fit sticky top-6 text-sm text-muted-foreground">
        Klik op een item in de kalender om de details, het script en de feedback te bekijken.
      </aside>
    );
  }

  const f = form ?? item;
  const isAdmin = mode === "admin";

  const save = async () => {
    if (!isAdmin || !actions.onUpdate || !form) return;
    setBusy(true);
    try {
      await actions.onUpdate(item.id, {
        title: form.title,
        platform: form.platform,
        content_type: form.content_type,
        planned_date: form.planned_date,
        caption: form.caption,
        script: form.script,
        media_notes: form.media_notes,
      });
      setEditing(false);
    } finally { setBusy(false); }
  };

  const setStatus = async (s: SocialContentStatus) => {
    if (!actions.onSetStatus) return;
    setBusy(true);
    try { await actions.onSetStatus(item.id, s); } finally { setBusy(false); }
  };

  const approve = async () => {
    if (!actions.onApprove) return;
    setBusy(true);
    try { await actions.onApprove(item.id); } finally { setBusy(false); }
  };

  const requestChanges = async () => {
    if (!actions.onRequestChanges || !feedback.trim()) return;
    setBusy(true);
    try { await actions.onRequestChanges(item.id, feedback); } finally { setBusy(false); }
  };

  const inp = "w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-sm";

  return (
    <aside className="rounded-xl border border-border bg-card h-fit sticky top-6 max-h-[calc(100vh-3rem)] overflow-auto">
      <div className="p-4 border-b border-border flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${STATUS_TONE[item.status]}`}>{STATUS_LABELS[item.status]}</span>
            <span className="text-[11px] text-muted-foreground">{f.planned_date}</span>
          </div>
          {editing ? (
            <input className={inp} value={f.title} onChange={(e) => setForm({ ...f, title: e.target.value })} />
          ) : (
            <h3 className="font-display font-semibold leading-snug">{f.title}</h3>
          )}
          <div className="text-xs text-muted-foreground mt-0.5">{f.platform} · {f.content_type}</div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-secondary"><X className="h-4 w-4" /></button>
      </div>

      <div className="p-4 space-y-3">
        {editing && (
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground space-y-1">Datum<input type="date" className={inp} value={f.planned_date} onChange={(e) => setForm({ ...f, planned_date: e.target.value })} /></label>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground space-y-1">Platform<select className={inp} value={f.platform} onChange={(e) => setForm({ ...f, platform: e.target.value })}><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="tiktok">TikTok</option><option value="linkedin">LinkedIn</option></select></label>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground space-y-1">Type<select className={inp} value={f.content_type} onChange={(e) => setForm({ ...f, content_type: e.target.value })}><option value="post">Post</option><option value="reel">Reel</option><option value="story">Story</option><option value="carousel">Carousel</option></select></label>
          </div>
        )}

        <Section label="Caption" value={f.caption} editing={editing} onChange={(v) => setForm({ ...f, caption: v })} />
        <Section label="Script / Hook / CTA" value={f.script} editing={editing} onChange={(v) => setForm({ ...f, script: v })} rows={6} />
        <Section label="Media-notities" value={f.media_notes} editing={editing} onChange={(v) => setForm({ ...f, media_notes: v })} />

        {item.status === "changes_requested" && item.client_feedback && (
          <div className="text-xs rounded border border-rose-500/40 bg-rose-500/10 p-2 text-rose-200">
            <strong className="block mb-0.5">Feedback klant</strong>{item.client_feedback}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-border space-y-2">
        {isAdmin ? (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              {editing ? (
                <>
                  <button disabled={busy} onClick={save} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground font-semibold disabled:opacity-50"><Save className="h-3 w-3" /> Opslaan</button>
                  <button onClick={() => { setForm(item); setEditing(false); }} className="text-xs px-3 py-1.5 rounded border border-border hover:bg-secondary">Annuleer</button>
                </>
              ) : (
                <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border hover:bg-secondary"><Pencil className="h-3 w-3" /> Bewerken</button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {(item.status === "draft" || item.status === "changes_requested") && (
                <button disabled={busy} onClick={() => setStatus("ready_for_review")} className="text-xs px-2.5 py-1 rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 inline-flex items-center gap-1"><Send className="h-3 w-3" /> Naar klant</button>
              )}
              {item.status === "ready_for_review" && (
                <button disabled={busy} onClick={() => setStatus("draft")} className="text-xs px-2.5 py-1 rounded border border-border hover:bg-secondary">Terug naar concept</button>
              )}
              {item.status === "approved" && (
                <button disabled={busy} onClick={() => setStatus("scheduled")} className="text-xs px-2.5 py-1 rounded border border-sky-500/40 text-sky-300 hover:bg-sky-500/10">Inplannen</button>
              )}
              {item.status === "scheduled" && (
                <button disabled={busy} onClick={() => setStatus("published")} className="text-xs px-2.5 py-1 rounded border border-violet-500/40 text-violet-300 hover:bg-violet-500/10">Gepubliceerd</button>
              )}
              {actions.onDelete && (
                <button disabled={busy} onClick={async () => { if (confirm("Item verwijderen?")) { setBusy(true); try { await actions.onDelete!(item.id); onClose(); } finally { setBusy(false); } } }} className="text-xs px-2.5 py-1 rounded border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 ml-auto">Verwijder</button>
              )}
            </div>
          </>
        ) : (
          <>
            {(item.status === "ready_for_review" || item.status === "changes_requested") ? (
              <>
                <label className="block text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Feedback / opmerkingen</label>
                <textarea rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} className={inp} placeholder="Wat zou je aanpassen?" />
                <div className="flex justify-end gap-2 flex-wrap">
                  <button disabled={busy || !feedback.trim()} onClick={requestChanges} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border hover:bg-secondary disabled:opacity-50"><RefreshCw className="h-3 w-3" /> Wijzigingen vragen</button>
                  <button disabled={busy} onClick={approve} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground font-semibold disabled:opacity-50"><Check className="h-3 w-3" /> Goedkeuren</button>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Geen actie vereist op dit moment.</p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function Section({ label, value, editing, onChange, rows = 3 }: { label: string; value: string | null; editing: boolean; onChange: (v: string) => void; rows?: number }) {
  if (!editing && !value) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      {editing ? (
        <textarea rows={rows} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-sm" />
      ) : (
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{value}</p>
      )}
    </div>
  );
}
