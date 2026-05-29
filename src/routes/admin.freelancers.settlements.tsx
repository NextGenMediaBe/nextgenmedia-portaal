import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Wallet } from "lucide-react";
import { adminListPartnersWithBalance } from "@/lib/partner-ledger.functions";

export const Route = createFileRoute("/admin/freelancers/settlements")({
  component: SettlementsOverview,
  head: () => ({ meta: [{ title: "Settlements — NextGenMedia" }] }),
});

function fmt(n: number) {
  return new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
}

function SettlementsOverview() {
  const fn = useServerFn(adminListPartnersWithBalance);
  const { data, isLoading } = useQuery({ queryKey: ["partners-balance"], queryFn: () => fn() });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = (data?.partners ?? []) as any[];
  const totalOwed = list.reduce((s, p) => s + Math.max(0, Number(p.open_balance)), 0);
  const totalIncoming = list.reduce((s, p) => s + Math.max(0, -Number(p.open_balance)), 0);

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-6 max-w-6xl">
      <Link to="/admin/freelancers" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Partners
      </Link>
      <header>
        <div className="text-xs uppercase tracking-[0.3em] text-primary mb-2">Admin</div>
        <h1 className="font-display text-4xl font-bold">Settlements & balansen</h1>
        <p className="text-muted-foreground mt-1 text-sm">Overzicht van alle openstaande partnersaldi. Ga naar een partner om een settlement te genereren.</p>
      </header>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Wij betalen partners</div>
          <div className="font-display text-2xl font-bold mt-1 text-emerald-400">{fmt(totalOwed)}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Partners betalen ons</div>
          <div className="font-display text-2xl font-bold mt-1 text-red-400">{fmt(totalIncoming)}</div>
        </div>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Laden...</p> : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border bg-background/40">
                <th className="py-2 px-4">Partner</th>
                <th className="py-2 px-4">E-mail</th>
                <th className="py-2 px-4 text-right">Open saldo</th>
                <th className="py-2 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const bal = Number(p.open_balance);
                return (
                  <tr key={p.id} className="border-b border-border/40 hover:bg-secondary/30">
                    <td className="py-3 px-4">
                      <div className="font-semibold">{p.full_name}</div>
                      {p.company_name && <div className="text-xs text-muted-foreground">{p.company_name}</div>}
                    </td>
                    <td className="py-3 px-4 text-xs text-muted-foreground">{p.email}</td>
                    <td className={`py-3 px-4 text-right font-semibold ${bal > 0 ? "text-emerald-400" : bal < 0 ? "text-red-400" : "text-muted-foreground"}`}>{fmt(bal)}</td>
                    <td className="py-3 px-4 text-right">
                      <Link to="/admin/freelancers/$id" params={{ id: p.id }} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-secondary text-xs">
                        <Wallet className="h-3 w-3" /> Finance
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 && (
                <tr><td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">Nog geen partners.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
