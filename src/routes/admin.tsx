import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AdminSidebar } from "@/components/app-sidebar";
import { Toaster } from "sonner";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/login" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", sess.session.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roles) throw redirect({ to: "/portal" });
  },
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background text-foreground">
      <AdminSidebar />
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <Outlet />
      </main>
      <Toaster theme="light" position="top-right" richColors />
    </div>
  );
}
