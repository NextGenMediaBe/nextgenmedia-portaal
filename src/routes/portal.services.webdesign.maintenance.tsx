import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Send,
  Clock,
  Wrench,
  Sparkles,
  Upload,
  X,
  Image as ImageIcon,
  CheckCircle2,
} from "lucide-react";
import {
  getMyWebdesignContext,
  submitWebdesignSmall,
  submitWebdesignLarge,
  WD_STATUS_LABELS,
} from "@/lib/webdesign.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/portal/services/webdesign/maintenance")({
  component: WebMaintenancePage,
  head: () => ({ meta: [{ title: "Website onderhoud — NextGenMedia" }] }),
});

type Attachment = { path: string; name: string; size?: number; type?: string };

const CATEGORIES = [
  { id: "texts" as const, label: "Teksten aanpassen" },
  { id: "colors" as const, label: "Kleuren aanpassen" },
  { id: "images" as const, label: "Afbeeldingen aanpassen" },
  { id: "other" as const, label: "Andere kleine wijziging" },
];

function WebMaintenancePage() {
  const ctxFn = useServerFn(getMyWebdesignContext);
  const { data, isLoading } = useQuery({
    queryKey: ["wd-context"],
    queryFn: () => ctxFn(),
    retry: false,
  });

  const [tab, setTab] = useState<"small" | "large">(
    data?.maintenance ? "small" : "large",
  );

  if (isLoading)
    return (
      <div className="p-10 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Laden…
      </div>
    );
  if (!data?.hasAccess) {
    return (
      <div className="p-10 max-w-xl space-y-3">
        <Link
          to="/portal"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Terug
        </Link>
        <h1 className="font-display text-3xl font-bold">Website onderhoud</h1>
        <p className="text-muted-foreground">
          Je krijgt toegang zodra het Webdesign contract is ondertekend.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-8 max-w-3xl">
      <Link
        to="/portal/services/$slug"
        params={{ slug: "webdesign" }}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Terug naar Webdesign
      </Link>

      <header>
        <div className="text-xs uppercase tracking-[0.3em] text-primary mb-2">
          Webdesign
        </div>
        <h1 className="font-display text-4xl font-bold">Website onderhoud</h1>
        <p className="text-muted-foreground mt-2">
          {data.maintenance
            ? "Onderhoud is inbegrepen — kleine aanpassingen worden direct ingepland, onbeperkt."
            : "Onderhoud is niet inbegrepen — enkel grote uitbreidingen via offerte (€95/u)."}
        </p>
      </header>

      {/* Segmented tabs — small only when maintenance is included */}
      <div className="inline-flex rounded-xl border border-border bg-card p-1">
        {data.maintenance && (
          <button
            type="button"
            onClick={() => setTab("small")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
              tab === "small"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Wrench className="h-4 w-4" /> Klein onderhoud
          </button>
        )}
        <button
          type="button"
          onClick={() => setTab("large")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
            tab === "large"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sparkles className="h-4 w-4" /> Groot onderhoud
        </button>
      </div>

      {tab === "small" && data.maintenance ? (
        <SmallForm clientId={data.clientId} />
      ) : (
        <LargeForm clientId={data.clientId} />
      )}

      <RequestsList items={data.items} />
    </div>
  );
}


// ===================== Small =====================

function SmallForm({ clientId }: { clientId: string }) {
  const submit = useServerFn(submitWebdesignSmall);
  const qc = useQueryClient();
  const [cats, setCats] = useState<("texts" | "colors" | "images" | "other")[]>([]);
  const [textChanges, setTextChanges] = useState("");
  const [colorChanges, setColorChanges] = useState("");
  const [imageNotes, setImageNotes] = useState("");
  const [otherNotes, setOtherNotes] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const toggle = (id: (typeof cats)[number]) =>
    setCats((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const mutate = useMutation({
    mutationFn: () =>
      submit({
        data: {
          categories: cats,
          text_changes: textChanges,
          color_changes: colorChanges,
          image_notes: imageNotes,
          other_notes: otherNotes,
          attachments,
        },
      }),
    onSuccess: () => {
      toast.success("Aanvraag ingepland — we starten ermee.");
      setCats([]);
      setTextChanges("");
      setColorChanges("");
      setImageNotes("");
      setOtherNotes("");
      setAttachments([]);
      qc.invalidateQueries({ queryKey: ["wd-context"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Mislukt"),
  });

  const canSubmit =
    cats.length > 0 &&
    !mutate.isPending &&
    cats.every((c) => {
      if (c === "texts") return textChanges.trim().length > 0;
      if (c === "colors") return colorChanges.trim().length > 0;
      if (c === "images") return imageNotes.trim().length > 0 || attachments.length > 0;
      if (c === "other") return otherNotes.trim().length > 0;
      return true;
    });


  return (
    <section className="ng-card p-6 space-y-5">
      <h2 className="font-display font-semibold text-lg flex items-center gap-2">
        <Wrench className="h-4 w-4 text-primary" /> Klein onderhoud
      </h2>
      <p className="text-sm text-muted-foreground -mt-3">
        Tekst-, kleur- en afbeeldingswijzigingen. Kies één of meer categorieën.
      </p>

      <div className="grid sm:grid-cols-2 gap-2">
        {CATEGORIES.map((c) => {
          const active = cats.includes(c.id);
          return (
            <button
              type="button"
              key={c.id}
              onClick={() => toggle(c.id)}
              className={`text-left p-3.5 rounded-lg border transition flex items-center gap-3 ${
                active
                  ? "border-primary bg-primary/10 font-semibold"
                  : "border-border hover:border-foreground/40"
              }`}
            >
              <span
                className={`h-4 w-4 rounded border grid place-items-center ${
                  active ? "bg-primary border-primary" : "border-border"
                }`}
              >
                {active && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
              </span>
              {c.label}
            </button>
          );
        })}
      </div>

      {cats.includes("texts") && (
        <Field label="Welke teksten moeten aangepast worden?">
          <textarea
            rows={4}
            value={textChanges}
            onChange={(e) => setTextChanges(e.target.value)}
            className={inputCls}
            placeholder="Geef pagina + huidige tekst + gewenste tekst…"
          />
        </Field>
      )}
      {cats.includes("colors") && (
        <Field label="Welke kleuren moeten aangepast worden?">
          <textarea
            rows={3}
            value={colorChanges}
            onChange={(e) => setColorChanges(e.target.value)}
            className={inputCls}
            placeholder="bv. knop-achtergrond #fff848 → #000"
          />
        </Field>
      )}
      {cats.includes("images") && (
        <div className="space-y-3">
          <Field label="Welke afbeeldingen moeten vervangen worden?">
            <textarea
              rows={3}
              value={imageNotes}
              onChange={(e) => setImageNotes(e.target.value)}
              className={inputCls}
              placeholder="Geef pagina, positie, en upload de nieuwe afbeeldingen."
            />
          </Field>
          <UploadBox
            clientId={clientId}
            attachments={attachments}
            onChange={setAttachments}
          />
        </div>
      )}
      {cats.includes("other") && (
        <Field label="Beschrijf de wijziging">
          <textarea
            rows={4}
            value={otherNotes}
            onChange={(e) => setOtherNotes(e.target.value)}
            className={inputCls}
          />
        </Field>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
        <p className="text-xs text-muted-foreground">
          Wordt direct ingepland — geen offerte, onbeperkt binnen je onderhoudscontract.
        </p>
        <button
          disabled={!canSubmit}
          onClick={() => mutate.mutate()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition"
        >
          {mutate.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Aanvraag inplannen
        </button>
      </div>

    </section>
  );
}

// ===================== Large =====================

function LargeForm({ clientId }: { clientId: string }) {
  const submit = useServerFn(submitWebdesignLarge);
  const qc = useQueryClient();
  const [description, setDescription] = useState("");
  const [pages, setPages] = useState<string>("");
  const [features, setFeatures] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const mutate = useMutation({
    mutationFn: () =>
      submit({
        data: {
          description,
          pages_count: pages ? Number(pages) : undefined,
          extra_features: features,
          attachments,
        },
      }),
    onSuccess: () => {
      toast.success("Aanvraag verstuurd — je krijgt een offerte.");
      setDescription("");
      setPages("");
      setFeatures("");
      setAttachments([]);
      qc.invalidateQueries({ queryKey: ["wd-context"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Mislukt"),
  });

  return (
    <section className="ng-card p-6 space-y-5">
      <h2 className="font-display font-semibold text-lg flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" /> Groot onderhoud
      </h2>
      <p className="text-sm text-muted-foreground -mt-3">
        Nieuwe pagina&apos;s, secties, functionaliteit of redesigns. Wordt apart
        gefactureerd.
      </p>

      <Field label="Omschrijving">
        <textarea
          rows={5}
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputCls}
          placeholder="Beschrijf de gewenste uitbreiding zo concreet mogelijk."
        />
      </Field>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Aantal nieuwe pagina's (optioneel)">
          <input
            type="number"
            min={0}
            value={pages}
            onChange={(e) => setPages(e.target.value)}
            className={inputCls}
            placeholder="bv. 3"
          />
        </Field>
      </div>

      <Field label="Extra functionaliteit">
        <textarea
          rows={3}
          value={features}
          onChange={(e) => setFeatures(e.target.value)}
          className={inputCls}
          placeholder="bv. boekingssysteem, meertaligheid, integratie met X…"
        />
      </Field>

      <UploadBox
        clientId={clientId}
        attachments={attachments}
        onChange={setAttachments}
        label="Voorbeelden of referenties (optioneel)"
      />

      <div className="flex items-center justify-end pt-2">
        <button
          disabled={mutate.isPending || description.trim().length < 10}
          onClick={() => mutate.mutate()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition"
        >
          {mutate.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Offerte aanvragen
        </button>
      </div>
    </section>
  );
}

// ===================== Shared bits =====================

const inputCls =
  "w-full bg-background border border-border rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-foreground transition";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5 block font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function UploadBox({
  clientId,
  attachments,
  onChange,
  label = "Upload afbeeldingen",
}: {
  clientId: string;
  attachments: Attachment[];
  onChange: (a: Attachment[]) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const next: Attachment[] = [...attachments];
    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name} is groter dan 20MB`);
        continue;
      }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${clientId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
      const { error } = await supabase.storage
        .from("webdesign-uploads")
        .upload(path, file, { upsert: false });
      if (error) {
        toast.error(`${file.name}: ${error.message}`);
        continue;
      }
      next.push({ path, name: file.name, size: file.size, type: file.type });
    }
    setUploading(false);
    onChange(next);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5 block font-medium">
        {label}
      </label>
      <div
        onClick={() => inputRef.current?.click()}
        className="rounded-xl border-2 border-dashed border-border hover:border-foreground/40 transition cursor-pointer p-6 text-center"
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Uploaden…
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <Upload className="h-5 w-5" />
            Klik of sleep bestanden hierheen — max 20MB per bestand
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {attachments.length > 0 && (
        <ul className="mt-3 grid gap-2">
          {attachments.map((a) => (
            <li
              key={a.path}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm"
            >
              <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0 truncate">{a.name}</div>
              <button
                type="button"
                onClick={() => onChange(attachments.filter((x) => x.path !== a.path))}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Verwijder"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ===================== Requests list =====================

type Item = {
  id: string;
  title: string;
  description: string;
  status: string;
  kind: string;
  categories: string[] | null;
  estimated_hours: number | null;
  estimated_cost: number | null;
  hourly_rate: number;
  attachments: unknown;
  created_at: string;
};

function RequestsList({ items }: { items: Item[] }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display font-semibold flex items-center gap-2">
        <Clock className="h-4 w-4 text-primary" /> Mijn aanvragen
      </h2>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground text-center">
          Nog geen aanvragen ingediend.
        </div>
      ) : (
        <div className="grid gap-2">
          {items.map((r) => {
            const atts = Array.isArray(r.attachments) ? (r.attachments as Attachment[]) : [];
            return (
              <div key={r.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-semibold text-sm">{r.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Date(r.created_at).toLocaleDateString("nl-BE", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      · {r.kind === "major" ? "Groot" : "Klein"}
                    </div>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                    {WD_STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                  {r.description}
                </p>
                {atts.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-2">
                    📎 {atts.length} bijlage{atts.length > 1 ? "s" : ""}
                  </div>
                )}
                {(r.estimated_hours || r.estimated_cost) && (
                  <div className="text-xs text-muted-foreground mt-2">
                    Inschatting: {r.estimated_hours ?? "—"}u · €{r.estimated_cost ?? "—"}{" "}
                    (€{r.hourly_rate}/u)
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
