# Table Order — Selling Model Final Hardening

This package keeps the existing Table Order architecture and adds only the final commercial hardening needed before selling to restaurants.

## Existing model preserved

- Restaurant login remains **Restaurant Name + PIN**.
- First activation still uses **Activation Code**.
- Customer QR route and QR secrets remain unchanged.
- Customer ordering flow remains unchanged.
- Counter Dashboard remains the same product, with Settings and Billing retained.
- Admin remains the existing Control Center with the current security-key model.
- Subscription remains Trial → Active → Overdue/Grace → Sold Out.
- Manual payment verification remains the payment model. No paid gateway was added.
- Existing restaurant, menu, order, QR, session, and subscription data is not deleted.

## Final hardening added

### 1. Six-month plan is now complete
- Admin Settings can control the 6-month price.
- Add Restaurant supports Monthly / 6 Months / Yearly.
- Restaurant detail has Mark paid (6 months).
- Restaurant filters include 6 Months.
- Counter Billing already supports 6 Months.

### 2. Payment methods are no longer bank-only in the UI
Admin can select:
- Bank Transfer
- JazzCash
- Easypaisa
- Raast
- Other

Existing bank fields remain available, so the old bank workflow does not break.

### 3. Payment reference protection
- Duplicate transaction/reference numbers are rejected.
- The check covers pending/approved subscription requests and recorded payments.
- The transaction check is protected by a transaction-level advisory lock to reduce race-condition duplicates.

### 4. Payment price locking
The amount approved at request creation is stored as the request's locked price. If Admin changes the current plan price later, an already-submitted valid request is not silently repriced or rejected.

### 5. Configurable grace period
The subscription access function now reads `default_grace_days` from Admin Settings instead of hard-coding 10 days.

### 6. Admin payment request bug fixed
The payment request listing now orders sessions by `shift_started_at`, which matches the current sessions schema. The obsolete `started_at` reference is removed.

### 7. Initial PIN hash is not returned by restaurant listing
The hardening version of `admin_list_restaurants()` returns explicit safe fields instead of `restaurant_plans.*`, so `initial_pin_hash` is not exposed to the browser.

### 8. Activation-code fallback removed
The Admin browser no longer invents a fake activation code when the server RPC fails. A code is only displayed after the server has actually created it in the database.

### 9. Billing UX cleanup
- Payment wording is generic instead of bank-only.
- Optional payment-proof URL can be submitted.
- Payment QR image is shown when Admin configured a QR URL.
- Duplicate-reference errors are shown clearly.
- Existing pending/approval workflow remains intact.

### 10. Hindi/Devanagari validation strings removed
Validation messages in the affected validators and Analytics loading/summary labels are now English, preventing Hindi error text from appearing in the product.

## SQL order

For a fresh production database, keep the project's existing production migration order. After the existing payment/onboarding SQL has been applied, run:

`supabase/SELLING_MODEL_FINAL_HARDENING.sql`

For an already-running database that already has the existing payment/onboarding migration, only the new hardening SQL is required.

## Verification performed on the ZIP

- Plain JavaScript files passed Node syntax checks.
- Changed JSX/JS files were parsed successfully with the installed TypeScript parser in JSX mode.
- A full Vite production build could not be run in this environment because the ZIP has no `node_modules` and package installation could not reach/cache the npm registry. No claim of a completed Vercel build is made here.
