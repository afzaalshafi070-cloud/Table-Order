# TABLE ORDER — FINAL DEPLOYMENT ORDER

## 1) Frontend upload
Upload the entire project exactly as provided. Do not selectively copy files.

Important frontend folders/files:

src/
src/components/
src/components/BrandQRCode.jsx
src/components/BrandLoyaltyCard.jsx
src/components/BrandedQRCode.jsx
src/components/QRCodes.jsx
src/components/SettingsCenter.jsx
src/components/NameMeaning.jsx
src/pages/
src/pages/CustomerPortal.jsx
src/pages/CounterDashboard.jsx
src/utils/
src/utils/theme.js
src/styles/global.css
package.json
vite.config.js
vercel.json
index.html

## 2) Supabase SQL

### Existing / fresh production database
Run the project's production migrations in the order documented by the project, then run these two final patches LAST:

1. supabase/SELLING_MODEL_FINAL_HARDENING.sql
2. supabase/LOYALTY_BRAND_CARD_MIGRATION.sql

Do not skip SELLING_MODEL_FINAL_HARDENING.sql because the current payment/subscription model depends on it.

### If the database is already the same production database used by the previous ZIP
Do NOT rerun the entire historical migration stack. Run only:

1. supabase/SELLING_MODEL_FINAL_HARDENING.sql
2. supabase/LOYALTY_BRAND_CARD_MIGRATION.sql

These are designed as final additive/replace patches.

## 3) Frontend environment

VITE_SUPABASE_URL=<your Supabase URL>
VITE_SUPABASE_ANON_KEY=<your Supabase anon key>

## 4) Supabase Auth

Authentication -> Providers:
- Anonymous Sign-Ins: ENABLED

## 5) Storage

Keep the existing restaurant-logos bucket used by the project.

## 6) Deploy

Vercel:
- Import the repository
- Add the two VITE environment variables to Production/Preview/Development as needed
- Deploy

Do not change the existing route structure.

## 7) First production test

1. Admin login
2. Create activation code
3. Create restaurant
4. Restaurant Name + PIN login
5. Upload logo
6. Check Counter theme
7. Open QR Center -> Tables QR
8. Scan Table QR from a second phone
9. Place order
10. Accept/Cook -> Served
11. Open Customer -> View Card if Loyalty is enabled
12. Settings -> Loyalty Card -> set 2 orders for a test restaurant
13. Complete two test orders and confirm the digital card reaches 2/2
14. Test Brand Card download/print
15. Test subscription payment request + Admin approval

## Important

Do not delete the old working architecture. Restaurant login remains Restaurant Name + PIN. QR URLs remain permanent and do not contain the restaurant PIN or admin key.
