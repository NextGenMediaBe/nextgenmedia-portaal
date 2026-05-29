import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ClientSidebar } from "@/components/app-sidebar";
import { Toaster } from "sonner";

export const Route = createFileRoute("/portal")({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/login" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", sess.session.user.id);
    const list = (roles ?? []).map((r) => r.role);
    if (list.includes("admin")) throw redirect({ to: "/admin" });
    if (list.includes("freelancer") && !list.includes("client")) throw redirect({ to: "/freelancer" });
  },
  component: () => (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background text-foreground">
      <ClientSidebar />
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <Outlet />
      </main>
      <Toaster theme="light" position="top-right" richColors />
    </div>
  ),
});
