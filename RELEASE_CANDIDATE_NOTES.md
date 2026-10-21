# Table Order UI Release Candidate Notes

## Scope in this package
- Preserves the existing React/Vite + Supabase application structure and order workflows.
- Adds `src/styles/release-polish.css` as the last-loaded visual layer.
- Keeps restaurant-specific logo/theme CSS variables as the source of brand colors.
- Improves customer portal spacing, sticky branded header, menu grid responsiveness, card depth and focus states.
- Improves counter dashboard desktop canvas usage and responsive order-grid breakpoints (2/3/4 columns depending on viewport; one column on phones).
- Adds consistent focus rings, input focus treatment, touch handling and reduced-motion behavior.
- Does not include a SQL migration because these visual changes do not require schema changes.

## Checks run in the provided environment
- `npm run test:i18n`: PASS, 9 tests.
- `npm run test:print`: PASS, 11 source-level print regression checks. This is not a physical printer test.
- `npm run audit:i18n:release`: completed. It reports that several languages still have substantial app-specific translation gaps; English is 274/274, Urdu 272/274, Arabic 272/274, Chinese and most other languages 14/274, Roman Urdu 16/274.
- `npm install --no-audit --no-fund`: timed out in this environment.
- `npm run build`: BLOCKED because Vite dependencies are not installed (`vite: not found`).
- `npm run test:browser:smoke`: not run successfully because a production `dist/index.html` cannot be created until dependencies install and build passes.
- Physical 58mm/80mm thermal printer testing and live Supabase order-flow tests remain unverified.

## Release status
This is a UI-polished release candidate, not a verified production release. Do not describe it as production-ready until dependencies install, `npm run build` succeeds, browser tests pass, live Supabase workflows are exercised in a staging project, and actual printer output is checked.
