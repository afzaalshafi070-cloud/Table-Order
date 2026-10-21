# Phase 7: Localization and print consistency

## Changes
- Added language-aware date/time formatting for all 26 configured language codes, including Roman Urdu.
- Printable KOT/Bill now formats the order timestamp using the currently selected language locale.
- Improved print CSS for narrow thermal paper: page margins, white background, black text, and avoiding ticket splitting.
- Added automated checks for locale support and print source regressions.

## Verification
- `npm run test:i18n`: 9 tests passed in the current environment.
- `npm run test:print`: source-level print checks are included in Phase 8.
- These changes do not mean every application string is translated into every language. Missing translations still fall back to English and need human/native-speaker review.
