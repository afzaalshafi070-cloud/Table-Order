# Phase 5: Release-grade translation audit

This phase adds a repeatable release audit for all listed languages. It reports core-key coverage, app-specific key coverage, guidebook presence/length, and placeholder mismatches. It writes both JSON and Markdown reports.

Run:

```sh
npm run audit:i18n:release
npm run test:i18n
```

Important: an existing string may still be mistranslated, transliterated poorly, or copied from English. The report deliberately does not claim translation quality based on key presence. Missing app-specific values currently fall back to English. This phase does not claim all 26 languages are fully translated and does not change Supabase SQL.
