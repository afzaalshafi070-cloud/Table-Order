# Table Order — Sale-Ready Final

Mobile-first restaurant sit-in QR ordering SaaS built with **React + Vite + Supabase (Postgres + Realtime + Storage)**.

## What this final version keeps

- Customer scans QR → menu opens without customer registration.
- Staff login remains **Restaurant Name + PIN**. No email/password screen.
- First restaurant setup still uses an activation code.
- Permanent customer/table QR links continue working after shift close/open.
- Rider QR now uses a **separate rider secret**; after this security upgrade, re-download/reprint rider QR codes from the Areas tab.
- Same restaurant cannot be actively controlled by a second staff tab/device while the first lease is live.
- Same tab can refresh and resume without storing the staff PIN in browser storage.
- Customer orders, water/waiter alerts, kitchen status, rider delivery flow, GPS, tax, menu, deals, logo/theme, EOD and printing remain part of the app.

## Security changes in this final

### 1. Staff PIN is no longer stored in plaintext
Existing old `sessions.pin` values are migrated to `sessions.pin_hash` using bcrypt (`pgcrypto`) and the old column is removed.

### 2. No staff PIN in QR URLs
Customer and rider QR URLs use:

`/order/:restaurantId/:qrSecret/:tableId`

`/rider/:restaurantId/:qrSecret/:areaName`

The staff PIN is not part of either public QR route.

### 3. Anonymous Auth is invisible to customers/riders/staff
The app uses Supabase Anonymous Sign-Ins only as a backend identity layer. There is no signup/email/password form.

Each browser tab keeps its short-lived auth session in `sessionStorage`, so a new tab receives a different identity. This is what lets the staff lease distinguish:

- same tab refresh → resume
- new tab → blocked while another live staff session exists
- another device → blocked while another live staff session exists
- stale/closed browser lease → can be reclaimed after the 45-second lease expires

### 4. Strict RLS
Browser clients cannot directly:

- read all sessions
- read activation codes
- create sessions
- create customer orders directly
- create customer alerts directly
- enumerate another customer's orders
- update orders as a rider except through the GPS RPC

Staff/customer/rider access is represented by server-controlled access rows and RLS policies.

### 5. Server-side order pricing
The customer browser sends only item/deal IDs and quantities. The database re-checks:

- item/deal belongs to this restaurant shift
- item is available / deal is active and date-valid
- current menu/deal price
- delivery area and current delivery charge
- current tax setting
- order quantity limits

The final total is calculated in Postgres, not trusted from the browser.

### 6. Customer rate limiting
Customer order creation is limited to **5 orders per minute per anonymous customer identity and per table/session**.
Water/waiter alerts are limited to **5 per minute per table/session**.

## Supabase setup — one SQL file

Use **only**:

`supabase/schema.sql`

`supabase/deals_migration.sql` is intentionally kept as a compatibility note and must not be run separately.

Before using the app, enable:

**Supabase Dashboard → Authentication → Providers → Anonymous Sign-Ins → Enable**

Then run `supabase/schema.sql` in the Supabase SQL Editor.

The SQL is designed to migrate the old schema from the supplied project version, including old plaintext PINs, while adding the production RLS/RPC/access architecture.

## Environment variables

Create `.env` from `.env.example`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Only the public Supabase URL and anon key belong in the frontend. Never put a Supabase service-role key in Vercel/browser code.

## Routes

### Staff
`/dashboard`

### Customer
`/order/:restaurantId/:qrSecret/:tableId`

### Rider
`/rider/:restaurantId/:qrSecret/:areaName`

## Important deployment rule

The React source and `supabase/schema.sql` in this ZIP are a matched set. Do not combine the new SQL with an older ZIP or the old permissive RLS policies.

After replacing the GitHub/Vercel project with this ZIP, configure the two VITE environment variables and redeploy.

## Main security files changed

- `supabase/schema.sql` — production schema, RLS, RPCs, rate limits, storage policies
- `supabase/deals_migration.sql` — compatibility note; schema.sql is the single source of truth
- `src/supabaseClient.js` — non-persistent per-tab Supabase auth client
- `src/utils/auth.js` — invisible Anonymous Auth + per-tab session handling
- `src/pages/CounterDashboard.jsx` — secure staff login/resume/heartbeat/logout
- `src/pages/CustomerPortal.jsx` — secure QR bootstrap, server-priced orders and protected customer actions
- `src/pages/RiderPortal.jsx` — secure rider QR bootstrap and protected GPS updates
- `src/hooks/useRealtimeOrders.js` — customer-safe realtime mode without alert access
- `.env.example` — Vercel/local environment template

## Existing feature modules intentionally preserved

Menu editor, deals, delivery areas, QR generation, logo/theme extraction, tax settings, analytics, EOD report, printable ticket, waiting games, chef popup, notifications, vibration, wake lock, rider GPS and realtime order updates remain in the project.

## Security boundary

This project uses Supabase Anonymous Auth + Postgres RLS/RPCs and does **not** require a paid external authentication/rate-limit service. Browser-side code is never treated as trusted for order price/total or staff authorization.
