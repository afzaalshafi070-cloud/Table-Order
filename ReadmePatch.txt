TABLE ORDER — FINAL SELLING + BRAND EXPERIENCE ZIP
==================================================

This ZIP is the existing Table Order project plus the final selling-model hardening and the requested branded QR / loyalty-card system.

OLD MODEL IS PRESERVED:
- Restaurant Name + PIN login stays.
- Activation Code stays.
- Existing QR route structure stays.
- Existing customer ordering stays.
- Existing Counter Dashboard stays.
- Existing Admin Panel stays.
- Existing subscription/payment architecture stays.

NEW:
- Logo-driven premium QR with high-resolution rounded data modules and centered logo.
- Print-ready compact table QR card.
- Stronger logo-derived Counter + Customer light/dark palette.
- Customer dark mode text/surface fixes.
- Brand Card in QR Center.
- Landscape digital delivery/thank-you card.
- Business-card physical front/back print layout.
- Restaurant-colored cartoon character with logo on cap + shirt.
- Character holds a phone showing the restaurant QR.
- Home-delivery scan message.
- Loyalty Card settings in Counter Dashboard.
- Server-side completed-order loyalty count.
- Customer View Card button and progress/reward-ready display.

SQL FINAL PATCHES:
1. supabase/SELLING_MODEL_FINAL_HARDENING.sql
2. supabase/LOYALTY_BRAND_CARD_MIGRATION.sql

Existing production database: run only the two patches above.
Fresh database: run the documented production migration order first, then the two patches last.

See FINAL_SETUP.md and FINAL_DEPLOYMENT_ORDER.md.
