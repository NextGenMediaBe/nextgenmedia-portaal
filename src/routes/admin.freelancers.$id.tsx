import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Plus, Trash2, Wallet, FileText, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  adminGetPartnerFinance,
  adminCreateLedgerEntry,
  adminDeleteLedgerEntry,
  adminGenerateSettlement,
  adminMarkSettlementPaid,
} from "@/lib/partner-ledger.functions";

export const Route = createFileRoute("/admin/freelancers/$id")({
  component: PartnerFinancePage,
  head: () => ({ meta: [{ title: "Partner finance — NextGenMedia" }] }),
});

const KINDS = [
  { v: "payout_owed", l: "Uitbetaling (wij → partner)", sign: 1 },
  { v: "commission_owed", l: "Commissie / referral (wij → partner)", sign: 1 },
  { v: "service_billed", l: "Onze dienst aan partner (partner → wij)", sign: -1 },
  { v: "manual_credit", l: "Handmatig credit (wij → partner)", sign: 1 },
  { v: "manual_debit", l: "Handmatig debet (partner → wij)", sign: -1 },
] as const;

function fmt(n: number) {
  return new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
}

function PartnerFinancePage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const fn = useServerFn(adminGetPartnerFinance);
  const addFn = useServerFn(adminCreateLedgerEntry);
  const delFn = useServerFn(adminDeleteLedgerEntry);
  const settleFn = useServerFn(adminGenerateSettlement);
  const payFn = useServerFn(adminMarkSettlementPaid);

  const { data, isLoading } = useQuery({
    queryKey: ["partner-finance", id],
    queryFn: () => fn({ data: { freelancerId: id } }),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [kind, setKind] = useState<typeof KINDS[number]["v"]>("payout_owed");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [pStart, setPStart] = useState(monthStart);
  const [pEnd, setPEnd] = useState(monthEnd);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["partner-finance", id] });

  const addEntry = async () => {
    if (!amount) return toast.error("Bedrag verplicht");
    setBusy(true);
    try {
      const meta = KINDS.find((k) => k.v === kind)!;
      const signed = Math.abs(Number(amount)) * meta.sign;
      await addFn({ data: { freelancer_id: id, kind, amount: signed, description: desc, occurred_on: date } });
      toast.success("Boeking toegevoegd");
      setAmount(""); setDesc(""); setShowAdd(false);
      invalidate();
      qc.invalidateQueries({ queryKey: ["partners-balance"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Mislukt"); }
    finally { setBusy(false); }
  };

  const removeEntry = async (entryId: string) => {
    if (!confirm("Boeking verwijderen?")) return;
    try { await delFn({ data: { id: entryId } }); toast.success("Verwijderd"); invalidate(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Mislukt"); }
  };

  const generate = async () => {
    if (!confirm(`Settlement aanmaken voor periode ${pStart} → ${pEnd}? Alle openstaande boekingen in deze periode worden afgesloten.`)) return;
    setBusy(true);
    try {
      const res = await settleFn({ data: { freelancer_id: id, period_start: pStart, period_end: pEnd } });
      toast.success(`Settlement: ${fmt(res.net)} (${res.count} boekingen)`);
      invalidate();
      qc.invalidateQueries({ queryKey: ["partners-balance"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Mislukt"); }
    finally { setBusy(false); }
  };

  const markPaid = async (sid: string) => {
    try { await payFn({ data: { id: sid } }); toast.success("Gemarkeerd als betaald"); invalidate(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Mislukt"); }
  };

  if (isLoading) return <div className="p-10"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!data?.partner) return <div className="p-10 text-muted-foreground">Partner niet gevonden.</div>;

  const p = data.partner;
  const bal = data.balance;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries = data.entries as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settlements = data.settlements as any[];

  const totalEarned = entries.filter((e) => Number(e.amount) > 0).reduce((s, e) => s + Number(e.amount), 0);
  const totalBilled = entries.filter((e) => Number(e.amount) < 0).reduce((s, e) => s + Math.abs(Number(e.amount)), 0);
  const refTotal = entries.filter((e) => e.kind === "commission_owed").reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-6 max-w-6xl">
      <Link to="/admin/freelancers" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Alle partners
      </Link>
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-primary mb-2">Partner finance</div>
          <h1 className="font-display text-4xl font-bold">{p.full_name}</h1>
          {p.company_name && <p className="text-sm text-muted-foreground">{p.company_name}</p>}
          {p.iban && <p className="text-xs text-muted-foreground mt-1 font-mono">IBAN: {p.iban}</p>}
        </div>
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Open saldo" value={fmt(bal)} accent={bal > 0 ? "pos" : bal < 0 ? "neg" : "neutral"} />
        <Stat label="Totaal verdiend" value={fmt(totalEarned)} />
        <Stat label="Totaal gefactureerd aan partner" value={fmt(totalBilled)} />
        <Stat label="Referral commissies" value={fmt(refTotal)} />
      </div>

      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-bold">Maandelijkse settlement</h2>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <input type="date" value={pStart} onChange={(e) => setPStart(e.target.value)} className="px-2 py-1.5 rounded bg-background border border-border text-xs" />
            <span className="text-xs text-muted-foreground">→</span>
            <input type="date" value={pEnd} onChange={(e) => setPEnd(e.target.value)} className="px-2 py-1.5 rounded bg-background border border-border text-xs" />
            <button onClick={generate} disabled={busy} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
              Genereer settlement
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Eén afsluiting per maand: het systeem berekent automatisch het netto verschil tussen wat we de partner verschuldigd zijn en wat de partner ons verschuldigd is.</p>

        {settlements.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nog geen settlements.</p>
        ) : (
          <div className="space-y-2">
            {settlements.map((s) => (
              <div key={s.id} className="rounded-lg border border-border p-3 flex items-center justify-between gap-3 flex-wrap text-sm">
                <div>
                  <div className="font-semibold">{s.period_start} → {s.period_end}</div>
                  <div className="text-xs text-muted-foreground">
                    Wij: {fmt(s.total_owed_to_partner)} · Partner: {fmt(s.total_owed_by_partner)}
                  </div>
                </div>
                <div className={`font-display text-lg font-bold ${Number(s.net_amount) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {fmt(s.net_amount)}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-semibold ${
                    s.status === "paid" ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-amber-500/15 text-amber-400"
                  }`}>{s.status}</span>
                  {s.status !== "paid" && (
                    <button onClick={() => markPaid(s.id)} className="px-2 py-1 rounded border border-border hover:bg-secondary text-[10px] inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Betaald
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-bold">Ledger / boekingen</h2>
          </div>
          <button onClick={() => setShowAdd((v) => !v)} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center gap-1">
            <Plus className="h-3 w-3" /> Nieuwe boeking
          </button>
        </div>

        {showAdd && (
          <div className="rounded-lg border border-border bg-background/40 p-4 space-y-3">
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="w-full px-3 py-2 rounded bg-card border border-border text-sm">
              {KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}
            </select>
            <div className="grid sm:grid-cols-3 gap-3">
              <input type="number" placeholder="Bedrag (€)" value={amount} onChange={(e) => setAmount(e.target.value)} className="px-3 py-2 rounded bg-card border border-border text-sm" />
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-3 py-2 rounded bg-card border border-border text-sm" />
              <input placeholder="Omschrijving" value={desc} onChange={(e) => setDesc(e.target.value)} className="px-3 py-2 rounded bg-card border border-border text-sm sm:col-span-1" />
            </div>
            <div className="flex gap-2">
              <button onClick={addEntry} disabled={busy} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">Opslaan</button>
              <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 rounded border border-border text-xs">Annuleren</button>
            </div>
          </div>
        )}

        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nog geen boekingen.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">Datum</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Omschrijving</th>
                  <th className="py-2 pr-3 text-right">Bedrag</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-border/40">
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{e.occurred_on}</td>
                    <td className="py-2 pr-3 text-xs">{e.kind}</td>
                    <td className="py-2 pr-3 text-xs">{e.description || "—"}{e.clients?.company_name ? ` · ${e.clients.company_name}` : ""}</td>
                    <td className={`py-2 pr-3 text-right font-semibold ${Number(e.amount) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(e.amount)}</td>
                    <td className="py-2 pr-3 text-[10px] uppercase tracking-wider text-muted-foreground">{e.status}</td>
                    <td className="py-2 pr-3 text-right">
                      {e.status === "pending" && (
                        <button onClick={() => removeEntry(e.id)} className="text-muted-foreground hover:text-red-400">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "pos" | "neg" | "neutral" }) {
  const cls = accent === "pos" ? "text-emerald-400" : accent === "neg" ? "text-red-400" : "";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-display text-2xl font-bold mt-1 ${cls}`}>{value}</div>
    </div>
  );
}
