import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, BookOpen, CalendarDays, Loader2 } from "lucide-react";
import { getMySocialContent, type SocialContentItem } from "@/lib/social-content.functions";

export const Route = createFileRoute("/portal/services/social-media/scripts")({
  component: SocialScriptsPage,
  head: () => ({ meta: [{ title: "Scripts — NextGenMedia" }] }),
});

function SocialScriptsPage() {
  const getContent = useServerFn(getMySocialContent);
  const { data, isLoading, error } = useQuery({
    queryKey: ["social-content", "scripts"],
    queryFn: () => getContent({ data: { mode: "scripts" } }),
    retry: false,
  });

  if (isLoading) return <div className="p-10 flex items-center gap-3 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Scripts laden…</div>;
  if (error || !data?.hasAccess) return <AccessState message={error instanceof Error ? error.message : "Je krijgt toegang tot scripts zodra het Social Media contract is ondertekend."} />;

  const items = (data.items ?? []) as SocialContentItem[];

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-7 max-w-5xl">
      <header className="space-y-4">
        <Link to="/portal/services/$slug" params={{ slug: "social-media" }} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Terug naar Social Media
        </Link>
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-primary mb-2">Social Media</div>
          <h1 className="font-display text-4xl font-bold">Scripts & briefings</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">Alle captions, videohooks en scripts die aan je contentkalender gekoppeld zijn.</p>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <BookOpen className="h-6 w-6 text-primary mx-auto mb-3" />
          <h2 className="font-display font-semibold">Nog geen scripts beschikbaar</h2>
          <p className="text-sm text-muted-foreground mt-1">Zodra er content met captions of scripts klaarstaat, zie je die hier.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <article key={item.id} className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <CalendarDays className="h-3.5 w-3.5 text-primary" /> {formatDate(item.planned_date)} · {item.platform} · {item.content_type}
                  </div>
                  <h2 className="font-display font-semibold text-xl">{item.title}</h2>
                </div>
                <Link to="/portal/services/social-media/calendar" className="text-xs font-semibold text-primary">Open in kalender →</Link>
              </div>
              {item.caption && <Block label="Caption" value={item.caption} />}
              {item.script && <Block label="Script" value={item.script} />}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Block({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">{label}</div><p className="text-sm leading-relaxed whitespace-pre-wrap">{value}</p></div>;
}

function AccessState({ message }: { message: string }) {
  return <div className="p-10 max-w-xl space-y-3"><Link to="/portal" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3 w-3" /> Terug</Link><h1 className="font-display text-3xl font-bold">Scripts</h1><p className="text-muted-foreground">{message}</p></div>;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("nl-BE", { day: "2-digit", month: "short", year: "numeric" });
}
