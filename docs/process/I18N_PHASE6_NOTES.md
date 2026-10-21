# Phase 6: Runtime translation coverage transparency

This phase adds `getTranslationCoverage(language)` and displays a notice in the Guide Book when the selected language has missing app-specific labels. The notice explains that some labels can fall back to English. This prevents a language selector from implying full translation where coverage is incomplete.

Run:

```sh
npm run audit:i18n:release
npm run test:i18n
```

No SQL migration is needed. This phase does not automatically translate missing strings; it exposes the remaining gaps honestly. The audit's counts measure dictionary coverage only, not linguistic quality.
