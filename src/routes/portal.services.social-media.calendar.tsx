import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getMySocialContent, reviewMySocialContent, type SocialContentItem } from "@/lib/social-content.functions";
import { ContentCalendar } from "@/components/content-calendar";

export const Route = createFileRoute("/portal/services/social-media/calendar")({
  component: SocialCalendarPage,
  head: () => ({ meta: [{ title: "Contentkalender — NextGenMedia" }] }),
});

function SocialCalendarPage() {
  const getContent = useServerFn(getMySocialContent);
  const reviewContent = useServerFn(reviewMySocialContent);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["social-content", "calendar"],
    queryFn: () => getContent({ data: { mode: "calendar" } }),
    retry: false,
  });

  const review = useMutation({
    mutationFn: (payload: { id: string; decision: "approved" | "changes_requested"; feedback?: string }) =>
      reviewContent({ data: payload }),
    onSuccess: () => {
      toast.success("Review opgeslagen");
      qc.invalidateQueries({ queryKey: ["social-content", "calendar"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Opslaan mislukt"),
  });

  if (isLoading) {
    return <div className="p-10 flex items-center gap-3 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Contentkalender laden…</div>;
  }
  if (error) return <AccessState message={error instanceof Error ? error.message : "Contentkalender laden mislukt"} />;
  if (!data?.hasAccess) return <AccessState message="Je krijgt toegang tot de contentkalender zodra het Social Media contract is ondertekend." />;

  const items = (data.items ?? []) as SocialContentItem[];

  return (
    <div className="p-4 sm:p-6 md:p-10 space-y-6 max-w-7xl">
      <Link to="/portal/services/$slug" params={{ slug: "social-media" }} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Terug naar Social Media
      </Link>
      <header>
        <div className="text-xs uppercase tracking-[0.3em] text-primary mb-2">Social Media</div>
        <h1 className="font-display text-4xl font-bold">Contentkalender</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">Bekijk geplande posts, reels en stories. Klik op een item om script en caption te zien en goed te keuren.</p>
      </header>

      <ContentCalendar
        items={items}
        mode="client"
        actions={{
          onApprove: async (id) => { await review.mutateAsync({ id, decision: "approved" }); },
          onRequestChanges: async (id, feedback) => { await review.mutateAsync({ id, decision: "changes_requested", feedback }); },
        }}
      />
    </div>
  );
}

function AccessState({ message }: { message: string }) {
  return (
    <div className="p-10 max-w-xl space-y-3">
      <Link to="/portal" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3 w-3" /> Terug</Link>
      <h1 className="font-display text-3xl font-bold">Social Media</h1>
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}
