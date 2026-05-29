import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { adminInviteClient } from "@/lib/portal.functions";
import { Loader2, UserPlus } from "lucide-react";
import { toast, Toaster } from "sonner";

export const Route = createFileRoute("/admin/clients/invite")({
  component: InviteClientPage,
  head: () => ({ meta: [{ title: "Klant uitnodigen — Admin" }] }),
});

function InviteClientPage() {
  const fn = useServerFn(adminInviteClient);
  const nav = useNavigate();
  const [form, setForm] = useState({ email: "", full_name: "", company_name: "" });
  const mut = useMutation({
    mutationFn: () => fn({ data: form }),
    onSuccess: () => { toast.success("Uitnodiging verstuurd"); nav({ to: "/admin/clients" }); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="p-6 md:p-10 max-w-xl">
      <Toaster theme="light" richColors position="top-right" />
      <div className="text-xs uppercase tracking-[0.3em] text-primary mb-2">Admin</div>
      <h1 className="font-display text-3xl font-bold">Nieuwe klant uitnodigen</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        De klant ontvangt een e-mail om een wachtwoord in te stellen en krijgt direct toegang tot het portal.
      </p>
      <form onSubmit={(e) => { e.preventDefault(); mut.mutate(); }} className="mt-8 space-y-4">
        <Field label="Volledige naam *" value={form.full_name} onChange={(v) => setForm((f) => ({ ...f, full_name: v }))} required />
        <Field label="E-mail *" type="email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} required />
        <Field label="Bedrijfsnaam" value={form.company_name} onChange={(v) => setForm((f) => ({ ...f, company_name: v }))} />
        <button
          type="submit"
          disabled={mut.isPending}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-50"
        >
          {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Verstuur uitnodiging
        </button>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full bg-input/40 border border-border rounded-lg px-3.5 py-3 text-sm focus:outline-none focus:border-primary"
      />
    </div>
  );
}
