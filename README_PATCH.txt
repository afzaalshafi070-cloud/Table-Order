Table Order — Settings + Billing + Bill Alert PATCH
==================================================

Yeh ZIP sirf changed/new files hai.
Apni EXISTING project root par extract karo (overwrite).
Purani files / routes / Supabase connection TOOTENGE NAHI.

1) Files overwrite:
   src/pages/CounterDashboard.jsx
   src/pages/CustomerPortal.jsx
   src/components/OrderCard.jsx
   src/components/FloatingActions.jsx
   src/components/CounterSettings.jsx   (NEW)
   src/components/BillingPanel.jsx      (NEW)
   supabase/counter_settings_billing_patch.sql  (NEW)

2) Supabase SQL Editor mein RUN karo:
   supabase/counter_settings_billing_patch.sql

3) Vercel / env:
   Koi naya env variable NAHI.
   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY same rakho.

4) Login same:
   Restaurant Name + PIN (email/password add nahi hua)

5) Customer QR same:
   /order/:restaurantId/:secret/:tableId
   Staff PIN expose nahi hota.

Naya UI:
- Counter tabs: ⚙️ Settings, 💳 Billing
- Sound ON/OFF, Change PIN, session info
- Plan status + payment accounts (manual)
- Customer: Ask for Bill (gold flash on counter)
