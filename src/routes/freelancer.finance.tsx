import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Wallet } from "lucide-react";
import { myPartnerFinance } from "@/lib/partner-ledger.functions";

export const Route = createFileRoute("/freelancer/finance")({
  component: PartnerFinance,
  head: () => ({ meta: [{ title: "Mijn balans — NextGenMedia" }] }),
});

function fmt(n: number) {
  return new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
}

function PartnerFinance() {
  const fn = useServerFn(myPartnerFinance);
  const { data, isLoading } = useQuery({ queryKey: ["my-partner-finance"], queryFn: () => fn() });

  if (isLoading) return <div className="p-10 text-sm text-muted-foreground">Laden...</div>;
  if (!data?.partner) return <div className="p-10 text-sm text-muted-foreground">Geen partner profiel gevonden.</div>;

  const bal = data.balance;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries = data.entries as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settlements = data.settlements as any[];
  const earned = entries.filter((e) => Number(e.amount) > 0).reduce((s, e) => s + Number(e.amount), 0);
  const billed = entries.filter((e) => Number(e.amount) < 0).reduce((s, e) => s + Math.abs(Number(e.amount)), 0);

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-6 max-w-5xl">
      <header className="flex items-center gap-3">
        <Wallet className="h-6 w-6 text-primary" />
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-primary mb-1">Partner</div>
          <h1 className="font-display text-3xl font-bold">Mijn balans</h1>
        </div>
      </header>

      <div className="grid sm:grid-cols-3 gap-3">
        <Stat label="Open saldo" value={fmt(bal)} accent={bal > 0 ? "pos" : bal < 0 ? "neg" : "neutral"} />
        <Stat label="Totaal verdiend" value={fmt(earned)} />
        <Stat label="Aan ons verschuldigd" value={fmt(billed)} />
      </div>

      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="font-display text-lg font-bold">Settlements</h2>
        {settlements.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nog geen settlements.</p>
        ) : settlements.map((s) => (
          <div key={s.id} className="rounded-lg border border-border p-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm">
              <div className="font-semibold">{s.period_start} → {s.period_end}</div>
              <div className="text-xs text-muted-foreground">Status: {s.status}</div>
            </div>
            <div className={`font-display text-lg font-bold ${Number(s.net_amount) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {fmt(s.net_amount)}
            </div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="font-display text-lg font-bold">Boekingen</h2>
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
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-border/40">
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{e.occurred_on}</td>
                    <td className="py-2 pr-3 text-xs">{e.kind}</td>
                    <td className="py-2 pr-3 text-xs">{e.description || "—"}</td>
                    <td className={`py-2 pr-3 text-right font-semibold ${Number(e.amount) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(e.amount)}</td>
                    <td className="py-2 pr-3 text-[10px] uppercase tracking-wider text-muted-foreground">{e.status}</td>
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
