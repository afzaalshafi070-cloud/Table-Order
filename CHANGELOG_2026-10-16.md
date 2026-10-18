# Changelog — 2026-10-16

## Fixed
- **Costing / casting not visible (Counter Dashboard).** The `CostingCenter`
  component (Profit, Raw Materials, Recipes, Overheads, Waste) was never mounted
  anywhere. Added a **Costing** tab next to Menu Editor.
- **Profit overview marked un-costed dishes as healthy.** `get_menu_profit_overview`
  now reports `NO_RECIPE` for items without a recipe (was COGS 0 / HEALTHY).
  Fixed in `supabase/FIX_BRANCHES_AND_CASTING.sql`.
- **Admin → Branch Requests errors.** The tab now shows a clear hint to run the
  migration when the database functions are missing, instead of a raw error.
  Migration recreates the branch tables and admin RPCs idempotently and reloads
  the API schema cache.
- **Security:** `restaurant_branches` and `branch_requests` had no RLS. RLS is now
  enabled with deny-all policies; access continues through SECURITY DEFINER RPCs.

## Changed files
- src/pages/CounterDashboard.jsx (Costing tab)
- src/pages/AdminPanel.jsx (friendly branch error helper)

## Added files
- supabase/FIX_BRANCHES_AND_CASTING.sql
- CHANGELOG_2026-10-16.md

## Run order (Supabase SQL Editor)
1. Confirm FINAL_ADMIN_AND_PRODUCTION_PATCH.sql, COSTING_AND_INVENTORY_MIGRATION.sql
   and FINAL_PRODUCTION_2026_10_08.sql have been run before (the migration checks this).
2. Open FIX_BRANCHES_AND_CASTING.sql, paste the whole file, click Run.
3. Verify: both branch tables show RLS enabled; Admin → Branch Requests loads.

## Not included in this release
- The broader visual redesign (design tokens, component library, motion pass across
  all screens) — see the response for the proposed phased plan.

## Phase 1 — Design tokens (no visual change yet)
- Added src/styles/tokens.css: namespaced colour, spacing (4px grid), radius,
  layered shadow, type-scale, motion and focus tokens. Dark values follow the
  app's own switch (html[data-color-mode="dark"]).
- Opt-in utilities: .ds-display, .ds-heading, .ds-body, .ds-caption, .ds-focusable.
- src/main.jsx imports tokens.css before global.css (global.css still wins on conflicts).
- Existing screens are unchanged: no existing selector uses the new names yet.

## Phase 2 — UI component library (not yet used by screens)
- Added src/styles/ui.css (component styles built on Phase 1 tokens, with fallbacks;
  motion via CSS transitions only; disabled under prefers-reduced-motion).
- Added src/components/ui/: Button, Input, Select, Textarea, Card, Modal, Toast,
  Badge, Skeleton, EmptyState, PlanBadge, index.js (barrel).
- PlanBadge maps the real restaurant_plans.plan_status values (trial, active,
  overdue, suspended, sold_out, complimentary, archived). The A/B/C plans from the
  brief do not exist in the code.
- Framer Motion is NOT used in this phase (not installable in the build sandbox).
- No existing screen imports these components yet, so there is no visual change.

## Phase 3 — Customer Portal redesign + Framer Motion
Requires: `npm install` (framer-motion ^11.11.1 added to package.json).
Logic untouched: sessions, cart state, order submission, rating, rider map, realtime,
hook order and early returns are identical to before.

- package.json: added framer-motion.
- src/pages/CustomerPortal.jsx: header drops in with a brand-colour gradient; page
  views (menu / orders) cross-fade (opacity only, so the fixed cart bar stays
  viewport-fixed); order cards stagger in; cart sheet wrapped in AnimatePresence;
  order-placed banner replaced by OrderSuccess; MotionConfig reducedMotion="user".
- src/components/MenuList.jsx: staggered card entrance; card lift + image zoom on
  hover; category highlight slides between pills (shared layoutId); +/− steppers
  with spring press and a checkmark flash on add; lazy-loaded images; aria labels.
- src/components/CartBar.jsx: springs up from the bottom, drops away when empty,
  respects the iPhone home-indicator safe area.
