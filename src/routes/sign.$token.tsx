import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Loader2, Check, ShieldCheck, FileText, Download, Eraser } from "lucide-react";
import { toast, Toaster } from "sonner";
import { getContractByToken } from "@/lib/contract-docs.functions";
import { submitClientSignature, downloadConfirmationByToken } from "@/lib/contract-sign.functions";

export const Route = createFileRoute("/sign/$token")({
  component: SignPage,
  head: () => ({ meta: [{ title: "Contract ondertekenen" }] }),
});

type FormState = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  vat_number: string;
  date: string;
};

const EMPTY: FormState = {
  first_name: "", last_name: "", email: "", phone: "",
  address: "", vat_number: "", date: new Date().toISOString().slice(0, 10),
};

function SignPage() {
  const { token } = Route.useParams();
  const contractFn = useServerFn(getContractByToken);
  const submitFn = useServerFn(submitClientSignature);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sign", token],
    queryFn: () => contractFn({ data: { token } }),
    retry: false,
  });

  const [form, setForm] = useState<FormState>(EMPTY);
  const [signature, setSignature] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (data?.contract.signer_email && !form.email) {
      setForm((p) => ({ ...p, email: data.contract.signer_email ?? "" }));
    }
    if (data?.contract.signer_name && !form.first_name && !form.last_name) {
      const [fn, ...rest] = (data.contract.signer_name ?? "").split(" ");
      setForm((p) => ({ ...p, first_name: fn ?? "", last_name: rest.join(" ") }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.contract.signer_email, data?.contract.signer_name]);

  if (isLoading) {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (error) {
    return (
      <div className="min-h-screen grid place-items-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold mb-2">Contract niet beschikbaar</h1>
          <p className="text-muted-foreground">{error instanceof Error ? error.message : "Onbekende fout"}</p>
        </div>
      </div>
    );
  }
  if (!data) return null;
  const c = data.contract;
  if (c.status === "signed") return <SignedConfirmation token={token} />;

  const validEmail = /\S+@\S+\.\S+/.test(form.email);
  const allFilled = form.first_name && form.last_name && validEmail
    && form.phone && form.address && form.vat_number && form.date;
  const canSubmit = !!signature && accepted && allFilled;

  const handleSubmit = async () => {
    if (!canSubmit) {
      if (!allFilled) toast.error("Vul alle velden in");
      else if (!signature) toast.error("Plaats je handtekening");
      else if (!accepted) toast.error("Bevestig de akkoordverklaring");
      return;
    }
    setSubmitting(true);
    try {
      await submitFn({
        data: {
          token,
          ...form,
          signature_data: signature!,
          accepted_terms: true,
        },
      });
      toast.success("Contract ondertekend");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mislukt");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster theme="light" position="top-center" richColors />
      <header className="border-b border-border bg-card/50 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-primary font-semibold">NextGenMedia</div>
            <h1 className="font-display text-lg font-bold">{c.title}</h1>
          </div>
          <div className="text-xs text-muted-foreground hidden sm:flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Beveiligde ondertekening
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-6 md:p-8 grid lg:grid-cols-5 gap-6">
        {/* Contract preview */}
        <section className="lg:col-span-3 rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="text-sm font-semibold flex items-center gap-2"><FileText className="h-4 w-4" /> Contract</div>
            {data.pdfUrl && (
              <a href={data.pdfUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Openen in nieuw tabblad</a>
            )}
          </div>
          {data.pdfUrl ? (
            <iframe src={data.pdfUrl} title="Contract" className="w-full h-[70vh] bg-white" />
          ) : (
            <div className="p-10 text-center text-muted-foreground text-sm">PDF niet beschikbaar</div>
          )}
        </section>

        {/* Signing form */}
        <section className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="font-display font-semibold">Jouw gegevens</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Voornaam" value={form.first_name} onChange={(v) => setForm((p) => ({ ...p, first_name: v }))} />
              <Field label="Familienaam" value={form.last_name} onChange={(v) => setForm((p) => ({ ...p, last_name: v }))} />
            </div>
            <Field label="E-mailadres" type="email" value={form.email} onChange={(v) => setForm((p) => ({ ...p, email: v }))} />
            <Field label="Telefoonnummer" type="tel" value={form.phone} onChange={(v) => setForm((p) => ({ ...p, phone: v }))} />
            <Field label="Adres" value={form.address} onChange={(v) => setForm((p) => ({ ...p, address: v }))} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="BTW-nummer" value={form.vat_number} onChange={(v) => setForm((p) => ({ ...p, vat_number: v }))} />
              <Field label="Datum" type="date" value={form.date} onChange={(v) => setForm((p) => ({ ...p, date: v }))} />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="font-display font-semibold">Handtekening</h2>
            <SignaturePad value={signature} onChange={setSignature} />
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <label className="flex items-start gap-3 text-sm cursor-pointer">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
              <span className="leading-relaxed">
                Ik verklaar dat ik akkoord ga met de{" "}
                <a href="/algemene-voorwaarden" target="_blank" rel="noreferrer" className="text-primary underline">algemene voorwaarden</a>,{" "}
                <a href="/privacyverklaring" target="_blank" rel="noreferrer" className="text-primary underline">privacyverklaring</a>{" "}
                en de inhoud van dit contract. Ik begrijp dat deze digitale ondertekening juridisch bindend is.
              </span>
            </label>
            <button
              onClick={handleSubmit}
              disabled={submitting || !canSubmit}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Ondertekenen
            </button>
            <p className="text-[11px] text-muted-foreground text-center">Beveiligd ondertekend via NextGenMedia.</p>
          </div>
        </section>
      </main>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:border-primary outline-none transition-colors"
      />
    </label>
  );
}

function SignaturePad({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const hasInk = useRef(false);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = cvs.getBoundingClientRect();
    cvs.width = rect.width * ratio;
    cvs.height = rect.height * ratio;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, rect.width, rect.height);
  }, []);

  const pos = (e: React.PointerEvent) => {
    const cvs = canvasRef.current!;
    const rect = cvs.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    drawing.current = true;
    last.current = pos(e);
    canvasRef.current?.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    hasInk.current = true;
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (hasInk.current && canvasRef.current) {
      onChange(canvasRef.current.toDataURL("image/png"));
    }
  };

  const clear = () => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    const rect = cvs.getBoundingClientRect();
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    hasInk.current = false;
    onChange(null);
  };

  return (
    <div>
      <div className="rounded-lg border border-border bg-white relative">
        <canvas
          ref={canvasRef}
          className="block w-full h-40 touch-none rounded-lg"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
        {!value && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none text-muted-foreground text-xs">
            Teken hier je handtekening
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{value ? "Handtekening geplaatst" : "Nog niet ondertekend"}</span>
        <button onClick={clear} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <Eraser className="h-3.5 w-3.5" /> Wissen
        </button>
      </div>
    </div>
  );
}

function SignedConfirmation({ token }: { token: string }) {
  const dl = useServerFn(downloadConfirmationByToken);
  const [busy, setBusy] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session));
  }, []);
  return (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <Toaster theme="light" position="top-center" richColors />
      <div className="max-w-md">
        <div className="h-16 w-16 mx-auto rounded-full bg-emerald-500/15 text-emerald-400 grid place-items-center mb-4">
          <Check className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Contract ondertekend</h1>
        <p className="text-muted-foreground mb-6">Bedankt. Je diensten zijn nu geactiveerd — je kan ze terugvinden in je klantenruimte.</p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          {hasSession ? (
            <Link to="/portal" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold">
              Naar mijn klantenruimte →
            </Link>
          ) : (
            <Link to="/login" search={{ redirect: "/portal" } as never} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold">
              Inloggen om verder te gaan →
            </Link>
          )}
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await dl({ data: { token } });
                window.open(r.url, "_blank");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Mislukt");
              } finally { setBusy(false); }
            }}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-border hover:bg-secondary font-semibold disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Bevestiging downloaden
          </button>
        </div>
      </div>
    </div>
  );
}
