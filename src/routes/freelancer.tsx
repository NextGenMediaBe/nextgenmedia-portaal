import { createFileRoute, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "sonner";
import { LogOut, Briefcase, Globe, Wallet, Send } from "lucide-react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import logoUrl from "@/assets/ngm-logo.png";

export const Route = createFileRoute("/freelancer")({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/login" });
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", sess.session.user.id)
      .eq("role", "freelancer")
      .maybeSingle();
    if (!role) throw redirect({ to: "/portal" });
  },
  component: FreelancerLayout,
});

function FreelancerLayout() {
  const navigate = useNavigate();
  const router = useRouter();
  const { location } = useRouterState();
  const items = [
    { to: "/freelancer", label: "Mijn opdrachten", icon: Briefcase, exact: true },
    { to: "/freelancer/open", label: "Open opdrachten", icon: Globe, exact: false },
    { to: "/freelancer/requests", label: "Mijn aanvragen", icon: Send, exact: false },
    { to: "/freelancer/finance", label: "Mijn balans", icon: Wallet, exact: false },
  ];
  const logout = async () => {
    try { await supabase.auth.signOut(); } catch {}
    await router.invalidate();
    navigate({ to: "/login" });
  };
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background text-foreground">
      <aside className="lg:w-64 shrink-0 lg:border-r border-sidebar-border bg-sidebar flex lg:flex-col lg:sticky lg:top-0 lg:h-screen">
        <div className="p-6 flex-1">
          <Link to="/freelancer" className="flex items-center gap-3">
            <img src={logoUrl} alt="NGM" className="h-9 w-9 object-contain" />
            <div className="font-display font-bold text-[15px]">NextGen<span className="font-black">Media</span></div>
          </Link>
          <div className="mt-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Partner Hub</div>
          <nav className="mt-8 space-y-1">
            {items.map((it) => {
              const active = it.exact ? location.pathname === it.to : location.pathname.startsWith(it.to);
              const Icon = it.icon;
              return (
                <Link key={it.to} to={it.to} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${active ? "bg-foreground text-background font-semibold" : "text-sidebar-foreground hover:bg-sidebar-accent"}`}>
                  <Icon className="h-4 w-4" /> {it.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <button onClick={logout} className="m-3 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
          <LogOut className="h-4 w-4" /> Uitloggen
        </button>
      </aside>
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <Outlet />
      </main>
      <Toaster theme="light" position="top-right" richColors />
    </div>
  );
}