- src/components/CartModal.jsx: bottom sheet on phones, right-hand panel at >=768px,
  animated in and out. Same content and handlers.
- src/components/OrderSuccess.jsx (new): spring badge, animated checkmark stroke,
  one-shot particle burst.

Casting/costing: intentionally NOT shown on the customer portal. Recipe costs and
margins are staff-only data; showing them to customers would expose the restaurant's
margins. Costing stays on the Counter Dashboard (Costing tab).

## Phase 4 — Counter Dashboard redesign + motion + casting display
Requires: `npm install` (framer-motion already added in Phase 3).

Navigation
- Desktop (>=900px): sticky sidebar with logo, six sections with icons and labels,
  active indicator that slides between items (brand colour), collapse toggle
  (232px <-> 72px icons only, choice remembered in localStorage).
- Phones and small tablets (<900px): bottom tab bar, six sections, short labels.
- Header now shows the active section name and restaurant name. The old header
  action buttons and the Orders/Menu tab row were removed: their functions moved into the nav.
- Brand colour is limited to the active nav item and primary buttons. Dashboard
  background is neutral (paper); brand gradient background removed.

Orders
- New Shift summary strip: Active tickets, New orders, Shift sales (count-up).
  Sales use the same rule as the End-of-Day report (all orders except cancelled).
- New-order arrival toast: slides in from the top with a shrinking progress bar,
  auto-dismisses after 4s. Sound already existed and is unchanged.
- Order cards spring in and lift 2px on hover (wrapper element; OrderCard unchanged).

Casting (Menu Editor)
- Each menu item now shows Cost (recipe COGS + overhead share per plate),
  Price, Margin % and a status chip (Healthy / Low margin / Loss / No recipe).
  Data comes from get_menu_profit_overview (staff-only). Hidden if the costing
  migration has not been run.

Modals
- EOD / Shift report: animated backdrop fade and panel scale. Panel background
  now uses the theme surface (previously hard-coded white, which made text
  unreadable in dark mode).

New files
- src/styles/dashboard.css
- src/components/dashboard/DashboardNav.jsx, ShiftStats.jsx, CountUp.jsx, ArrivalToast.jsx

Changed files
- src/pages/CounterDashboard.jsx (shell, header, tabs removed, stats, toast, order wrapper)
- src/components/EODReport.jsx (motion + theme surface)
- src/components/MenuEditor.jsx (casting chip per item)
- src/components/OrderCard.jsx: NOT changed.

Not in this phase (stated honestly)
- Chart animation on mount: the dashboard has no chart component; the profit table is a table.
- Dashboard-wide skeleton loading: data arrives via realtime; no separate loading state was added.
- Dashboard-wide status colour transition: only the card border/background transition is added via CSS; OrderCard status colours are inline styles and were not refactored.
- Toast component from the ui library is not used here; the arrival toast is a dedicated component.

## Phase 5 — Admin Panel redesign + motion + Branches fix
No new npm packages (framer-motion already present from Phase 3).
No new SQL. No RPC names, arguments or handlers were changed.

Bug fix (Branches)
- Opening "Branch Requests" passed an undefined variable (`key`) to the panel,
  which throws a ReferenceError. Now passes `adminKey`.
- Friendly "run FIX_BRANCHES_AND_CASTING.sql" message kept for missing DB functions.

Look
- Premium neutral palette from tokens.css. No restaurant brand colour.
  Accent = Table Order's own --color-primary.
- Login card: fade + slide-up, logo mark scale-in. Same key flow.

Navigation
- Desktop/laptop (>=900px): sidebar with 9 sections, sliding accent indicator,
  collapse toggle (state remembered in localStorage).
- Phone/tablet (<900px): horizontal scrollable section bar with the same 9 sections.
  (Chosen instead of a hamburger: all sections stay one tap away.)

Restaurants
- Cards stagger in. Hover lifts the row. Plan badge uses PlanBadge (real plan_status values).
- Quick actions per row: Edit (opens detail), Suspend (confirm), Archive (confirm).
  Permanent delete remains only in the detail view.
- Loading skeleton on first load; empty state with CTA.

