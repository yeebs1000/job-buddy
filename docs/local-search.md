# Research search with Tavily

Current runtime uses Tavily, not SearXNG. Docker, WSL and a separate local search engine are no longer prerequisites.

1. Open **Settings → Research search** in the normal Windows companion app.
2. Get a key from [Tavily](https://app.tavily.com/), paste it into the password field, and choose **Save key**. Saving stores the key without verifying it or running a search. Do not put it in chat, a `VITE_` variable, or source control.
3. On Overview, choose **Refresh research** on an application. Salary and employee-rating searches run sequentially. **Review sources** opens the evidence on the same page. Review source figures and pay basis before saving salary; confirm company/provider/employee-review scope before saving a rating.
4. Saved ranges, confidence, rating and source links stay on the dashboard. Failures and empty results do not overwrite them. Imported values are explicitly unverified, not newly researched estimates.

## Limits and security

- Basic search only; no generated answers, raw content, images or paid-depth escalation. Up to two uncached requests per dashboard refresh, up to ten results each. No searches on page load.
- A durable local budget caps uncached requests at 1,000 per UTC month. Reservation occurs before dispatch; failures conservatively count. Cache hits are free locally for up to 24 hours. A 20-request hourly process guard and one active request limit bursts.
- This counter is **not** the Tavily account balance. Other apps, installations and API users can consume the same allowance. Keep paid usage disabled in your Tavily account. Job Buddy cannot change provider billing settings or guarantee account-wide charges.
- The key is encrypted for the current Windows user with DPAPI, never read back into the UI, and excluded from Excel exports, backups and browser/extension bundles. Replace/remove invalidates cached and in-flight results without deleting saved research.
- Only company, role, location and search purpose leave the app. Tavily receives those query terms and the network IP. No email, profile or resume content is submitted.
- Invalid keys, usage limits, timeouts, damaged storage and unexpected responses produce actionable errors; no fallback provider or automatic retry spends additional credits. A damaged/locked budget fails closed.
- The normal Windows companion build supports this integration. The experimental browser-core preview displays saved research but does not perform live search. The release target is local Windows/macOS downloads, not a hosted key vault; Mac secure storage is still pending.

## Evidence and portability

Salary blending uses reviewed, compatible currencies/pay bases and unique publishers. Monthly values are annualized; confidence is an evidence grade, not a probability. Employee ratings keep their provider, scale and review count and are never averaged with customer/product scores. A search excerpt is a lead, not independent verification.

Overview **Import Excel** opens the existing preview/duplicate-check workflow in a dialog. **Export Excel** exports all tracker applications, including archived rows, but not full evidence/history/profile data. Use **Settings → Advanced** for passphrase-encrypted workspace backup and restore.

No real key was used during implementation verification; automated provider checks use synthetic responses. The first owner-triggered search verifies their actual Tavily account.

API reference: [Tavily Search](https://docs.tavily.com/documentation/api-reference/endpoint/search).

---

## Historical SearXNG setup (superseded)

<details>
<summary>Earlier Docker setup — not used by the current app</summary>

The notes below document the earlier provider only. Its helper scripts remain for manual cleanup, but the Job Buddy runtime no longer connects to this service. Existing containers are not stopped or deleted automatically.

The earlier build used local SearXNG instead of Brave Search. Those setup and verification notes are retained below as history.

## Windows setup

1. Install [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/) with its WSL 2 backend. Follow the installer prerequisites and licensing terms. Windows may require administrator approval or a restart. Job Buddy does not install system software or reboot the machine itself.
2. Open Docker Desktop and wait for the Linux container engine to run.
3. In the Job Buddy project folder, run:

   ```powershell
   npm.cmd run searxng:start
   ```

   The first run downloads the pinned official SearXNG image. Subsequent runs reuse it. The container continues independently of the Job Buddy terminal until stopped; with Docker running, it restarts unless explicitly stopped. A per-start cryptographic instance secret is generated in memory and supplied to the container, not written into the repository. Running start again may recreate the container and rotate its browser session secret; saved Job Buddy research is unaffected.
4. Start or restart Job Buddy with `npm.cmd run dev`. No `.env.local` change is needed for the default `http://127.0.0.1:8088` endpoint. Do not start a second dev process if one is already running.
5. Open an application's **Research salary** section, then **Search web salaries**. Review original sources and their pay basis before saving a blend.

SearXNG's local page is [http://127.0.0.1:8088](http://127.0.0.1:8088). Container startup is not proof that upstream engines work; the first real search verifies that separately.

## Controls

```powershell
npm.cmd run searxng:status
npm.cmd run searxng:stop
npm.cmd run searxng:start
```

Stop leaves container volumes and all Job Buddy research intact. The helper affects only the `job-buddy-search` Compose project; it never prunes Docker resources. For container diagnostics, use Docker Desktop. Logs may include query terms, so do not share them without reviewing them.

## Boundaries and troubleshooting

- Host port 8088 binds only to `127.0.0.1`, not the LAN. The internal container listens on 8080. The settings file enables JSON and disables public-instance features and autocomplete. No public-instance fallback is used.
- Queries contain only the visible company, role and location fields. Local does **not** mean offline: SearXNG sends those terms to its configured internet search engines, which see the terms and your network IP and apply their own policies. No resume, profile or email content is sent.
- The companion posts form-encoded `q` and `format=json` to `/search`. It accepts only explicit loopback HTTP endpoints, does not follow redirects, bounds responses to 512 KB and ten unique safe HTTPS source links, times out at 12 seconds, caches for 24 hours and allows 20 uncached attempts per hour per process.
- `JOB_BUDDY_SEARXNG_URL` optionally changes the companion endpoint; only `http://127.0.0.1:PORT` or `http://[::1]:PORT` is accepted. If changing the port, also adjust the Compose host binding and `SEARXNG_BASE_URL`. The supplied Compose configuration uses IPv4 only. Blank/malformed URLs are invalid; omit the variable to use the default. No `VITE_` variable is needed.
- Connection failure: check Docker Desktop, `searxng:status`, startup time and port conflicts. Never terminate an unrelated port owner automatically.
- HTTP 403: check that `json` is enabled under `search.formats` and access controls permit API requests. The supplied settings enable it.
- Empty results with reported engine failures: retry later. Search engines may rate-limit or challenge automated requests; Job Buddy does not bypass CAPTCHA or access controls. Empty successful searches remain distinct from failures.
- Existing `JOB_BUDDY_BRAVE_SEARCH_API_KEY` is no longer used. It may be removed from your local environment; do not share it. The leak scanner retains legacy-key protection.
- The official image is pinned by digest in `infra/searxng/compose.yaml`. Updating requires explicitly choosing a new official digest and retesting; it does not silently pull a changed `latest` image.

## Evidence quality

Search engines are discovery tools, not salary sources. A result found by several engines still counts as one publisher. The existing manual review, comparable-currency/pay-basis blend, downward rounding, dates and limited/moderate confidence rules remain unchanged. Search failures do not replace saved research.

## Verification status

All 772 unit tests across 101 files and the production build passed. Provider/route/UI tests use synthetic network responses. The source-review/save/reload browser flow also passed. Public-tree, client-secret and research-source checks passed. Independent review checked the pinned official image and its entrypoint against the configuration; it did not run the container.

Local setup progress on 2026-09-20: WSL 2.7.14 was installed and Windows enabled Virtual Machine Platform. Windows reported a required reboot, which was not performed automatically. Docker Desktop's installer download remains incomplete; it has not been executed. After the owner restarts Windows, finish Docker installation and verify a real SearXNG query before calling local search operational.

References: [SearXNG API](https://docs.searxng.org/dev/search_api.html), [official container setup](https://docs.searxng.org/admin/installation-docker.html), [JSON formats](https://docs.searxng.org/admin/settings/settings_search.html).

</details>
