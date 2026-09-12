# Table Order — Restaurant Table Ordering SaaS

React (Vite) + Supabase (Postgres + Realtime) implementation of a two-portal
table-ordering system: a mobile customer menu/order flow, and a staff counter
dashboard, connected through a shared "Secret PIN" room.

## 1. Setup

```bash
npm install
cp .env.example .env
# edit .env with your Supabase project URL + anon key
npm run dev
```

In your Supabase project's SQL editor, run `supabase/schema.sql`. This creates:
- `sessions` — one row per (restaurant_id, pin) room, opened when staff first log in
- `orders` — order tickets, with a JSON items array + status lifecycle
- `alerts` — water / waiter flags per table

It also enables Realtime replication on all three tables.

## 2. How the "room" architecture works

- Staff open **`/dashboard`**, type the restaurant name + a secret PIN. This
  either opens a new session or reconnects to an already-active one for that
  PIN — that's the "shift".
- The restaurant then generates a QR code per table pointing at:

  ```
  https://yourapp.com/order/<restaurant-id>/<pin>/<table-number>
  ```

  e.g. `https://yourapp.com/order/cafe-noor/4821/T12`

  `restaurant-id` is the slugified restaurant name (spaces → dashes, lowercase).
- Both portals subscribe to the same Supabase Realtime channel scoped to that
  session's `id`, so orders/alerts sync instantly in both directions.
- If any of restaurant id / PIN / table are missing from the URL, or the PIN
  doesn't match an active session, the customer sees a clean error screen
  instead of a broken app.

## 3. Feature map

**Customer portal** (`src/pages/CustomerPortal.jsx`)
- URL param parsing + error screen — done in the component itself
- Menu + persistent cart bar with special-instructions note — `MenuList.jsx`, `CartBar.jsx`
- Order dispatch → inserts into `orders` with `status: "pending"`
- Waiting screen with Tic-Tac-Toe (simple win/block bot) + joke/riddle generator — `WaitingScreen.jsx`, `TicTacToe.jsx`, `JokeBox.jsx`
- Floating 💧 / 🔔 buttons → insert rows into `alerts`, no page reload — `FloatingActions.jsx`
- 4-second fullscreen "chef" popup, triggered once when status flips to `cooking` — `ChefPopup.jsx`

**Counter dashboard** (`src/pages/CounterDashboard.jsx`)
- Login gate (restaurant name + PIN) — `LoginGate.jsx`
- Responsive grid: strict 2-column on mobile, 3×2 on desktop (CSS grid + media query, no library)
- Web Audio API "ding dong" chime on every new order insert, no audio file needed — `utils/audio.js`
- Accept & Cook / Mark Served actions update `orders.status`, which the customer's
  realtime listener picks up instantly
- Water alerts flash a sky-blue border + badge on the matching ticket
- Close Shift → `EODReport.jsx`: aggregates item quantities/revenue across the
  session's orders, offers **Save PDF** (jsPDF) and **Print Slip** (CSS `@media
  print` sized to 58mm/80mm thermal rolls via `window.print()`)

## 4. Auto-branding from the restaurant's logo

Staff can upload their restaurant's logo from the counter dashboard header
(or the prompt shown on first login). When they do:

1. The image is uploaded to the `restaurant-logos` Supabase Storage bucket.
2. `src/utils/theme.js` runs the image through `colorthief` in the browser
   to find its dominant colors, then derives a small brand palette:
   `primary` (main button/header color), `accent`, `ink` (dark surfaces),
   and a light `paperTint` for backgrounds.
3. That palette is saved to `sessions.theme` (jsonb) and `sessions.logo_url`,
   then applied instantly via CSS custom properties (`--brand-primary`, etc).
4. Because both the customer portal and counter dashboard read the same
   `sessions` row, **the same colors show up on both screens** — the
   customer's menu and the staff's dashboard both pick up the restaurant's
   look the moment a logo is uploaded. No logo yet → both fall back to the
   app's default neutral palette, so nothing looks broken in the meantime.

**Deliberate exception:** functional signal colors — sage for "Accept &
Cook", sky-blue for the water alert, clay-red for the waiter/urgent alert —
are *not* overridden by branding. Staff learn "blue flash = water" once;
keeping that meaning constant across every restaurant on the platform
matters more than matching it to any single restaurant's palette.

If you want to extend this further (e.g. category re-ordering with drag and
drop, or bulk CSV import for restaurants with large menus), that plugs into
the same `menu_items` table below.

## 5. Self-service Menu Editor (no code changes, no new QR code)

Staff manage their own menu from the counter dashboard's **Menu Editor** tab:
add items, edit name/price inline, mark something "Sold out", upload a photo
per dish, or delete it — all writes go straight to the `menu_items` table.

- **A brand-new restaurant isn't handed a blank menu.** The first time a
  restaurant logs in, a starter menu (from `src/data/menu.js`) is copied into
  their own `menu_items` rows, which they can then freely edit or delete.
- **The customer's menu is a live read of the same table**, synced over the
  same Realtime channel as orders/alerts. A price change (e.g. 600 → 700) or
  marking an item "Sold out" shows up on customers' phones within moments.
- **The QR code never needs to change.** It only encodes the URL
  (`/order/restaurant-id/pin/table-id`); the menu content it displays is
  fetched live from the database every time it's opened, so editing prices,
  adding items, or uploading photos never requires reprinting anything.

## 6. Security note

For speed, this schema ships with permissive RLS policies (`using (true)`) —
the PIN itself is the access control, similar to a Wi-Fi password. Before
taking this to real production with paying restaurants, consider:
- Verifying the PIN server-side via a Supabase Edge Function and issuing a
  short-lived scoped token instead of relying on open table access
- Rate-limiting alert/order inserts per table
- Rotating PINs automatically when a shift closes

## 7. Design language

Palette and type are built around the subject matter — a working kitchen's
order-ticket rail and thermal receipt paper — rather than generic SaaS
defaults: charcoal ink, warm paper background, mustard for in-motion states,
sage for "go" actions, sky-blue for the water flag, clay-red for urgent
flags. Headings use Fraunces (serif, warm), data/labels use IBM Plex Mono
(ticket feel), body copy uses Inter.
