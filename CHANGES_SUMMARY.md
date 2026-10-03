# Final Changes Summary – Table Order (Real Payment Edition)

## Core requirements fixed

### 1. Real Payment (no demo success)
- Counter can only create Pending Verification requests.
- Admin must Approve after checking real bank transfer.
- Plan options: 1 Month / 6 Months / 1 Year with clear English UI.
- Copy bank account details, enter txn reference, confirm checkbox.
- Admin gets pending list; after Approve → green tick + plan extended.
- Notification language professional and clear.

### 2. Activation Codes
- Generate New Activation Code uses server RPC (after SQL).
- Add Restaurant section: Restaurant Name + PIN + Generate button.
- Codes list: View + Delete only.

### 3. Customer dark mode
- Menu item names and deal names forced to `var(--ink)` so they remain readable.

### 4. Counter new-order bell
- Stronger double doorbell chime so staff hears it.

## SQL to run once
`supabase/TABLE_ORDER_FINAL_2026_10_PAYMENT_ONBOARDING.sql`

This keeps the previous working structure and only upgrades the payment/activation path so GitHub deploy does not break.

## Final Selling Model Hardening (this ZIP)

- Added `supabase/SELLING_MODEL_FINAL_HARDENING.sql` as the final additive database hardening migration.
- Added complete 6-month Admin pricing/control support.
- Added generic subscription payment-method types while preserving bank fields.
- Added duplicate transaction/reference protection.
- Added locked payment-request pricing.
- Made grace period use Admin `default_grace_days`.
- Fixed `started_at` → `shift_started_at` in Admin payment-request listing.
- Prevented `initial_pin_hash` from being returned by the Admin restaurant listing.
- Removed browser-generated fake activation-code fallback.
- Added optional payment-proof URL and payment QR display.
- Removed affected Hindi/Devanagari validation strings.
- Existing restaurant/customer/counter/admin/subscription architecture remains intact.

# FINAL BRAND + LOYALTY PASS — 2026-10-04

## Changed
- `src/utils/theme.js`
  - Reworked logo palette extraction so pure white/black pixels do not automatically become the dominant application color.
  - Added brand-aware light/dark surface variables.
  - Added brand-aware dark-mode text and borders.
- `src/styles/global.css`
  - Dark mode now follows restaurant brand variables.
  - Added stronger brand-surface readability for Counter/Customer inputs and cards.
- `src/components/BrandedQRCode.jsx`
  - Replaced generic black QR rendering with high-resolution branded QR rendering.
  - Added print-ready table card action.
- `src/components/BrandQRCode.jsx` (new)
  - Custom QR matrix renderer with rounded modules, brand colors, scanner-friendly finder eyes and centered logo.
- `src/components/BrandLoyaltyCard.jsx` (new)
  - Landscape digital card and physical business-card front/back renderer.
  - Local vector cartoon character with logo on cap/shirt and phone QR.
  - Thank-you back and loyalty progress.
  - Download and print actions.
- `src/components/QRCodes.jsx`
  - Added Brand Card section.
  - Passes restaurant theme into QR rendering.
- `src/pages/CounterDashboard.jsx`
  - Passes restaurant theme into QR Center.
- `src/components/SettingsCenter.jsx`
  - Added Loyalty Card settings.
  - Added reward configuration and branded card preview.
- `src/pages/CustomerPortal.jsx`
  - Added server-side loyalty status loading.
  - Added clear View your Reward Card action.
  - Added digital card modal and reward-ready message.
- `src/components/NameMeaning.jsx`
  - Replaced hard-coded light surfaces/text with theme variables for dark-mode readability.

## New SQL
- `supabase/LOYALTY_BRAND_CARD_MIGRATION.sql`
  - Adds `customer_loyalty_status()`.
  - Adds `staff_loyalty_config()`.
  - Uses existing `sessions.theme` for configuration.
  - Counts only `served` orders for customer loyalty progress.

## New deployment docs
- `FINAL_DEPLOYMENT_ORDER.md`
- `FINAL_UPLOAD_PATHS.txt`

## Preserved
- Existing restaurant login.
- Existing activation code flow.
- Existing QR URL structure.
- Existing ordering RPC and server-side totals.
- Existing subscription/payment model.
- Existing Counter/Admin architecture.


## Final prompt compliance pass

- Activation-code bulk generation now calls the server-side `admin_generate_activation_code` RPC 5 times. Browser-side random activation-code generation has been removed.
- Admin manual payment recording now includes Month / 6 Months / Year.
- Counter Billing error wording is generic and no longer incorrectly says bank transfer when other payment methods are configured.
