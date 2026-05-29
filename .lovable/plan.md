# NextGenMedia — Master Workflow Rebuild

Large structural pass. Grouped into 6 deliverable phases so each can be verified before moving on.

## Core principle (enforced everywhere)
A client only sees a service module when **both**:
1. `service_contracts` row exists for that service AND
2. linked `contracts.status = 'signed'`

A helper `client_has_active_service(client_id, service_slug)` (SQL function) becomes the single source of truth used by:
- portal sidebar
- `portal.services.$slug` guard
- social content RLS
- request wizard service list

---

## Phase 1 — Data model & activation gating

**Migration**
- Add `service_contracts.activated_at timestamptz` (set when linked contract is signed).
- Add `service_contracts.maintenance_included boolean default false` (webdesign).
- Add `service_contracts.config` keys convention: `{ reels, posts, stories, channels[], strategy, editing, filming, photo_hours, video_hours }`.
- New table `design_intakes` (client_id, service_contract_id, mission, audience, style, colors, references, goals, competitors, inspirations, status).
- New table `webdesign_change_requests` (client_id, title, description, attachments jsonb, status, estimated_hours, estimated_cost, hourly_rate default 95).
- New table `production_tasks` (client_id, social_content_item_id, type enum[shoot,edit,approval], status, scheduled_for, assigned_freelancer_id).
- New SQL function `client_has_active_service(uuid, text) returns boolean` (security definer).
- Update RLS on `social_content_items`, `client_services` to use it.
- Trigger on `contracts`: when status → 'signed', set linked `service_contracts.status = 'active'` + `activated_at = now()`.

## Phase 2 — Admin client creation (structured)

Rewrite `admin.clients.$clientId.tsx` into 3 clear sections:
1. **Bedrijfsinformatie** (company, VAT, contact)
2. **Klant Account** (owner user, invite)
3. **Aangekochte Diensten** — multi-select 6 services. Selecting a service reveals its config block:
   - Social: reels/posts/stories, channels (IG/FB/TT/LI/Pin/X), start month, duration 3/6/12
   - Foto/Video: photo hours, video hours
   - Webdesign: maintenance toggle
   - Consultancy: hourly rate, prepaid hours
   - Ads: monthly budget, channels
   - Grafisch: enabled (intake comes later)

Each saved service creates a `service_contracts` row + a `contracts` row in `draft` for signing.

## Phase 3 — Contract flow + client "Contracten" tab

- New route `portal.contracts.tsx`: list pending / signed / expired contracts for current client, with sign action (reuses `sign.$token` flow) and download.
- Sidebar gets "Contracten" entry for all clients.
- When client signs → trigger from Phase 1 activates service automatically → sidebar regenerates.

## Phase 4 — Social Media automation restore

- Server function `generateSocialPlan(serviceContractId)` (Lovable AI — `google/gemini-2.5-flash`) creates one month of `social_content_items` (reels/posts/stories) per config, each with title, caption, script, planned_date, platform.
- Auto-invoked by the signed-contract trigger (via server fn called from admin contract-signed webhook OR client-side post-sign hook).
- Calendar route `portal.services.social-media.calendar.tsx`: real month grid, colored chips per type, click → drawer with script.
- Approve / reject / request-changes already exists in `reviewMySocialContent` — wire UI buttons.
- Admin route to edit, regenerate (re-call AI for single item), manually add.
- When item.status = 'approved' AND no production yet → create `production_tasks` row (type=shoot if reels/photo content).

## Phase 5 — Service modules

- **Social request wizard** (`portal.request.new` for social): remove Starter/Groei/Premium. Ask reels/posts/stories/channels/strategy/editing/filming. Admin sees mapped pricing internally.
- **Webdesign**: if `maintenance_included` → "Website Aanpassing" form (title, description, file upload to `quote-uploads`). Otherwise same form + AI estimate (hours × 95 EUR) shown to admin only, admin sends quote.
- **Foto/Video**: shoot planning view + freelancer assignment button on `production_tasks`.
- **Grafisch Ontwerp**: after contract signed, gate behind `design_intakes` completion. Intake form route, then request menu (logo/branding/brochure/menu/templates/banners/social assets/print).
- **Consultancy / Ads**: simple dashboards showing hours remaining / budget.

## Phase 6 — Navigation & admin cleanup

- `app-sidebar.tsx`: query `client_has_active_service` per slug, render only active services. Remove duplicate "Nieuwe Aanvraag" entries.
- Admin sidebar grouped: Operations (clients, contracts, requests), Production (social content, shoots, assignments), Finance (revenue, pricing), Team (freelancers).
- `admin.index.tsx` command center widgets: pending contracts, unsigned contracts, upcoming shoots, pending approvals, open freelancer tasks, open requests, website-update queue.
- Freelancer profile fields added (VAT, region, specialization, payout). Freelancer dashboard shows assigned `production_tasks` with deadline/payout/files.

---

## Technical notes
- All server logic via `createServerFn` (no edge functions).
- Lovable AI for content generation — no extra secrets needed.
- RLS: every new table gets admin-all + owner-read tied to `current_client_id()`.
- Type safety: shared service config zod schema in `src/lib/service-config.ts`.
- UI keeps black/yellow tokens already in `styles.css`.

## Out of scope (this iteration)
- Payment processing for quotes
- Freelancer payout automation (manual amounts only)
- Email notifications (in-app status only)

## Suggested execution order
Ship phases sequentially, each verifiable in preview before next. Estimated 1 phase per turn. Start with Phase 1 + 2 together (foundation must land before UI gating works).
