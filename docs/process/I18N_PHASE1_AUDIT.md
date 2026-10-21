# Table Order Internationalization Audit, Phase 1

## What was changed in this phase
- Added **Roman Urdu** (`ur-roman`) as an additional selectable language without removing the existing 25 language choices.
- Added `src/guide/ur-roman.md`; the guidebook now has a matching language file for every language code in the language selector.
- Added a branded floating Guide Book button across app routes. It opens an animated scroll/parchment-style guide panel, supports mobile safe-area spacing, and respects reduced-motion preferences.
- Added contextual **i** help buttons beside the KOT and Bill print actions in the counter order card.
- Added localized print labels for KOT, bill, delivery, takeaway, area, note, tax, total, and thank-you text. The Roman Urdu dictionary includes these labels.
- Fixed language dictionary construction so every listed language is recognized, and app-wide strings can use each language's generated translation when a matching key exists.
- Added `scripts/audit-i18n.mjs` to check language/guide coverage and generated core-key coverage.

## Files changed
- `src/i18n/languages.js`
- `src/i18n/index.js`
- `src/i18n/strings.js`
- `src/i18n/strings_app.js`
- `src/guide/ur-roman.md`
- `src/components/GuideBookLauncher.jsx` (new)
- `src/components/OrderCard.jsx`
- `src/components/PrintableTicket.jsx`
- `src/App.jsx`
- `scripts/audit-i18n.mjs` (new)

## SQL / Supabase
**No SQL change is required for these frontend language, guidebook, help-button, or print-label changes.** This phase deliberately does not add a database migration or re-run any existing production SQL. Existing Supabase schema, RLS, auth, subscriptions, orders, and realtime logic are left untouched.

## Important limitation, not hidden
This phase improves the language infrastructure and closes the guidebook-language gap, but it does **not** honestly guarantee that every app-specific sentence has a professional translation in all 26 choices. The generated language files cover the 302 core master keys. Many app-specific UI keys are not in that generated master and can still fall back to English in some languages. Roman Urdu has translated login/registration essentials, guidebook content, and the new guide/print labels, but not every legacy screen string.

## Recommended Phase 2 to reach full translation
1. Build a canonical key inventory from all UI components, including counter, customer, rider, admin, settings, errors, forms, alerts, KOT and bills.
2. Add each missing key to a single translation source and create reviewed translations for all 26 languages, including Roman Urdu. Do not use English fallback as a pass condition.
3. Review RTL layouts separately for Urdu, Arabic, Persian and Pashto; verify number/date/currency formatting and thermal printer width.
4. Run the production build and test language changes in every portal, including a language switch while a portal is already open.
5. Test printed KOT and bill in every supported script on actual target printers. Some thermal printers cannot print every Unicode script without font/driver support.

## Validation
- JavaScript syntax checks passed for the changed non-JSX i18n modules.
- A full Vite production build and end-to-end browser test were not run in this environment because project dependencies are not installed.
- Run `node scripts/audit-i18n.mjs` and `npm run build` after installing dependencies. Fix any build issue before deployment.
