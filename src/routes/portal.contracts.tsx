import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileSignature, Download, Loader2, CheckCircle2, Clock, FileText } from "lucide-react";
import { myContracts, myDownloadContractUrl } from "@/lib/portal-contracts.functions";
import { STATUS_LABELS, STATUS_COLORS, type SigningStatus } from "@/lib/contract-docs.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/contracts")({
  component: PortalContractsPage,
  head: () => ({ meta: [{ title: "Contracten — NextGenMedia" }] }),
});

function PortalContractsPage() {
  const fn = useServerFn(myContracts);
  const downloadFn = useServerFn(myDownloadContractUrl);
  const { data, isLoading } = useQuery({ queryKey: ["my-contracts"], queryFn: () => fn() });

  if (isLoading) {
    return (
      <div className="p-10 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Contracten laden…
      </div>
    );
  }

  const contracts = data?.contracts ?? [];
  const pending = contracts.filter((c) => c.status === "sent" || c.status === "viewed" || c.status === "draft");
  const signed = contracts.filter((c) => c.status === "signed");
  const archived = contracts.filter((c) => c.status === "cancelled");

  const download = async (id: string) => {
    try {
      const { url } = await downloadFn({ data: { id } });
      window.open(url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download mislukt");
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-8 max-w-5xl">
      <header>
        <div className="text-xs uppercase tracking-[0.3em] text-primary mb-2">Documenten</div>
        <h1 className="font-display text-4xl font-bold">Contracten</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Overzicht van al je contracten. Onderteken openstaande contracten zodat we de bijhorende diensten direct kunnen activeren.
        </p>
      </header>

      <Section title="Ter ondertekening" icon={Clock} accent>
        {pending.length === 0 ? (
          <Empty text="Geen contracten ter ondertekening." />
        ) : (
          <ul className="space-y-3">
            {pending.map((c) => (
              <ContractCard key={c.id} c={c}>
                {c.status !== "draft" && (
                  <Link
                    to="/sign/$token"
                    params={{ token: c.access_token }}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                  >
                    <FileSignature className="h-4 w-4" /> Ondertekenen
                  </Link>
                )}
              </ContractCard>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Ondertekend" icon={CheckCircle2}>
        {signed.length === 0 ? (
          <Empty text="Nog geen ondertekende contracten." />
        ) : (
          <ul className="space-y-3">
            {signed.map((c) => (
              <ContractCard key={c.id} c={c}>
                <button
                  onClick={() => download(c.id)}
                  className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary"
                >
                  <Download className="h-4 w-4" /> Download
                </button>
              </ContractCard>
            ))}
          </ul>
        )}
      </Section>

      {archived.length > 0 && (
        <Section title="Geannuleerd" icon={FileText}>
          <ul className="space-y-3">
            {archived.map((c) => (
              <ContractCard key={c.id} c={c} />
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, accent, children }: { title: string; icon: React.ComponentType<{ className?: string }>; accent?: boolean; children: React.ReactNode }) {
  return (
    <section className={`rounded-xl border ${accent ? "border-primary/40 bg-primary/5" : "border-border bg-card"} p-5 sm:p-6`}>
      <div className="flex items-center gap-2 mb-4">
        <Icon className={`h-4 w-4 ${accent ? "text-primary" : "text-muted-foreground"}`} />
        <h2 className="font-display font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ContractCard({ c, children }: { c: { id: string; title: string; status: string; created_at: string; signed_at: string | null }; children?: React.ReactNode }) {
  const status = c.status as SigningStatus;
  return (
    <li className="rounded-lg border border-border bg-background/40 p-4 flex items-center gap-4 flex-wrap">
      <div className="flex-1 min-w-0">
        <div className="font-display font-semibold truncate">{c.title}</div>
        <div className="text-xs text-muted-foreground mt-1">
          Aangemaakt {new Date(c.created_at).toLocaleDateString("nl-BE")}
          {c.signed_at && ` · Getekend ${new Date(c.signed_at).toLocaleDateString("nl-BE")}`}
        </div>
      </div>
      <span className={`text-xs px-2.5 py-1 rounded-md ${STATUS_COLORS[status] ?? ""}`}>{STATUS_LABELS[status] ?? status}</span>
      {children}
    </li>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-sm text-muted-foreground py-2">{text}</div>;
}
