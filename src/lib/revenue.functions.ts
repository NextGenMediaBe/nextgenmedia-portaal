import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Alleen admins mogen deze actie uitvoeren");
}

type SC = {
  id: string;
  client_id: string;
  service_slug: string;
  model: string;
  status: string;
  monthly_fee: number | null;
  setup_fee: number | null;
  hourly_rate: number | null;
  hours_purchased: number | null;
  hours_used: number | null;
  start_date: string | null;
  end_date: string | null;
  clients?: { company_name: string } | null;
};

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const adminRevenueOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const { data, error } = await supabaseAdmin
      .from("service_contracts")
      .select("id, client_id, service_slug, model, status, monthly_fee, setup_fee, hourly_rate, hours_purchased, hours_used, start_date, end_date, clients(company_name)")
      .order("start_date", { ascending: true });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as unknown as SC[];

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), 1);

    // === MRR: actieve recurring contracten op deze maand ===
    const isActiveNow = (c: SC) => {
      if (c.status !== "active") return false;
      if (!c.monthly_fee || c.monthly_fee <= 0) return false;
      const s = c.start_date ? new Date(c.start_date) : null;
      const e = c.end_date ? new Date(c.end_date) : null;
      if (s && s > now) return false;
      if (e && e < today) return false;
      return true;
    };
    const mrr = rows.filter(isActiveNow).reduce((sum, c) => sum + Number(c.monthly_fee || 0), 0);
    const activeRecurringCount = rows.filter(isActiveNow).length;

    // === Maandelijkse omzet (12 maanden terug + huidige) ===
    const months: { key: string; label: string; recurring: number; setup: number; total: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: monthKey(d),
        label: d.toLocaleDateString("nl-BE", { month: "short", year: "2-digit" }),
        recurring: 0,
        setup: 0,
        total: 0,
      });
    }
    const idx = new Map(months.map((m, i) => [m.key, i]));

    for (const c of rows) {
      // Setup: telt in start-maand
      if (c.setup_fee && c.setup_fee > 0 && c.start_date) {
        const k = monthKey(new Date(c.start_date));
        const i = idx.get(k);
        if (i != null) months[i].setup += Number(c.setup_fee);
      }
      // Recurring: telt elke maand tussen start en eind dat overlapt met venster
      if (c.monthly_fee && c.monthly_fee > 0) {
        const start = c.start_date ? new Date(c.start_date) : null;
        const end = c.end_date ? new Date(c.end_date) : null;
        if (!start) continue;
        for (const m of months) {
          const [y, mo] = m.key.split("-").map(Number);
          const monthStart = new Date(y, mo - 1, 1);
          const monthEnd = new Date(y, mo, 0);
          if (start > monthEnd) continue;
          if (end && end < monthStart) continue;
          if (c.status === "cancelled" && end && end < monthStart) continue;
          m.recurring += Number(c.monthly_fee);
        }
      }
    }
    months.forEach((m) => (m.total = m.recurring + m.setup));

    const totalYear = months.reduce((s, m) => s + m.total, 0);
    const totalAllTime = rows.reduce((s, c) => {
      // alle uitgefactureerde setup + alle maanden recurring tot vandaag
      let v = 0;
      if (c.setup_fee && c.start_date && new Date(c.start_date) <= now) v += Number(c.setup_fee);
      if (c.monthly_fee && c.start_date) {
        const s = new Date(c.start_date);
        const e = c.end_date && new Date(c.end_date) < now ? new Date(c.end_date) : now;
        if (e >= s) {
          const monthsCount = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
          v += monthsCount * Number(c.monthly_fee);
        }
      }
      return s + v;
    }, 0);

    // === Per klant ===
    const perClient = new Map<string, { client_id: string; company_name: string; mrr: number; setup: number; contracts: number }>();
    for (const c of rows) {
      const key = c.client_id;
      const entry = perClient.get(key) ?? {
        client_id: key,
        company_name: c.clients?.company_name ?? "—",
        mrr: 0, setup: 0, contracts: 0,
      };
      entry.contracts += 1;
      if (isActiveNow(c)) entry.mrr += Number(c.monthly_fee || 0);
      if (c.setup_fee) entry.setup += Number(c.setup_fee || 0);
      perClient.set(key, entry);
    }
    const clientsBreakdown = [...perClient.values()].sort((a, b) => b.mrr - a.mrr);

    // === Per dienst ===
    const perService = new Map<string, { service_slug: string; mrr: number; setup: number; contracts: number }>();
    for (const c of rows) {
      const entry = perService.get(c.service_slug) ?? { service_slug: c.service_slug, mrr: 0, setup: 0, contracts: 0 };
      entry.contracts += 1;
      if (isActiveNow(c)) entry.mrr += Number(c.monthly_fee || 0);
      if (c.setup_fee) entry.setup += Number(c.setup_fee || 0);
      perService.set(c.service_slug, entry);
    }
    const servicesBreakdown = [...perService.values()].sort((a, b) => b.mrr - a.mrr);

    // === Renewals (sociale media einde + webdesign maintenance/hosting verlengingen binnen 60 dagen) ===
    const horizon = new Date(now.getTime() + 60 * 86400_000);
    const renewals: { client_id: string; company_name: string; type: string; date: string; service_slug: string }[] = [];
    for (const c of rows as any[]) {
      if (c.status !== "active") continue;
      const company = c.clients?.company_name ?? "—";
      if (c.service_slug === "social-media" && c.end_date) {
        const d = new Date(c.end_date);
        if (d >= now && d <= horizon) renewals.push({ client_id: c.client_id, company_name: company, type: "Social Media contract verloopt", date: c.end_date, service_slug: c.service_slug });
      }
      if (c.service_slug === "webdesign") {
        const cfg = c.config ?? {};
        if (cfg.maintenance_enabled && cfg.maintenance_renewal_at) {
          const d = new Date(cfg.maintenance_renewal_at);
          if (d >= now && d <= horizon) renewals.push({ client_id: c.client_id, company_name: company, type: "Website-onderhoud verlengen", date: cfg.maintenance_renewal_at, service_slug: c.service_slug });
        }
        if (cfg.hosting_enabled && cfg.hosting_renewal_at) {
          const d = new Date(cfg.hosting_renewal_at);
          if (d >= now && d <= horizon) renewals.push({ client_id: c.client_id, company_name: company, type: "Hosting verlengen", date: cfg.hosting_renewal_at, service_slug: c.service_slug });
        }
      }
    }
    renewals.sort((a, b) => a.date.localeCompare(b.date));

    return {
      mrr,
      activeRecurringCount,
      arr: mrr * 12,
      totalYear,
      totalAllTime,
      months,
      clientsBreakdown,
      servicesBreakdown,
      renewals,
      activeContracts: rows.filter((c) => c.status === "active").length,
      totalContracts: rows.length,
    };
  });

export const adminListAllServiceContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("service_contracts")
      .select("*, clients(company_name)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { contracts: data ?? [] };
  });
