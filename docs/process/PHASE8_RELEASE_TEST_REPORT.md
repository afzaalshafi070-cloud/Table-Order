# Phase 8: Release verification status

## Included release checks
- `npm run test:i18n`: language/guide/accessibility/locale tests.
- `npm run test:print`: checks required KOT/Bill source features and print CSS.
- `npm run audit:i18n:release`: writes `I18N_RELEASE_AUDIT.json` and `.md`.
- `npm run build`: Vite production build.
- `npm run test:browser:smoke`: launches Vite preview in headless Chromium after a successful build.

## Actual verification in this packaging environment
- Node i18n tests: PASS, 9/9.
- Production build: BLOCKED. `npm install --ignore-scripts --no-audit --no-fund` timed out before dependencies were installed. No claim is made that `dist/` was produced.
- Full browser smoke test: NOT RUN, because it requires a successful production build and preview server.
- Print source regression test: included; this is not equivalent to printing on a physical 58mm/80mm thermal printer.
- Physical printer test: NOT RUN. It requires the target printer, driver, paper width, and browser print dialog.
- Supabase authenticated workflow tests: NOT RUN; these require project credentials and a controlled test environment.

## Release decision
Do not call this a production-verified release yet. On a computer with internet access, run `npm install`, then `npm run release:check`, then `npm run test:browser:smoke`. Finally print both a KOT and a Bill on the target thermal printer at the configured paper width and inspect clipping, alignment, date formatting, totals, tax, and delivery charges.
