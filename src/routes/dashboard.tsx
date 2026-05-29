import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) throw redirect({ to: "/login" });

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", sess.session.user.id);

    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    throw redirect({ to: isAdmin ? "/admin" : "/portal" });
  },
  component: () => null,
});
