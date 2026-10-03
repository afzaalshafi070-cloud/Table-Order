# TABLE ORDER — FINAL SELLING + BRAND EXPERIENCE BUILD

This ZIP keeps the existing Table Order architecture and adds the final brand/QR/loyalty layer plus the previous selling-model hardening.

## Existing model preserved

- Restaurant login remains Restaurant Name + PIN.
- First activation remains Activation Code based.
- Existing customer QR route structure is preserved.
- Existing Counter Dashboard, Admin Panel, menu, deals, delivery, rider, printing, Realtime and subscription flow are preserved.
- No existing order/menu/restaurant data is intentionally deleted by these patches.

## New customer/brand experience

### 1. Premium branded table QR

- High-resolution QR output for print.
- QR data modules use the restaurant's extracted brand color instead of a generic black-only look.
- Finder eyes remain scanner-friendly.
- Logo is centered using high error correction.
- 4x render resolution for sharp print output.
- Print button uses a compact table-card physical size.
- Existing QR URL remains unchanged.

### 2. Stronger logo-driven theme

The uploaded restaurant logo now drives:

- Primary color
- Accent color
- Deep brand color
- Light brand surfaces
- Dark-mode surfaces
- Text variants
- Borders
- Brand background
- Display font selection

Pure white/black pixels are no longer allowed to dominate the entire UI unless they are genuinely part of the useful logo palette.

### 3. Dark mode readability

Customer dark mode keeps restaurant branding visible and no longer lets hard-coded menu/name text disappear into the background.

### 4. Branded delivery + thank-you card

QR Center -> Brand Card creates:

- Landscape digital card
- Business-card-size physical front/back
- Restaurant logo
- Restaurant color palette
- Branded QR
- Shop/banner style header
- Deterministic custom cartoon character using the restaurant palette
- Restaurant logo on cap and uniform
- Character holding a phone with the QR
- Home-delivery scan message
- Back side: Thank you for coming
- Loyalty progress on the back
- Download Front
- Download Back
- Print Physical Card

The character is generated locally from vector/canvas shapes and the restaurant's logo palette. It does NOT call an external AI image service.

### 5. Loyalty / reward card

Counter Dashboard -> Settings -> Loyalty Card:

- Enable/disable
- Orders needed for reward: 1–50
- Free item
- Percentage discount
- Fixed PKR discount
- Reward item/name or discount value

Customer Portal:

- Shows a clear View Card button when enabled.
- Successful `served` orders are counted server-side.
- Card progress updates after order completion.
- Reward-ready state is shown when the configured threshold is reached.

The reward card uses the same restaurant logo/theme as the rest of the portal.

## SQL to run

### Existing production database from the previous ZIP
Run only these final patches:

1. `supabase/SELLING_MODEL_FINAL_HARDENING.sql`
2. `supabase/LOYALTY_BRAND_CARD_MIGRATION.sql`

Do not rerun the entire historical migration stack on the existing production database unless you are intentionally rebuilding the database.

### Fresh database
Use the project's documented production migration order first, then run the two final patches above last.

See:

- `FINAL_DEPLOYMENT_ORDER.md`
- `FINAL_UPLOAD_PATHS.txt`

## Build note

The environment used for packaging did not have npm dependencies available and network package installation timed out, so this ZIP does not falsely claim that a Vercel production build was executed here.

The changed source files should still be checked by the repository's normal Vercel build after upload.


### Final selling-model compliance
- Apply `supabase/SELLING_MODEL_FINAL_HARDENING.sql` after the existing production/payment migrations.
- Apply `supabase/LOYALTY_BRAND_CARD_MIGRATION.sql` after the hardening migration.
- Activation codes are generated server-side only. Use Generate New Activation Code / Generate 5 Server Codes in Admin.
