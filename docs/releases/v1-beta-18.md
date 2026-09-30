# V1 private beta.18 — live workspace and web salary research

**2026-09-20 provider update:** Brave has been replaced with local SearXNG. No Brave key is required; follow [local search setup](../local-search.md). The original Brave setup and verification below are historical. Saved source evidence and the estimate methodology are unchanged. Live SearXNG acceptance is still pending runtime installation.

## Changes

- New workspaces start empty. A one-time transaction soft-hides unchanged known sample applications and simulated inbox proposals. Edited or uncertain older samples remain labelled for review. Original sample rows remain in local IndexedDB and a `live-workspace-backup:v1` metadata record; Gmail, profile and real applications are not erased. This is not a cloud backup or a user-facing restore feature.
- Blue actions, progressive green stages, red rejection and compact purple-accented opportunities. Stage progress remains primary. Salary has an actionable source-review link.
- Dashboard reads saved official research and reviewed web estimates, showing the more recently saved result. Legacy unsourced fields do not masquerade as verified research.
- Optional Brave web search for any role, including finance. An explicit click sends only the visible company, role and location fields. No AI service, email text, profile or resume is sent.

## Maintainer setup

Obtain a key from the [Brave Search API](https://brave.com/search/api/). Provider terms and charges apply; Job Buddy does not create an account or purchase credits.

Set `JOB_BUDDY_BRAVE_SEARCH_API_KEY` in your local `.env.local`, then restart `npm.cmd run dev` (or `npm.cmd start` for a built app). Never put it in a `VITE_` variable, client build, source control or chat. A distributed local app cannot conceal an embedded shared key from its recipients; do not ship `.env.local`. Public key distribution or a separately authorized proxy is outside this private local setup.

The fixed Brave endpoint uses a 12-second timeout, 512 KB response bound, ten results, one concurrent request, 20 uncached attempts per hour per companion process, and a bounded 24-hour in-memory cache. Restart clears the cache and local cap; this is not a provider billing limit. Only safe HTTPS result links are shown; Job Buddy does not fetch arbitrary result URLs or bypass paywalls.

## Estimate methodology

Open a result, verify its range, currency, pay period, compensation basis, source type, role/location fit and salary reference year, then mark it reviewed. Narrow explicit-currency range suggestions are provisional; snippets are not verified compensation data. Page publication dates are not salary reference years.

Only reviewed evidence in the selected currency and pay basis is included. Monthly amounts are multiplied by 12; base and total compensation are never mixed. One range per publisher family is used, including country-domain mirrors. Users must exclude syndicated copies across otherwise unrelated publishers. Multiple sources receive equal weights; endpoints are arithmetic means rounded down to 5,000 annually. This is an indicative range, not a statistical confidence interval, market percentile or guaranteed offer. A single publisher is labelled a reported range.

Confidence is **limited** by default. **Moderate** requires at least two publisher families, all reviewed as employer disclosures or recruiter guides, all matching company/role/location, with salary reference years no older than the previous calendar year and overlapping ranges. Year-only dates are coarse. Unknown/self-reported sources, market proxies, old/unknown years or disagreement keep confidence limited. No web result is labelled high confidence. These are transparent heuristics, not calibrated probabilities; the app cannot verify a user's source assessment.

Web evidence is nominal: no inflation adjustment is invented when a defensible reference date/CPI series is missing. The existing official benchmark flow retains its sourced inflation adjustment. Different currencies can be compared in the existing currency comparison flow, not blended as if equivalent.

Saving persists reviewed evidence and its query in local IndexedDB. A failed or empty search does not overwrite saved research. URLs, excerpts and retrieval dates remain on the detail page. Standard CSV/XLSX tracker exports do not include web evidence; retain a separate copy of important research.

## Acceptance boundary

Local verification: 752 unit tests across 100 files, 24 dashboard browser tests and five extension browser tests passed. TypeScript, web/extension builds, public-tree, client-secret and research-source guards passed. The final unit run used `--maxWorkers=2 --testTimeout=15000` after a Windows encryption-process startup exceeded the default five-second test timeout under load. Dashboard tests used `JOB_BUDDY_TEST_PORT=4175` because the default test port was occupied. Desktop/mobile screenshots were inspected using isolated fictional test data.

Provider tests mock fetch; browser tests use synthetic results and isolated storage. Real Brave acceptance requires a maintainer key and has not been performed. No real mail was scanned or modified, no account/purchase was created, and nothing was pushed or published. Existing XLSX parser-consistency and external launch gates remain unchanged; this is not publication approval.
