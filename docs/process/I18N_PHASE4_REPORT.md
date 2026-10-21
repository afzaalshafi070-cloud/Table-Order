# Table Order i18n Phase 4

## Changes
- Guide Book modal can now be closed with Escape.
- Opening the guide locks background page scrolling and restores the prior scroll setting on close.
- Focus moves to the close button when the modal opens and returns to the round guide button when it closes.
- Added dialog description wiring and a regression test for these behaviors.
- Missing-guide fallback notice is exposed as a status message for assistive technology.
- No SQL changes were made.

## Validation
Run `npm run test:i18n:all` and `npm run build` after installing dependencies. Automated source tests check the accessibility wiring but are not a substitute for manual keyboard and mobile testing.

## Still required before calling the product fully localized
- Human review of all 26 guidebooks.
- Complete translation of app-specific strings in each language; English fallback must not be counted as translated.
- Actual counter/customer/admin/rider language-switch testing.
- Test KOT and bill layouts on the thermal printer models used by target restaurants.
