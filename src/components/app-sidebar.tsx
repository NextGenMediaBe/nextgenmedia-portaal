import { Link, useRouterState, useNavigate, useRouter } from "@tanstack/react-router";
import { LayoutDashboard, Users, Calendar, LogOut, Menu, X, RefreshCw, Inbox, Camera, Palette, Globe, MessageSquare, Megaphone, Wrench, Briefcase, TrendingUp, Package, ChevronDown, FileSignature, BookOpen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { myServices, type ServiceSlug } from "@/lib/services.functions";
import logoUrl from "@/assets/ngm-logo.png";

function useLogout() {
  const navigate = useNavigate();
  const router = useRouter();
  return async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore — we still want to navigate to login
    }
    await router.invalidate();
    navigate({ to: "/login" });
  };
}

function RefreshButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [spinning, setSpinning] = useState(false);

  const handleRefresh = async () => {
    setSpinning(true);
    queryClient.invalidateQueries();
    await router.invalidate();
    setTimeout(() => setSpinning(false), 600);
  };

  return (
    <button
      onClick={handleRefresh}
      className={`h-9 w-9 grid place-items-center rounded-lg border border-border hover:bg-secondary hover:text-primary transition ${className}`}
      aria-label="Verversen"
      title="Verversen"
    >
      <RefreshCw className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`} />
    </button>
  );
}

function Logo({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex-1 min-w-0">
      <Link to="/dashboard" className="flex items-center gap-3">
        <img
          src={logoUrl}
          alt="NextGenMedia"
          width={36}
          height={36}
          loading="lazy"
          className="h-9 w-9 object-contain shrink-0"
        />
        <div className="font-display font-bold tracking-tight text-[15px] leading-tight">
          NextGen<span className="font-black">Media</span>
        </div>
      </Link>
      <div className="mt-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground font-medium">
        {subtitle}
      </div>
    </div>
  );
}

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; exact?: boolean; search?: Record<string, string> };
type NavGroup = { key: string; label: string; icon: React.ComponentType<{ className?: string }>; basePath: string; children: NavItem[] };
type NavEntry = NavItem | NavGroup;

function isGroup(e: NavEntry): e is NavGroup {
  return "children" in e;
}

function NavLinkItem({ item, onNavigate, depth = 0 }: { item: NavItem; onNavigate?: () => void; depth?: number }) {
  const { location } = useRouterState();
  const active = item.exact ? location.pathname === item.to : location.pathname === item.to;
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      search={item.search as never}
      onClick={onNavigate}
      className={`flex items-center gap-3 ${depth > 0 ? "pl-9 pr-3" : "px-3"} py-2 rounded-lg text-sm transition-all ${
        active
          ? "bg-foreground text-background font-semibold"
          : "text-sidebar-foreground hover:bg-sidebar-accent"
      }`}
    >
      <Icon className="h-4 w-4" />
      <span className="truncate">{item.label}</span>
      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
    </Link>
  );
}

function NavGroupItem({ group, onNavigate }: { group: NavGroup; onNavigate?: () => void }) {
  const { location } = useRouterState();
  const isInside = location.pathname.startsWith(group.basePath);
  const [open, setOpen] = useState(isInside);
  useEffect(() => { if (isInside) setOpen(true); }, [isInside]);
  const Icon = group.icon;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
          isInside ? "bg-sidebar-accent text-foreground font-semibold" : "text-sidebar-foreground hover:bg-sidebar-accent"
        }`}
      >
        <Icon className="h-4 w-4" />
        <span className="flex-1 text-left truncate">{group.label}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-1 space-y-0.5">
          {group.children.map((c) => (
            <NavLinkItem key={`${c.to}-${c.label}`} item={c} onNavigate={onNavigate} depth={1} />
          ))}
        </div>
      )}
    </div>
  );
}

function Nav({ items, onNavigate }: { items: NavEntry[]; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
      {items.map((it) =>
        isGroup(it)
          ? <NavGroupItem key={it.key} group={it} onNavigate={onNavigate} />
          : <NavLinkItem key={it.to} item={it} onNavigate={onNavigate} />
      )}
    </nav>
  );
}

