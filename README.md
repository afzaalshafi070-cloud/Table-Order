# Table Order

QR-based restaurant ordering, counter (POS) dashboard, rider app and admin panel,
built for restaurants in Pakistan.

## Stack

- React 18 + Vite, React Router 6
- Supabase: Postgres, RPC (SECURITY DEFINER functions), RLS, anonymous auth, Realtime
- Framer Motion for motion (installed as `framer-motion`)
- Plain CSS with design tokens (no Tailwind)
- Deployed on Cloudflare Pages

## Routes

| Route | Who | Purpose |
|---|---|---|
| `/order/:restaurantId/:secret/:tableId` | Customer | Menu, cart, order, tracking |
| `/order/:restaurantId/:secret/takeaway` | Customer | Delivery / takeaway ordering |
| `/delivery/:restaurantId/:secret` | Customer | Branded delivery entry (area picker) |
| `/rider/:restaurantId/:linkToken` | Rider | Rider PIN login, duty, deliveries |
| Counter dashboard | Staff | Orders, menu editor, costing, shifts |
| Admin panel | Platform admin | Restaurants, plans, payments, branches, reports |

QR URL structure is fixed. Do not change it.

## Design system

- **Tokens**: `src/styles/tokens.css` (`--color-*`, `--space-*`, `--radius-*`,
  `--shadow-*`, `--text-*`, `--duration-*`, `--ease-*`). Dark mode is driven by
  `html[data-color-mode="dark"]`, set by the app's own switch.
- **Restaurant branding**: `src/utils/theme.js` sets `--brand-*` variables at runtime.
  Brand colour is used for accents and primary actions.
- **UI components**: `src/components/ui/` (Button, Input, Select, Textarea, Card, Modal,
  Toast, Badge, Skeleton, EmptyState, PlanBadge). Styles in `src/styles/ui.css`.
- **Admin**: `src/styles/admin.css`, `src/components/admin/` (nav, toasts, wizard, switches).
- **Dashboard**: `src/styles/dashboard.css`, `src/components/dashboard/`.
- **Rider and branded delivery**: `src/styles/rider.css`, `src/components/rider/RiderUi.jsx`.

## Motion rules

- Duration 150–300 ms, ease-out `cubic-bezier(0.16, 1, 0.3, 1)`.
- Spring only for toggles and small knobs.
- Stagger for lists (about 60 ms between items).
- Everything respects `prefers-reduced-motion`.

## Accessibility rules

- Icon-only buttons need `aria-label`.
- Visible focus ring on every interactive element (`--shadow-focus`).
- Dialogs close on Escape and return focus.
- Touch targets are at least 44 px on phone screens.

## Database

SQL files live in `supabase/`. Run them in the Supabase SQL Editor in the order
below. Each file is idempotent (safe to re-run) and starts with a preflight check.

Phase 1–5 files (applied earlier, in this order of history):
`FINAL_PRODUCTION_2026_10_08.sql`, `FINAL_PRODUCTION_PATCH.sql`,
`FIX_BRANCHES_AND_CASTING.sql`, `PHASE1_RIDER_FOUNDATION.sql` and related patches.

Phase 6 and 7 files:
1. `PHASE6_BRAND_DELIVERY_BRAND.sql` — branding for `/delivery` page
2. `PHASE7_RIDER_STATUS_RPCS.sql` — Picking up / On the way for riders
3. `PHASE7_ADMIN_FIXES.sql` — contact and address fields, archive/restore,
   permanent delete, branches add/edit

## Changelog

See `CHANGELOG_2026-10-16.md` for each phase: what changed, which files, and known limits.

| Phase | Scope |
|---|---|
| 1 | Design tokens |
| 2 | UI component library (Button, Input, Modal, Toast, …) |
| 3 | Customer portal redesign, motion |
| 4 | Counter dashboard redesign, casting display in menu editor |
| 5 | Admin panel redesign: sidebar, wizard, branches fix, reports, settings |
| 6 | Rider app and branded delivery page, mobile-first, motion |
| 7 | Final polish: rider branding, status RPCs, admin fixes, a11y, dark mode, README |

## Local development

```bash
npm install
npm run dev
npm run build
```

Environment variables are read from `.env` (Supabase URL and anon key). Never put
the service role key or admin key in frontend code.