Onboarding (Add Restaurant) — 4-step wizard
- 1 Details (name, PIN), 2 Plan (status, cycle, days, notes),
  3 Activation code (server-generated, required), 4 Confirm (summary, create).
- Slide left/right between steps; progress bar on top.
- Same admin_create_restaurant call and same arguments as before.
- Success panel with animated checkmark and "Add another restaurant".

Payments
- Pending requests as cards. Approve (success) and Reject (confirm dialog).
- Payment method "Active" is now a switch. All RPCs unchanged.

Branches
- Restyled as cards with status badges, filter pills and loading/empty states.
- Reject requires a second click (inline confirm).

Reports
- Summary tiles that count up. Status distribution bars that grow on mount.
- CSV and PDF exports unchanged.

Settings
- Grouped into collapsible cards with smooth height animation.

Feedback
- Toast slides in from the top with a progress bar and auto-dismisses (4.5s).
  Success toasts show an animated checkmark.
- Confirm dialog uses the shared Modal (backdrop fade + panel scale on open).

New files
- src/styles/admin.css
- src/components/admin/AdminNav.jsx, AdminUi.jsx (SuccessCheck, AdminToast, Switch,
  Collapsible, StepBar, PageHead)

Changed files
- src/pages/AdminPanel.jsx (presentation rewritten; state, handlers, RPC calls kept)

Known limits (see reply)
- Branch add/edit: no admin RPC exists for it; only review of staff requests.
- Onboarding contact/address: not stored (create RPC has no such fields).
- Modal closes without an exit animation (shared ui Modal mounts/unmounts).
- "Archive" and "Delete Permanently" both call admin_delete_restaurant; the code
  does not distinguish them. Needs checking in the SQL.

## Phase 6 — Rider App + Branded Delivery (mobile-first redesign + motion)

Rider App (/rider/:restaurantId/:linkToken)
- Redesigned for phones: sticky neutral header, bottom-thumb action row, 44px+ tap
  targets (action tiles 56px, buttons 52px). Brand colour only as accents
  (avatar ring, duty switch on-state, login logo ring).
- Login: same PIN flow and error messages; slide-in on screen change.
- Duty: ON/OFF DUTY two-button control replaced by a switch with spring knob.
  Still calls rider_portal_set_duty (AVAILABLE / OFF_DUTY).
- Deliveries: stagger fade-in list, delivery cards with customer, address,
  area/branch, phone, items summary (first 4), total, status badge.
- Status badge colours transition (New, Accepted, Picking up, On the way, Delivered).
- Actions: Call (tel:), Map (Google directions), WhatsApp, Accept, Mark delivered.
- Details sheet slides in from the right (Escape or × closes). Shows full items
  and all actions.
- Delivered: checkmark stroke animation with confetti burst; auto-hides after 2.6s
  or on tap. Details sheet closes after success.
- Ripple feedback on tap for all rider buttons (pointer only).
- Empty state "Abhi koi delivery nahi hai" with Refresh. Load error shows Retry.
  Skeleton shimmer while the list loads.
- My Info: bottom sheet with the same fields and same save RPC; uses shared Input.
- WhatsApp now opens the CUSTOMER's number (previous build used the rider's own
  number, which was a bug).
- Unchanged: link token + PIN resume/login, polling every 5s, alarm/notification
  on new assigned order, logout, photo upload, restaurant branding fetch.

Branded Delivery (/delivery/:restaurantId/:secret)
- Restaurant logo and name shown prominently; brand colour on logo, accent bar and
  Continue button. Falls back to neutral look if branding is not available.
- Branding fetched via new RPC brand_delivery_brand (needs
  supabase/PHASE6_BRAND_DELIVERY_BRAND.sql). If the function is missing the page
  still works.
- Area picker uses shared Select with focus ring. Staggered entrance; fade page
  transition; Continue uses shared Button with loading state.
- Retry card when the delivery QR fails to load.
- Routing logic and navigate payload unchanged.

Motion (Framer Motion)
- New src/components/rider/RiderUi.jsx: RippleButton, DutySwitch, StatusBadge,
  DeliveryCard, Sheet, SuccessBurst, RiderSkeleton, itemsSummary, statusInfo.
