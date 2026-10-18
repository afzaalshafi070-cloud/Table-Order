# Phase 7 — Testing checklist

Run these after `npm run build` passes and the SQL files are applied.

## SQL (Supabase SQL Editor, in this order)
- [ ] `PHASE6_BRAND_DELIVERY_BRAND.sql` runs without error ("Success").
- [ ] `PHASE7_RIDER_STATUS_RPCS.sql` runs without error.
- [ ] `PHASE7_ADMIN_FIXES.sql` runs without error.
- [ ] Verify query in each file's VERIFY section returns the expected rows.

## Rider App (phone 390px and 360px)
- [ ] Login with a PIN, reload, session resumes.
- [ ] Header shows the restaurant logo and name, and the brand colour rule under it.
- [ ] Duty switch turns on and off; the knob animates with spring.
- [ ] Accept a delivery. "Picking up" appears. Tap it, status changes to "Picking up".
- [ ] "On the way" appears after Picking up. Tap it, status changes.
- [ ] "Mark delivered" works from Accepted, Picking up and On the way.
- [ ] Double-tap "Picking up" does not error (idempotent).
- [ ] Call, Map and WhatsApp open the customer's number.
- [ ] Details sheet opens and closes with ×, Escape and tap on the scrim.
- [ ] Dark mode toggle switches the page; text is readable in both modes.
- [ ] Mode choice persists after reload.
- [ ] Empty state, Refresh and Retry (turn off network to test).

## Branded delivery `/delivery/:id/:secret`
- [ ] Logo and restaurant name show when `PHASE6` SQL is applied.
- [ ] Without the function, the neutral page still works.
- [ ] Retry card shows for an invalid QR.
- [ ] Continue reaches the takeaway menu.

## Admin Panel
- [ ] Add restaurant wizard: contact person, phone, email, city and address fill in and save.
- [ ] Confirm step shows contact and city.
- [ ] Row "Archive" marks the restaurant Archived and shows the Archived badge.
- [ ] Row "Restore" removes the Archived badge.
- [ ] Detail "Archive (soft)" and "Restore" work the same way.
- [ ] Delete Permanently stays disabled until the restaurant ID is typed exactly.
- [ ] Delete Permanently with a wrong ID shows an error and deletes nothing.
- [ ] Delete Permanently with the right ID removes the restaurant.
- [ ] Branches: add a branch, edit it, set default, deactivate.
- [ ] Duplicate branch name shows an error.
- [ ] Light and dark mode both readable.

## Counter and Customer
- [ ] Order card border and "New / Cooking / Served" colour fade smoothly when status changes.
- [ ] Customer table loads with skeleton, not plain text.
- [ ] Invalid table shows "Try again", and it retries.
- [ ] Missing QR params (for example `/order/x`) show the invalid-QR screen without a React error.
- [ ] Delivery QR panel in Delivery Areas renders without error.
- [ ] Cart + and − buttons are announced with their item names (screen reader).

## Accessibility
- [ ] Tab through the rider card, buttons and sheet. Focus ring is visible.
- [ ] Escape closes the details sheet and the Admin modals.
- [ ] Icon-only buttons (×, +, −) have labels.

## Dark mode
- [ ] Rider, Customer and Counter each in dark mode: no text on same-colour background.
- [ ] Brand colour theme plus dark mode still readable.

## Not tested in my environment
- `npm run build` (not run by me).
- Real browser rendering and animation smoothness on mid-range Android.
- SQL files (not executed against the live database).
- Keyboard navigation of the legacy Settings and Menu Editor screens.
- Restore behaviour with real multi-branch sessions.
