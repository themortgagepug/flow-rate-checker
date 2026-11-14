# flow-rate-checker

This repo does not deploy. Read `DEPLOYMENT.md` before changing anything.

## Browser automation: agent-browser, not Playwright

Use Vercel's `agent-browser` CLI for all browser work here:
checking the rate grader, screenshots, form tests, QA.
Do not write Playwright scripts or use the Playwright MCP.

Why: it hands back only the interactive elements, each with a ref
(`@e1`, `@e2`), instead of the whole page tree.
On the Rate My Rate landing page (measured 2026-11-14):

| Output | Size |
|---|---|
| `agent-browser snapshot -i` | 620 bytes |
| Playwright aria snapshot | 2,385 bytes |
| Raw HTML | 37,117 bytes |

Use `snapshot -i`. A full `snapshot` is not smaller than Playwright's.

### Setup

```bash
npm i -g agent-browser@0.43.0
agent-browser install   # Mac only: downloads Chrome for Testing
```

Claude Code cloud sessions already have Chromium. Skip `agent-browser install`
and give the path on the command that launches the browser (the first `open`).
Later commands reuse the running browser and do not need it.

```bash
AGENT_BROWSER_EXECUTABLE_PATH=/opt/pw-browsers/chromium agent-browser open https://rate.getflowmortgage.ca
```

It will warn that this Chromium is behind stable. Fine for testing our own pages.

### The loop

```bash
agent-browser open https://rate.getflowmortgage.ca
agent-browser snapshot -i            # read refs
agent-browser fill @e11 "4.89"       # act on refs
agent-browser click @e10
agent-browser snapshot -i            # refs change after the page changes
agent-browser screenshot shot.png
agent-browser close
```

Full guide for the installed version: `agent-browser skills get core`.
Skill stub: `.claude/skills/agent-browser/SKILL.md`.