- All motion respects prefers-reduced-motion.

New files
- src/styles/rider.css
- src/components/rider/RiderUi.jsx
- supabase/PHASE6_BRAND_DELIVERY_BRAND.sql (run once in Supabase SQL Editor)

Changed files
- src/pages/RiderApp.jsx (render rewritten; state/RPC/polling logic kept, plus
  selectedId, celebrate, listReady, loadError, reduceMotion, and a 2.6s
  celebration timer)
- src/pages/BrandDelivery.jsx (render rewritten; added brand fetch, retry;
  boot/resolve logic and navigate payload unchanged)

Not changed
- All routes, QR URL structure, RLS, existing rider_* and brand_delivery_* RPCs,
  realtime/polling setup, Customer Portal delivery flow.

Known limits
- Picked Up / On the Way buttons: no rider RPC sets PICKING_UP or
  OUT_FOR_DELIVERY, so they are not shown. Needs a new SQL RPC (not built yet).
- Distance / ETA: rider_portal_list_orders does not return coordinates or
  distance, so it is not shown.
- Delivery menu, cart and checkout: already provided by the Customer Portal
  delivery flow (Phase 3). Not duplicated.

## Phase 6 hotfix — rider crash on null rider data
- Fixed `TypeError: Cannot read properties of null (reading 'duty_status')` in the
  Rider App. The dashboard now renders only when rider data exists; otherwise a
  skeleton is shown. If a ready phase has no rider data, the page returns to login.
- All rider reads in the dashboard use optional chaining. Login, PIN flow, RPC calls
  and polling are unchanged.
- Changed file: src/pages/RiderApp.jsx

## Phase 7 — Final polish

Rider App
- Restaurant branding in the header: logo, restaurant name, brand colour on the
  header rule, primary buttons, duty switch on-state and avatar ring. Restaurant
  display font is used for titles when the theme provides one.
- Status steps on each accepted delivery: **Picking up** (sets PICKING_UP) and
  **On the way** (sets OUT_FOR_DELIVERY). Mark delivered is shown after pickup starts.
  The label is "Picking up" and not "Picked up" because the first step is the
  rider heading to the restaurant, not having the food.
- Dark mode toggle in the header. The choice is remembered per device.
- Changed: the rider page no longer forces light mode.

Admin Panel
- **Archive** is now soft: sets `archived_at`, stops the restaurant's active
  sessions (`admin_archive_restaurant`). Data is kept.
- **Restore** undoes archive (`admin_restore_restaurant`).
- **Delete Permanently** is a separate RPC (`admin_permanent_delete_restaurant`).
  The admin must type the restaurant ID to confirm. Previously Archive and Delete
  both called `admin_delete_restaurant`, which hard-deleted data. That function is
  kept in the database but the Admin Panel no longer calls it.
- Branches: list per restaurant, add and edit (`admin_list_branches`,
  `admin_upsert_branch`). Default and active flags. Duplicate names are rejected.
- Onboarding wizard Details step: contact person, contact phone, contact email,
  city and address. Saved to `restaurant_plans` (new columns).

Counter / Customer / shared
- Order cards: border and status colour transition smoothly (`OrderCard.jsx`).
- Customer portal: skeleton while the table loads. "Try again" on the invalid-table screen.
- Fixed a hook-order violation in `CustomerPortal.jsx` (early return for missing
  QR params came before hooks).
- Fixed a missing `BrandedQRCode` import in `DeliveryAreas.jsx` (would crash the
  delivery QR panel).
- Dark mode: `applyTheme` no longer pushes light surface and text colours while
  dark mode is on. Previously brand colours could make text unreadable.
- Dark mode: 16 files that used a hardcoded white background now use
  `--surface-elevated`, which dark mode remaps.
- Cart quantity buttons have aria labels.

Docs
- `README.md` added: stack, routes, design system, motion and a11y rules, SQL run order.

New files
- `supabase/PHASE7_RIDER_STATUS_RPCS.sql`
- `supabase/PHASE7_ADMIN_FIXES.sql`
- `TESTING_CHECKLIST_PHASE7.md`
- `README.md`