function SidebarShell({ subtitle, items }: { subtitle: string; items: NavEntry[] }) {
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const { location } = useRouterState();

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const inner = (closeOnNav: boolean) => (
    <>
      <div className="p-6 flex items-start justify-between gap-2">
        <Logo subtitle={subtitle} />
        <div className="flex items-center gap-2 shrink-0">
          <RefreshButton />
          {closeOnNav && (
            <button
              onClick={() => setOpen(false)}
              className="lg:hidden h-9 w-9 grid place-items-center rounded-lg hover:bg-sidebar-accent text-muted-foreground"
              aria-label="Sluit menu"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
      <Nav items={items} onNavigate={closeOnNav ? () => setOpen(false) : undefined} />
      <button
        onClick={logout}
        className="m-3 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition"
      >
        <LogOut className="h-4 w-4" /> Uitloggen
      </button>
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 border-b border-sidebar-border bg-background/95 backdrop-blur">
        <Link to="/dashboard" className="flex items-center gap-2">
          <img src={logoUrl} alt="NextGenMedia" className="h-7 w-7 object-contain" />
          <span className="font-display font-bold text-sm">
            NextGen<span className="font-black">Media</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <RefreshButton />
          <button
            onClick={() => setOpen(true)}
            className="h-9 w-9 grid place-items-center rounded-lg border border-border hover:bg-secondary"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 border-r border-sidebar-border bg-sidebar flex-col sticky top-0 h-screen">
        {inner(false)}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button
            aria-label="Sluit overlay"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[85%] bg-sidebar border-r border-sidebar-border flex flex-col shadow-2xl animate-in slide-in-from-left duration-200">
            {inner(true)}
          </aside>
        </div>
      )}
    </>
  );
}

export function AdminSidebar() {
  const items: NavEntry[] = [
    { to: "/admin", label: "Command center", icon: LayoutDashboard, exact: true },
    {
      key: "operations", label: "Operations", icon: Briefcase, basePath: "/admin/clients",
      children: [
        { to: "/admin/clients", label: "Klanten", icon: Users },
        { to: "/admin/contracts", label: "Contracten", icon: FileSignature },
      ],
    },
    {
      key: "services", label: "Diensten", icon: Package, basePath: "/admin/services",
      children: [
        { to: "/admin/services/social-media", label: "Social Media", icon: MessageSquare },
        { to: "/admin/services/webdesign", label: "Webdesign", icon: Globe },
        { to: "/admin/services/marketing-consultancy", label: "Consultancy", icon: BookOpen },
        { to: "/admin/services/ads", label: "Google & Meta Ads", icon: Megaphone },
        { to: "/admin/services/foto-video", label: "Foto & Videografie", icon: Camera },
        { to: "/admin/services/grafisch-ontwerp", label: "Grafisch Ontwerp", icon: Palette },
      ],
    },
    {
      key: "partners", label: "Partners", icon: Users, basePath: "/admin/freelancers",
      children: [
        { to: "/admin/freelancers", label: "Partner overzicht", icon: Users },
        { to: "/admin/assignments", label: "Opdrachten", icon: Briefcase },
        { to: "/admin/partner-requests", label: "Aanvragen van partners", icon: Inbox },
        { to: "/admin/freelancers/settlements", label: "Settlements & balansen", icon: TrendingUp },
      ],
    },
  ];
  return <SidebarShell subtitle="Admin Studio" items={items} />;
}


function serviceGroup(slug: ServiceSlug, _maintenance: boolean): NavGroup | null {
  const base = `/portal/services/${slug}`;
  const overview: NavItem = { to: base, label: "Overzicht", icon: LayoutDashboard, exact: true };

  switch (slug) {
    case "social-media":
      return {
        key: slug, label: "Social Media", icon: MessageSquare, basePath: base,
        children: [
          overview,
          { to: "/portal/services/social-media/calendar", label: "Contentkalender", icon: Calendar },
          { to: "/portal/services/social-media/scripts", label: "Scripts & goedkeuring", icon: BookOpen },
        ],
      };
    case "webdesign":
      return {
        key: slug, label: "Webdesign", icon: Globe, basePath: base,
        children: [
          overview,
          { to: "/portal/services/webdesign/maintenance", label: "Website onderhoud", icon: Wrench },
        ],
      };
    case "grafisch-ontwerp":
      return { key: slug, label: "Branding & Design", icon: Palette, basePath: base, children: [overview] };
    case "foto-video":
      return { key: slug, label: "Foto & Video", icon: Camera, basePath: base, children: [overview] };
    case "marketing-consultancy":
      return { key: slug, label: "Consultancy", icon: MessageSquare, basePath: base, children: [overview] };
    case "ads":
      return { key: slug, label: "Ads", icon: Megaphone, basePath: base, children: [overview] };
  }
}


export function ClientSidebar() {
  const fn = useServerFn(myServices);
  const { data } = useQuery({ queryKey: ["my-services"], queryFn: () => fn(), staleTime: 60_000 });

  const serviceGroups = useMemo(() => {
    return (data?.services ?? [])
      .map((s) => serviceGroup(s.service_slug, s.maintenance_included))
      .filter((g): g is NavGroup => g !== null);
  }, [data]);

  const items: NavEntry[] = [
    { to: "/portal", label: "Mijn ruimte", icon: LayoutDashboard, exact: true },
    { to: "/portal/contracts", label: "Contracten", icon: FileSignature },
    ...serviceGroups,
  ];
  return <SidebarShell subtitle="Klantenruimte" items={items} />;
}
