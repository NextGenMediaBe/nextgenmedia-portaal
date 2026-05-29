import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Loader2, Search, FileText, Trash2, Send, Ban, Copy as CopyIcon } from "lucide-react";
import { toast } from "sonner";
import {
  listContracts, adminSendContract, adminCancelContract, adminDeleteContract,
  STATUS_LABELS, STATUS_COLORS, SIGNING_STATUSES, type SigningStatus,
} from "@/lib/contract-docs.functions";

export const Route = createFileRoute("/admin/contracts/")({
  component: ContractsList,
  head: () => ({ meta: [{ title: "Contracten — NextGenMedia" }] }),
});

function ContractsList() {
  const [status, setStatus] = useState<SigningStatus | "">("");
  const [search, setSearch] = useState("");
  const fn = useServerFn(listContracts);
  const send = useServerFn(adminSendContract);
  const cancel = useServerFn(adminCancelContract);
  const del = useServerFn(adminDeleteContract);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["contracts-list", status, search],
    queryFn: () => fn({ data: { status: status || null, search: search || null } }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["contracts-list"] });
  const handleSend = async (id: string) => {
    try {
      const r = await send({ data: { id } });
      const url = `${window.location.origin}/sign/${r.access_token}`;
      await navigator.clipboard.writeText(url).catch(() => null);
      toast.success("Verzonden", { description: "Teken-link gekopieerd" });
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Mislukt"); }
  };

  const contracts = data?.contracts ?? [];

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-primary mb-2">Admin</div>
          <h1 className="font-display text-4xl font-bold">Contracten</h1>
          <p className="text-muted-foreground mt-1 text-sm">Upload PDFs, koppel ze aan diensten en laat klanten digitaal tekenen.</p>
        </div>
        <Link to="/admin/contracts/new" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 glow-yellow">
          <Plus className="h-4 w-4" /> Nieuw contract
        </Link>
      </header>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Zoek op titel…"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-card border border-border text-sm" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as SigningStatus | "")}
          className="px-3 py-2.5 rounded-lg bg-card border border-border text-sm">
          <option value="">Alle statussen</option>
          {SIGNING_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-3 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Laden…</div>
      ) : contracts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Nog geen contracten.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Contract</th>
                <th className="text-left px-4 py-3">Klant</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Aangemaakt</th>
                <th className="text-left px-4 py-3">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {contracts.map((c) => (
                <tr key={c.id} className="hover:bg-secondary/30">
                  <td className="px-4 py-3">
                    <Link to="/admin/contracts/$id" params={{ id: c.id }} className="font-medium hover:text-primary">{c.title}</Link>
                    <div className="text-xs text-muted-foreground">{c.signer_email}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.clients?.company_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded text-[10px] uppercase tracking-wider font-semibold ${STATUS_COLORS[c.status as SigningStatus]}`}>
                      {STATUS_LABELS[c.status as SigningStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(c.created_at).toLocaleDateString("nl-BE")}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {c.status === "draft" && (
                        <button onClick={() => handleSend(c.id)} title="Verzenden + link kopiëren"
                          className="h-7 px-2 inline-flex items-center gap-1 rounded border border-border hover:bg-secondary text-xs"><Send className="h-3 w-3" /> Verzend</button>
                      )}
                      {(c.status === "sent" || c.status === "viewed") && (
                        <button onClick={() => {
                          const url = `${window.location.origin}/sign/${(c as any).access_token ?? ""}`;
                          navigator.clipboard.writeText(url).catch(() => null);
                          toast.success("Link gekopieerd");
                        }} className="h-7 px-2 inline-flex items-center gap-1 rounded border border-border hover:bg-secondary text-xs" title="Kopieer teken-link"><CopyIcon className="h-3 w-3" /></button>
                      )}
                      {c.status !== "signed" && c.status !== "cancelled" && (
                        <button onClick={async () => { await cancel({ data: { id: c.id } }); toast.success("Geannuleerd"); refresh(); }}
                          className="h-7 px-2 inline-flex items-center gap-1 rounded border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 text-xs"><Ban className="h-3 w-3" /></button>
                      )}
                      <button onClick={async () => {
                        if (!confirm("Definitief verwijderen?")) return;
                        await del({ data: { id: c.id } }); toast.success("Verwijderd"); refresh();
                      }} className="h-7 px-2 inline-flex items-center gap-1 rounded border border-destructive/30 text-destructive hover:bg-destructive/10 text-xs"><Trash2 className="h-3 w-3" /></button>
                    </div>
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
