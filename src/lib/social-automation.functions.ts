import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Generate a strategic content calendar for a Social Media client.
 *
 * IMPORTANT — content philosophy:
 *  - We do NOT generate finished scripts or full copywriting.
 *  - Each item is a *creative direction*: hook angle, content goal, CTA direction
 *    and a structural framework. The admin/creator writes the actual script later.
 *  - Items are created with status "draft" so the admin can review/edit before
 *    sending them to the client for approval.
 */

const PlanItem = z.object({
  title: z.string(),
  angle: z.string(), // strategic angle / content goal
  hook: z.string(),  // hook direction
  framework: z.string(), // structural framework, NOT full copy
  cta: z.string(),   // CTA direction
  content_type: z.enum(["reel", "post", "story"]),
  platform: z.string(),
  planned_date: z.string(), // YYYY-MM-DD
  media_notes: z.string().optional().default(""),
});

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role")
    .eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Alleen admins mogen deze actie uitvoeren");
}

function spreadDates(count: number, startISO: string, daysWindow = 28): string[] {
  if (count <= 0) return [];
  const start = new Date(startISO);
  const dates: string[] = [];
  const stepDays = Math.max(1, Math.floor(daysWindow / count));
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i * stepDays);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function addMonthsISO(iso: string, months: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export const generateSocialPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      serviceContractId: z.string().uuid(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      months: z.number().int().min(1).max(12).optional().default(1),
      // optional per-month frequency overrides for "extra content"
      override: z.object({
        reels: z.number().int().min(0).max(60).optional(),
        posts: z.number().int().min(0).max(60).optional(),
        stories: z.number().int().min(0).max(60).optional(),
      }).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: sc } = await supabaseAdmin
      .from("service_contracts")
      .select("id, client_id, config, status")
      .eq("id", data.serviceContractId)
      .maybeSingle();
    if (!sc) throw new Error("Service contract niet gevonden");

    const cfg = (sc.config ?? {}) as Record<string, unknown>;
    const reels = Number(data.override?.reels ?? cfg.reels ?? cfg.reels_per_month ?? 0);
    const posts = Number(data.override?.posts ?? cfg.posts ?? cfg.posts_per_month ?? 0);
    const stories = Number(data.override?.stories ?? cfg.stories ?? cfg.stories_per_month ?? 0);
    const channels = (Array.isArray(cfg.channels)
      ? cfg.channels
      : Array.isArray(cfg.platforms)
        ? cfg.platforms
        : ["instagram"]) as string[];
    const intake = (cfg.intake as string | undefined) ?? "";
    const perMonthCount = reels + posts + stories;
    if (perMonthCount === 0) throw new Error("Configureer eerst reels/posts/stories aantallen");

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("company_name, niche, website_url")
      .eq("id", sc.client_id)
      .maybeSingle();

    const today = new Date().toISOString().slice(0, 10);
    const baseStart = data.startDate ?? today;

    const apiKey = process.env.LOVABLE_API_KEY;
    const allItems: z.infer<typeof PlanItem>[] = [];

    for (let monthIdx = 0; monthIdx < data.months; monthIdx++) {
      const monthStart = addMonthsISO(baseStart, monthIdx);
      let items: z.infer<typeof PlanItem>[] = [];

      if (apiKey) {
        const prompt = `Je bent een Nederlandstalige social media strateeg voor NextGenMedia.
Genereer een STRATEGISCHE contentkalender voor ${client?.company_name ?? "een klant"} (niche: ${client?.niche ?? "onbekend"}).
${intake ? `INTAKE / strategie context:\n${intake}\n` : ""}
Maak EXACT ${reels} reels, ${posts} posts en ${stories} stories voor de maand startend op ${monthStart}.
Kanalen: ${channels.join(", ")}.

BELANGRIJK: lever GEEN volledige scripts of uitgewerkte copywriting. Lever per item:
- title: korte werktitel
- angle: strategische invalshoek / content-doel (1 zin)
- hook: richting voor de hook (1 zin, geen volledige tekst)
- framework: structurele opbouw (bv. "Hook → 3 pijnpunten → oplossing → CTA")
- cta: CTA-richting (1 korte zin)
- content_type: "reel" | "post" | "story"
- platform: kies uit kanalen
- planned_date: YYYY-MM-DD, spreid de items over de maand
- media_notes: korte productie-notitie

Antwoord ALLEEN met een geldige JSON array, geen extra tekst.`;

        try {
          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: "Je bent een Nederlandstalige social media strateeg. Antwoord altijd met geldige JSON array." },
                { role: "user", content: prompt },
              ],
            }),
          });
          if (res.ok) {
            const json = await res.json() as { choices?: { message?: { content?: string } }[] };
            const txt = json.choices?.[0]?.message?.content ?? "";
            const match = txt.match(/\[[\s\S]*\]/);
            if (match) {
              const parsed = JSON.parse(match[0]);
              items = z.array(PlanItem).parse(parsed);
            }
          }
        } catch (e) {
          console.error("AI generation failed, falling back to templates", e);
        }
      }

      if (items.length === 0) {
        // Fallback strategische templates
        const reelDates = spreadDates(reels, monthStart);
        const postDates = spreadDates(posts, monthStart);
        const storyDates = spreadDates(stories, monthStart);
        const pick = (i: number) => channels[i % channels.length] ?? "instagram";
        items = [
          ...reelDates.map((d, i) => ({
            title: `Reel ${i + 1} — strategische angle`,
            angle: "Educatief: pijnpunt van de doelgroep in beeld brengen",
            hook: "Open met een herkenbare frustratie of fout-bekentenis",
            framework: "Hook (3s) → 3 waardepunten → bewijs/voorbeeld → CTA",
            cta: "Boek een gratis intake / volg voor meer",
            content_type: "reel" as const,
            platform: pick(i),
            planned_date: d,
            media_notes: "Verticaal 9:16, dynamische cuts",
          })),
          ...postDates.map((d, i) => ({
            title: `Post ${i + 1} — autoriteit / waarde`,
            angle: "Expertise tonen rond één specifiek subthema",
            hook: "Statement of contra-intuïtieve uitspraak",
            framework: "Statement → uitleg in 3 punten → afsluiting",
            cta: "Sla op / deel met iemand die dit nodig heeft",
            content_type: "post" as const,
            platform: pick(i),
            planned_date: d,
            media_notes: "Carousel of static",
          })),
          ...storyDates.map((d, i) => ({
            title: `Story ${i + 1} — engagement`,
            angle: "Interactie met de community (poll / vraag / sticker)",
            hook: "—",
            framework: "Sticker (poll/vraag) + korte context",
            cta: "Reageer / DM ons",
            content_type: "story" as const,
            platform: pick(i),
            planned_date: d,
            media_notes: "Sticker / poll",
          })),
        ];
      }

      allItems.push(...items);
    }

    // Compose into the script field as a structured creative brief (NOT full copy).
    const rows = allItems.map((it) => ({
      client_id: sc.client_id,
      service_contract_id: sc.id,
      planned_date: it.planned_date,
      platform: it.platform,
      content_type: it.content_type,
      title: it.title,
      caption: null,
      script: [
        `📍 Angle: ${it.angle}`,
        `🎯 Hook: ${it.hook}`,
        `🧱 Framework: ${it.framework}`,
        `📣 CTA: ${it.cta}`,
      ].join("\n"),
      media_notes: it.media_notes || null,
      // NEW FLOW: items start as draft. Admin writes the real script before sending to klant.
      status: "draft",
      created_by: context.userId,
    }));

    const { error } = await supabaseAdmin.from("social_content_items").insert(rows as never);
    if (error) throw new Error(error.message);

    return { created: rows.length };
  });
