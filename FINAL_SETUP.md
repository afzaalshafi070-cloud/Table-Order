# Table Order – FINAL Production Zip (Real Payment + Fixes)

## What this zip fixes (vs previous broken ChatGPT apply)

1. **Real bank-transfer payment flow** (no more fake success)
   - Counter chooses 1 Month / 6 Months / 1 Year
   - Copies Admin bank details
   - Enters real Transaction / Reference ID
   - Confirms transfer → creates **Pending Verification only**
   - Subscription / paid status changes **only** after Admin clicks Approve
   - Admin sees pending list + can Approve / Reject

2. **Activation codes**
   - Generate New Activation Code is now server-side (after SQL)
   - Add Restaurant: Name + PIN + Generate New Activation Code
   - Codes tab: View + Delete only

3. **Customer portal dark mode**
   - Item / deal names now force `color: var(--ink)` so they stay readable

4. **Counter order bell**
   - Stronger double doorbell chime on new customer order

## Deploy steps (IMPORTANT)

1. Delete old project files on GitHub / local.
2. Upload **all** files from this zip.
3. Open Supabase → SQL Editor.
4. Run **once** this file only:

   `supabase/TABLE_ORDER_FINAL_2026_10_PAYMENT_ONBOARDING.sql`

   Do **not** re-run every old migration unless you know what you are doing.
   This patch is additive and safe (does not delete orders/menu/restaurants).

5. Redeploy the frontend (Vercel / Netlify / etc.).

## Payment workflow (final)

1. Admin → Payments tab → add your real bank account (title, number, IBAN, instructions).
2. Restaurant → Counter → Subscription / Billing.
3. Choose period (1 Month / 6 Months / 1 Year) – prices from Admin settings.
4. Copy bank details → make real bank transfer from own bank.
5. Enter Transaction ID + check “I have completed the transfer”.
6. Submit → status becomes **Pending Verification**.
7. Admin panel shows the pending request.
8. Admin verifies the money in bank statement.
9. Admin clicks **Approve Payment** → plan extends + green Approved.
10. Counter auto-refreshes every 10s and shows Approved + new expiry.

There is **no** client-side “payment success” that can be faked.

## Files changed in this final build (relative to your previous working main zip)

- `src/components/BillingPanel.jsx` – full real plan options + pending-only flow + English professional copy
- `src/pages/AdminPanel.jsx` – server-side Generate New Activation Code button + require code on create
- `src/components/MenuList.jsx` – dark-mode readable item/deal names
- `src/utils/audio.js` – stronger double doorbell
- `supabase/TABLE_ORDER_FINAL_2026_10_PAYMENT_ONBOARDING.sql` – the one SQL to run

All other files remain your previous working versions so deploy stays stable.

After this you should not need further code changes for the payment + activation + dark mode + bell requirements.
