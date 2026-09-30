# Job Buddy

Your applications, inbox updates and next steps—together in one local dashboard.

[![CI](https://github.com/yeebs1000/job-buddy/actions/workflows/ci.yml/badge.svg)](https://github.com/yeebs1000/job-buddy/actions/workflows/ci.yml)
[中文](README.zh-CN.md) · [Releases](https://github.com/yeebs1000/job-buddy/releases) · [Roadmap](ROADMAP.md)

![Application Hub showing application stages, deadlines and salary information](docs/images/application-hub.png)
*Application Hub · illustrative data.*

## What it does

- **Gmail updates:** scan application emails and review suggested changes.
- **Application Hub:** see stages, deadlines, notes and next actions at a glance.
- **Salary research:** keep salary ranges, confidence and sourced company ratings beside each application.
- **Excel import/export:** bring your existing tracker with you.
- **Local profile:** save your details and review information imported from your resume.

Your tracker stays on your device. Gmail access is read-only.

## Get started

**Windows source beta · Node.js 24.19+ (24.x)**

```powershell
git clone https://github.com/yeebs1000/job-buddy.git
cd job-buddy
npm.cmd ci
npm.cmd run dev
```

Open [127.0.0.1:5173](http://127.0.0.1:5173). Connect Gmail in Settings using the [Gmail setup guide](docs/gmail-maintainer-setup.md). For web research, add your Tavily key in Settings.

## Roadmap

| Next | V2 |
| --- | --- |
| Windows and macOS downloads | Browser Buddy autofill |
| Smoother setup | Better email extraction and research summaries |

## Contributions welcome

Bug reports, ideas, documentation and focused pull requests are welcome. Start with [Contributing](CONTRIBUTING.md), or [open an issue](https://github.com/yeebs1000/job-buddy/issues). Use fictional data in examples.

[Privacy](PRIVACY.md) · [Security](SECURITY.md) · [MIT License](LICENSE)