Changed files
- `src/pages/RiderApp.jsx`, `src/components/rider/RiderUi.jsx`, `src/styles/rider.css`
- `src/pages/AdminPanel.jsx`
- `src/components/OrderCard.jsx`, `src/components/CartModal.jsx`
- `src/pages/CustomerPortal.jsx`, `src/pages/NotFound.jsx`
- `src/components/DeliveryAreas.jsx`
- `src/utils/theme.js`
- 16 legacy component files for the white-background token change:
  BallJump, TicTacToe, JokeBox, RiderFoundationPanel, Analytics, MenuEditor,
  BillingPanel, NoteBar, ErrorBoundary, SettingsCenter, DeliveryAreas, LoginGate,
  QRCodes, WaitingScreen, CounterSettings, TaxSettings

Known limits
- Full accessibility audit of every legacy component was not done. The audit
  covered main flows and icon-only buttons found by search.
- Legacy components (SettingsCenter, CounterSettings, MenuEditor and others) still
  have text-only buttons with no aria labels. Text labels are read by screen readers.
- Restore does not reopen sessions that were closed by staff on purpose; it
  reactivates only the newest inactive session per branch.
- Rider distance and ETA are still not shown (no coordinates in the orders RPC).
- Build, browser test and SQL execution were not run in this environment.

## Phase 7 follow-up — security headers and rider colour fix

Security headers
- New `public/_headers` (copied to dist on build, applied by Cloudflare Pages):
  HSTS (`max-age=31536000; includeSubDomains`), `X-Frame-Options: DENY`,
  `frame-ancestors 'none'`, Content-Security-Policy, `X-Content-Type-Options: nosniff`,
  Referrer-Policy, Permissions-Policy (camera, mic, geolocation, usb, payment off; none are used).
- CSP allows: self scripts, Google Fonts CSS and font files, Supabase (https and wss),
  https images, maps.google.com and www.google.com frames (rider map in customer order view).
- Not fixed by headers: weak TLS ciphers. That is set by Cloudflare's TLS settings, not by
  response headers. See the Probely notes.

Rider App colours
- Error box used `--color-error-subtle`, which is not defined anywhere, so it was always a
  light pink box. In dark mode the error text was unreadable on it. Now scoped tokens with
  dark-mode values.
- Status chips (New, Accepted, On the way, Delivered) had fixed pastel backgrounds. Now
  dark-mode aware.
- Hint text used a very light colour with low contrast in light mode. Now muted text colour.
- Same tokens apply to the Branded Delivery page (`.bd-page`).

Changed files: `public/_headers` (new), `src/styles/rider.css`, `CHANGELOG_2026-10-16.md`.

## Final round — QR layout, Thank-You tab, customer dark mode, rider branding, auto message

QR Center
- Fixed the cut-off QR. The QR overlapped the bottom text box. The card now has a fixed
  header band and a QR that always sits fully inside the card.
- Text reduced: table name (big) + "SCAN TO ORDER" (small). Delivery card says "SCAN FOR DELIVERY".
- Print layout uses the card's real aspect ratio, so the print is not cropped.
- Removed the "Thank-You Card" tab from QR Center. The Settings → Thank-You Card section is unchanged.

Customer portal dark mode
- Root cause: `applyTheme` wrote light brand values inline (`--brand-paper-tint`, `--brand-ink`,
  `--brand-soft`, `--brand-deep`). Inline styles beat the dark stylesheet rules, so the page
  background stayed light while the text was light.
- `applyTheme` now skips these in dark mode. Switching back to light re-applies the restaurant theme.
- Cart bar button text now uses the paper colour, so it stays readable in both modes.

Auto message
- Removed "Estimated wait: 15–20 mins" from the chef popup. The popup still shows
  "Chef has started preparing your food!".

Rider App branding
- The header is now the restaurant's brand colour (logo, name and text use the brand colour).
  Previously the page showed the default beige, because only buttons used the brand colour.

Changed files: `src/components/QRCodes.jsx`, `src/components/BrandedQRCode.jsx`,
`src/utils/theme.js`, `src/components/CartBar.jsx`, `src/components/ChefPopup.jsx`,
`src/styles/rider.css`.

Not done in this round (need decisions or DB changes): see the reply.
