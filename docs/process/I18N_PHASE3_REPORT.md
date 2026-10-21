# Table Order i18n Phase 3

## Changes
- Added `npm run audit:i18n:full`, a detailed audit covering all configured languages, core dictionary keys, app-specific dictionary coverage, guidebook presence/length, and placeholder consistency.
- The audit emits `I18N_PHASE3_DETAILED_REPORT.json` with per-language measurements.
- Added `npm run test:i18n:all` to run the existing tests and the detailed audit.
- Preserved the current React/Vite/Supabase architecture and existing SQL. No database migration is required for language audits.

## Important truth about translation completeness
A guide file existing for each language does not prove that every sentence is genuinely translated. App-specific strings can still fall back to English. The report measures missing keys and placeholder mismatches, but human review is still needed for fluency, meaning, currency/date formats, and thermal printer output. Do not market the app as fully translated until those checks pass.

## Run
```bash
npm run test:i18n:all
npm run build
```
