# V1 private beta 11 — More selective recruiting updates

- Check sender channels, email titles and candidate-directed text before proposing a recruiting update. `news.bloomberg.com` is treated as a newsletter channel, without blocking the entire employer's domain. News digests, promotional titles, job alerts and interview-preparation events are excluded by explicit patterns.
- A generic “offer,” subscription promotion or cash withdrawal no longer means an employment offer or withdrawn application. Employment offers need employment-specific, candidate-directed language. Genuine employer and ATS offers remain review-required.
- Recheck saved pending/deferred evidence when displaying the queue and its badges. Items that fail current checks appear under **Show filtered**, with their original sender, title, excerpt and reason. No saved evidence is deleted; approved/rejected history stays visible.
- **Restore for manual review** retains source evidence but clears the old proposed stage, outcome and deadlines. Restored items cannot auto-apply; users must choose the interpretation. Automatic and direct approval also enforce the relevance guard.
- Replace uncalibrated “95% confidence” labels with rule-based suggestion wording and supporting text. Internal rule scores remain guardrails, not measured probabilities.

These are conservative local rules, not an AI classifier or a measured accuracy guarantee. They can miss unusual recruiting wording or misread unfamiliar messages. Newly scanned unrelated emails are skipped rather than saved as proposals; the recoverable filtered view is for already-saved items. No Gmail messages are modified, no profile data leaves the device for classification, and nothing is published by this update.

## Verification

- 624 unit/integration tests passed, plus typecheck, web/extension builds and client-secret/source-policy checks.
- Final complete browser runs passed: 20 dashboard tests and 2 extension tests. The first dashboard run exposed an obsolete confidence-label assertion (updated) and one profile-save timeout; targeted rerun and the complete rerun passed without changing profile code.
- Representative news/promotional examples are rejected while ordinary employer/ATS offers and invitations remain recognized. Regression cases were run failing before the fixes; independent scoped review findings received reproductions and passing rechecks.
- An isolated browser scan verifies sender/title/body filtering, recovery of saved false positives, clearing stale stage proposals and persistence after reload. The 390px filtered-items view was visually inspected and checked for horizontal overflow. No live mailbox or existing user profile was accessed for this change.
- Existing bundle-size warnings remain. No commit, push or public release was performed.
