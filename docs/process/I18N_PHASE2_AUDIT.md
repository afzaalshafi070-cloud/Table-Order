# Table Order i18n Phase 2: coverage and Roman Urdu

## Delivered in this phase
- Added `src/i18n/lang/ur-roman.js`, a full 302-key Roman Urdu dictionary based on the existing Urdu dictionary, with important login/recovery labels rewritten in natural Roman Urdu.
- Registered `ur-roman` in `src/i18n/lang/index.js` so it participates in the same dictionary merge as the other language choices.
- Expanded the i18n audit to report core translation coverage, app-specific translation coverage, and guidebook coverage per language. This prevents a green core-only report from implying that every app-specific string is translated.
- Added `npm run audit:i18n` and `npm run test:i18n` scripts and a lightweight automated test suite for language-code uniqueness, guidebook coverage, Roman Urdu dictionary presence, and RTL metadata.
- No SQL changes were made. These are frontend language assets and checks; a database migration is not needed.

## Important translation quality note
The Roman Urdu file uses a deterministic transliteration of existing Urdu strings for broad key coverage, with a hand-reviewed set of essential login/recovery labels. Transliteration is not the same as a professional translation, so user-facing phrases still need a human language review. The audit reports missing app-specific translations for each language instead of treating English fallback as complete localization.

## Validation
Run from the project root after installing dependencies: `npm run test:i18n`, `npm run audit:i18n`, and `npm run build`. The test and audit scripts use Node built-ins and do not require Supabase credentials. A successful audit may still report app-specific translation gaps; those should be translated before advertising complete 26-language coverage. Printer testing must be performed on the actual thermal printer models used by restaurants.
