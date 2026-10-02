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
