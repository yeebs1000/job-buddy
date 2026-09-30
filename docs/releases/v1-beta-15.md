# V1 private beta.15 — Oracle address compatibility

## Changed

- Recognizes the current Oracle Candidate Experience application markup alongside the older marker.
- Adds optional block/house number, street name, level/unit and building name fields to the encrypted local profile. Existing address lines remain unchanged; no automatic splitting or migration guesses.
- Specific component labels take priority over generic address-line autocomplete hints, as required by the inspected Oracle Singapore address form.
- Uses explicit accessible names before enclosing labels. The phone country-code selector no longer suppresses the actual telephone input as a duplicate.
- Custom input comboboxes remain manual: writing text does not commit a selected option. Buddy names those dropdowns and separately identifies missing saved profile answers.
- Existing answers still need individual approval. No Next/Submit clicks, credential changes or live application edits.

## Updating

Restart the local app if its server has not reloaded, rebuild with `npm.cmd run build:extension`, and reload Job Buddy in Chrome/Edge's extensions page. Refresh the application page when safe to do so. Save the new separate address fields under Profile, then scan again. Select country, city and dial-code dropdowns on the application itself.

## Verification scope

The live JPMC page was inspected read-only. Tests use an anonymized structural fixture and fictional profile values, not the user's application or address. Browser checks exercise the built content bundle with a stubbed profile transport; the existing installed-extension pairing suite covers the real local connection. This is not a claim of end-to-end submission compatibility or custom dropdown autofill support.

Validation on this checkout: 672 unit tests and 21 dashboard browser tests passed; typecheck, app/extension builds and client-secret/source-policy checks passed. Four content-bundle browser tests passed, including the new address regression. The installed-extension real-pairing test failed waiting for a filled value, then timed out on an isolated rerun. Therefore the complete `npm.cmd run check` is **not green**; installed-extension integration remains unresolved. Do not treat this build as release-ready.
