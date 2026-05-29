import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createClientWithAccount } from "@/lib/clients.functions";
import { SERVICE_SLUGS, SERVICE_LABELS, type ServiceSlug } from "@/lib/services.functions";
import { toast } from "sonner";
import { CalendarDays, Loader2, Globe, Layers } from "lucide-react";

export const Route = createFileRoute("/admin/clients/new")({
  component: NewClient,
  head: () => ({ meta: [{ title: "Nieuwe klant — NextGenMedia" }] }),
});

const PLATFORMS = [
  { id: "meta", label: "Meta (Instagram + Facebook)" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "pinterest", label: "Pinterest" },
  { id: "twitter", label: "Twitter / X" },
];


function defaultStartMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return "—";
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("nl-BE", {
    month: "long",
    year: "numeric",
  });
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function NewClient() {
  const fn = useServerFn(createClientWithAccount);

  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    company_name: "",
    niche: "",
    website_url: "",
    services: [] as ServiceSlug[],
    webdesign_maintenance_included: false,
    platforms: [] as string[],
    posts_per_month: 6,
    reels_per_month: 4,
    stories_per_month: 6,
    contract_months: 6 as 3 | 6 | 12,
    live_start_date: defaultStartMonth(),
    email: "",
    password: "",
    full_name: "",
  });

  const hasSocial = form.services.includes("social-media");
  const hasWebdesign = form.services.includes("webdesign");

  const toggleService = (slug: ServiceSlug) => {
    setForm((f) => ({
      ...f,
      services: f.services.includes(slug)
        ? f.services.filter((s) => s !== slug)
        : [...f.services, slug],
    }));
  };

  const togglePlatform = (id: string) => {
    setForm((f) => ({
      ...f,
      platforms: f.platforms.includes(id)
        ? f.platforms.filter((p) => p !== id)
        : [...f.platforms, id],
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.services.length === 0) {
      toast.error("Selecteer minimaal één dienst");
      return;
    }
    if (hasSocial && form.platforms.length === 0) {
      toast.error("Selecteer minimaal één platform voor Social Media");
      return;
    }
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await fn({ data: form as any });
      toast.success("Klant aangemaakt", {
        description: hasSocial
          ? "Stuur het contract. Na ondertekening kan je de intake doen en de contentkalender genereren."
          : "Diensten staan in afwachting. Stuur een contract om te activeren.",
      });
      nav({ to: "/admin/clients/$clientId", params: { clientId: res.clientId } });
    } catch (err) {
      toast.error("Aanmaken mislukt", { description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };


  const input =
    "w-full bg-background border border-border rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:border-foreground transition";
  const label = "text-xs uppercase tracking-wider text-muted-foreground mb-1.5 block font-medium";

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-3xl">
      <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-2 font-semibold">Admin · Onboarding</div>
      <h1 className="font-display text-4xl font-bold mb-2">Nieuwe klant aan boord</h1>
      <p className="text-muted-foreground mb-8">
        Selecteer de aangekochte diensten — alleen de relevante modules worden geactiveerd in het klantportaal.
      </p>

      <form onSubmit={submit} className="space-y-6">
        <section className="ng-card p-6 space-y-4">
          <h2 className="font-display font-semibold text-lg">Bedrijfsinformatie</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className={label}>Bedrijfsnaam</label>
              <input required className={input} value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
            </div>
            <div>
              <label className={label}>Niche {hasSocial ? "" : "(optioneel)"}</label>
              <input required={hasSocial} className={input} placeholder="bv. bouwbedrijf, fitnessstudio" value={form.niche} onChange={(e) => setForm({ ...form, niche: e.target.value })} />
            </div>
          </div>
          <div>
            <label className={label}><Globe className="inline h-3 w-3 mr-1" /> Website (optioneel)</label>
            <input type="url" className={input} placeholder="https://www.klant.be" value={form.website_url} onChange={(e) => setForm({ ...form, website_url: e.target.value })} />
          </div>
        </section>

        <section className="ng-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <h2 className="font-display font-semibold text-lg">Aangekochte diensten</h2>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Meerdere diensten mogelijk. Alleen geselecteerde modules worden geactiveerd in het portaal.
          </p>
          <div className="grid sm:grid-cols-2 gap-2">
            {SERVICE_SLUGS.map((slug) => {
              const active = form.services.includes(slug);
              return (
                <button
                  type="button"
                  key={slug}
                  onClick={() => toggleService(slug)}
                  className={`text-left p-3.5 rounded-lg border transition ${
                    active
                      ? "border-primary bg-primary/10 font-semibold"
                      : "border-border hover:border-foreground/40"
                  }`}
                >
                  <div className="text-sm">{SERVICE_LABELS[slug]}</div>
                </button>
              );
            })}
          </div>
          {hasWebdesign && (
            <div className="pt-3 mt-2 border-t border-border space-y-2">
              <div className="text-sm font-medium">Onderhoud inbegrepen?</div>
              <p className="text-xs text-muted-foreground">
                Bepaalt of kleine aanpassingen direct ingepland worden of een offerte krijgen.
              </p>
              <div className="flex gap-2">
                {[
                  { value: true, label: "Ja, inbegrepen" },
                  { value: false, label: "Nee, per offerte" },
                ].map((opt) => {
                  const active = form.webdesign_maintenance_included === opt.value;
                  return (
                    <button
                      type="button"
                      key={String(opt.value)}
                      onClick={() => setForm({ ...form, webdesign_maintenance_included: opt.value })}
                      className={`flex-1 px-4 py-2.5 rounded-lg border text-sm transition ${
                        active
                          ? "bg-foreground text-background border-foreground font-semibold"
                          : "border-border hover:border-foreground/40"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {hasSocial && (
          <section className="ng-card p-6 space-y-4">
            <h2 className="font-display font-semibold text-lg">Social Media setup</h2>
            <div>
              <label className={label}>Platforms</label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => {
                  const active = form.platforms.includes(p.id);
                  return (
                    <button type="button" key={p.id} onClick={() => togglePlatform(p.id)}
                      className={`px-3.5 py-2 rounded-lg text-sm border transition ${
                        active ? "bg-foreground text-background border-foreground font-semibold" : "border-border hover:border-foreground/40"
                      }`}>
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {(["reels_per_month", "posts_per_month", "stories_per_month"] as const).map((k) => (
                <div key={k}>
                  <label className={label}>{k.split("_")[0]}/maand</label>
                  <input type="number" min={0} required className={input} value={form[k]} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} />
                </div>
              ))}
            </div>
          </section>
        )}

        {(hasSocial || (hasWebdesign && form.webdesign_maintenance_included)) && (
          <section className="ng-card p-6 space-y-4">
            <h2 className="font-display font-semibold text-lg">Contract & start</h2>
            <p className="text-xs text-muted-foreground -mt-2">
              Het contract start op de <span className="font-semibold">1e van de gekozen maand</span>.
              {hasSocial ? " (Social Media)" : " (Webdesign onderhoud)"}
            </p>
            <div>
              <label className={label}>Startmaand contract</label>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setForm({ ...form, live_start_date: shiftMonth(form.live_start_date, -1) })}
                  className="h-11 w-11 grid place-items-center rounded-lg border border-border hover:bg-secondary transition text-lg">‹</button>
                <div className="flex-1 min-w-[220px] h-11 px-4 rounded-lg border-2 border-foreground bg-secondary/30 grid place-items-center font-display text-lg font-bold capitalize">
                  {monthLabel(form.live_start_date)}
                </div>
                <button type="button" onClick={() => setForm({ ...form, live_start_date: shiftMonth(form.live_start_date, 1) })}
                  className="h-11 w-11 grid place-items-center rounded-lg border border-border hover:bg-secondary transition text-lg">›</button>
              </div>
            </div>
            {hasSocial && (
              <div>
                <label className={label}>Contractduur</label>
                <div className="flex gap-2">
                  {[3, 6, 12].map((m) => (
                    <button type="button" key={m} onClick={() => setForm({ ...form, contract_months: m as 3 | 6 | 12 })}
                      className={`flex-1 px-4 py-2.5 rounded-lg border text-sm transition ${
                        form.contract_months === m ? "bg-foreground text-background border-foreground font-semibold" : "border-border hover:border-foreground/40"
                      }`}>
                      {m} maanden
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <section className="ng-card p-6 space-y-4">
          <h2 className="font-display font-semibold text-lg">Klantaccount</h2>
          <p className="text-xs text-muted-foreground -mt-2">Login voor het klantportaal.</p>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className={label}>Volledige naam</label>
              <input required className={input} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div>
              <label className={label}>E-mail</label>
              <input type="email" required className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <div>
            <label className={label}>Wachtwoord (min. 8 tekens)</label>
            <input type="text" required minLength={8} className={input} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
        </section>

        <button type="submit" disabled={loading}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition disabled:opacity-60 glow-yellow">
          {loading ? (<><Loader2 className="h-4 w-4 animate-spin" /> Aanmaken…</>) : (<><CalendarDays className="h-4 w-4" /> Klant aanmaken</>)}
        </button>
      </form>
    </div>
  );
}
