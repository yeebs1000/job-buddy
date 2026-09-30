# One Job Buddy Gmail connector

Status: connection UX and desktop OAuth support implemented; Google project registration, public client ID, verification and real-account acceptance remain external release gates. Do not claim Google approval or a live tested connector until those gates are complete.

## Maintainer setup

1. Create the maintainer-owned Google Cloud project and enable Gmail API. Configure branding, audience and named test users while in Testing.
2. Create a **Desktop app** OAuth client. Job Buddy uses system-browser consent, PKCE and `http://127.0.0.1:43117/api/gmail/oauth/callback`. Do not package a confidential web-client secret in an open-source app.
3. For private testing, open **Settings → Set up Gmail**, paste the Desktop client ID and matching client secret from the client's downloaded Google JSON, then click **Save client ID**. Google may require `client_secret` at token exchange even when PKCE is used. The public ID and Windows-DPAPI-encrypted secret are stored atomically in `%LOCALAPPDATA%\JobBuddy\gmail-desktop-client.json`, never browser storage or the repository. The companion does not return the secret through an API. Updates take effect without restarting. To correct either value, choose **Stop waiting**, then **Change client ID** and re-enter both matching values; blank secret removes the old one. Disconnect first if account credentials remain. Replacement invalidates old attempts, rejects changes during callback completion, and preserves the previous configuration on persistence failure. Your tracked applications remain. Developers may alternatively set `GOOGLE_OAUTH_CLIENT_TYPE=desktop`, `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` in ignored `.env.local` and restart. Environment/build configuration cannot be overwritten by the form.
4. A configured distribution must supply working Desktop client credentials, not assume an ID alone is sufficient. The public identifier can be set in `server/gmail/desktopClient.ts`; a required matching secret must be configured on the companion. Leave defaults blank until the real project exists, and verify token exchange against that client before claiming a ready connector. Do not commit owner credentials or confidential web-client secrets. Independent self-hosting remains supported.
5. Verify branding/domain ownership, publish accurate privacy/support pages and complete Google's applicable restricted-scope review. Request only `gmail.readonly`. Google decides the required verification/security-assessment obligations for the final architecture; do not assume desktop storage exempts the app from all review.
6. Run owner-authorized real-account checks: consent/cancellation, initial scan, repeated daily checks, restart/refresh, revoked token, different-account reconnect, disconnect and failure recovery. Use a test account; do not add mail or credentials to fixtures, screenshots or Git.

## User experience and boundaries

Configured Windows build: Connect Gmail → Google consent popup → popup closes → bounded initial scan in the existing dashboard (up to 500 inbox messages from the last 90 days). Sign-in takes place on Google's origin, never an embedded imitation or iframe. The dashboard does not navigate away.

An ephemeral, origin-bound receipt confirms the exact OAuth attempt; the app does not infer success from an existing account or a closed window. The popup has no opener access, and its local callback closes itself. Receipts expire after 10 minutes, contain no tokens/email, and are not persisted. PKCE and single-use OAuth state checks remain on the companion. Duplicate callbacks do not re-exchange a code.

Blocked popups expose retry guidance without changing scan preferences. Starting consent pauses automatic scans and resets the previous account's history cursor. **Stop waiting** stops polling and attempts to close the popup; it does not revoke an authorization already granted. If approval already happened, reload Settings to check the connection and explicitly run the first scan if needed. Successful setup enables daily active-session checks; failures preserve retry controls. Legacy same-tab callbacks remain compatible, but direct callback URLs without a recent connect intent do not automatically scan.

The browser must be open, visible, and the local companion running. Eligible scans are checked on app startup, focus and approximately every minute, with at least 24 hours between successful daily scans and a 15-minute failed-scan cooldown. Browser/device sleep delays scans. This is not a background mail daemon.

Approval mode remains the default. A mail scan proposes changes; offers, rejections, conflicts and uncertain matches are reviewed. The app does not send or delete mail. Reconnection resets the scan cursor and retains prior tracker evidence.

Tokens remain in the local Windows DPAPI vault. Normalized excerpts and links are retained in browser IndexedDB for the review trail. Disconnect revokes/removes the token but does not erase that evidence. Clearing browser storage is a separate destructive action. No Job Buddy-operated backend receives Gmail data; Google necessarily processes API requests. Local-first does not protect against another person with access to the same OS/browser session.

## Sources

- [Google installed-app OAuth and PKCE](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Google OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies)
- [Gmail scope classifications](https://developers.google.com/workspace/gmail/api/auth/scopes)

Existing self-hosted web clients remain supported with `GOOGLE_OAUTH_CLIENT_TYPE=web`, ID/secret and the exact authorized redirect above. Their secrets must stay on the owner-controlled companion, never in a distributed build or repository.
