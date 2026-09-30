# Contributing

Thanks for helping make job applications easier to manage. Bug reports, small fixes, documentation and usability improvements are all welcome.

## Start here

1. Check existing issues; discuss larger changes before building.
2. Make a focused branch from the default branch.
3. Add tests for changed behavior and open a pull request with a short summary.

Follow the [roadmap](ROADMAP.md). Keep Gmail read-only, application changes user-controlled, and research tied to its sources.

## Development

Use Windows with Node.js 24.19+ (24.x).

```powershell
npm.cmd ci
npx.cmd playwright install chromium msedge
npm.cmd run dev
```

Before submitting:

```powershell
npm.cmd run check
npm.cmd run check:web
npm.cmd audit --omit=dev --audit-level=high
```

Use fictional data in tests, screenshots and issues. Never include real emails, resumes, credentials or tracker exports. Report vulnerabilities through [Security](SECURITY.md).
