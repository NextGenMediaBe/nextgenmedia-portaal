import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

async function destinationForCurrentUser(): Promise<"/admin" | "/portal" | "/freelancer" | null> {
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) return null;
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", sess.session.user.id);
  const list = (roles ?? []).map((r) => r.role);
  if (list.includes("admin")) return "/admin";
  if (list.includes("freelancer")) return "/freelancer";
  return "/portal";
}

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const dest = await destinationForCurrentUser();
    if (dest) throw redirect({ to: dest });
  },
  component: LoginPage,
  head: () => ({ meta: [{ title: "Inloggen — NextGenMedia" }] }),
});

function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      const msg = error.message ?? "";
      let friendly = "Inloggen niet gelukt. Probeer opnieuw.";
      if (/invalid login credentials/i.test(msg))
        friendly = "E-mail of wachtwoord klopt niet. Controleer je gegevens.";
      else if (/email not confirmed/i.test(msg))
        friendly = "Je account is nog niet bevestigd. Vraag NextGenMedia om je account te activeren.";
      else if (/too many requests|rate/i.test(msg))
        friendly = "Te veel pogingen. Wacht een minuut en probeer dan opnieuw.";
      setError(friendly);
      toast.error(friendly);
      return;
    }
    const dest = (await destinationForCurrentUser()) ?? "/portal";
    nav({ to: dest });
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-between p-12 bg-card grid-bg border-r border-border">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-primary grid place-items-center">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-lg">
            NextGen<span className="text-primary">Media</span>
          </span>
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-primary mb-3">
            Operations console
          </div>
          <h2 className="font-display text-5xl font-bold leading-tight">
            Welkom <span className="text-gradient-yellow">terug.</span>
          </h2>
          <p className="mt-4 text-muted-foreground max-w-sm">
            Log in om je scripts, contentkalender en planning te bekijken.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          Geen account? Vraag toegang bij het NextGenMedia team — accounts worden
          handmatig aangemaakt.
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div className="md:hidden flex items-center gap-2 mb-6">
            <div className="h-8 w-8 rounded-lg bg-primary grid place-items-center">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display font-bold">NextGenMedia</span>
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold">Inloggen</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Voer je e-mail en wachtwoord in.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              E-mail
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-input/40 border border-border rounded-lg px-3.5 py-3 text-sm focus:outline-none focus:border-primary transition"
              placeholder="jij@bedrijf.nl"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">
              Wachtwoord
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-input/40 border border-border rounded-lg px-3.5 py-3 text-sm focus:outline-none focus:border-primary transition"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-foreground text-background font-semibold py-3 hover:opacity-90 transition disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Inloggen"}
          </button>
        </form>
      </div>
    </div>
  );
}
