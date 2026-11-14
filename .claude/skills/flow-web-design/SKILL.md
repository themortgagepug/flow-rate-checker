---
name: flow-web-design
description: Audit, redesign or visually improve any Flow Mortgage Co. website (getflowmortgage.ca, rate.getflowmortgage.ca, Lovable-built tools). Loads Alex's design direction, the copy and claims rules that apply to live pages, a one-command speed and copy audit, and the vetted design resource library (component.gallery, navbar.gallery, pixlpin.com, vanta.supply, dithercn.dev) with a verdict and licence for each. Use when asked to audit the site, improve how it looks, redo the nav, hero, reviews or palette, pick fonts, find design inspiration, or check a page before Publish.
---

# Flow web design

Use this before touching how any Flow site looks or reads.
Built 2026-11-14 from the first visual audit (Drive: FLOW - Mothership / FLOW / MARKETING / 2026-11-14 Website Visual Audit) and the first concepts (same path, 2026-11-14 Website Concepts Round 1).

## 0. The goal (Alex, 2026-11-14)

"The goal is to build the non ai looking, unique, fast and functional site that represent who we are and stays unique to us"

Score every page decision on these five tests, in order:

1. Made by a person, for Flow. No template cards, glow, gradient blobs or stock icons in rounded squares.
2. Only Flow could use it. Alex's face, the team, clients' own words, the water idea behind the name, Alex's voice.
3. Fast. Phone LCP under 2.5 s (baseline 5.2 to 6.0 s on 2026-11-14).
4. Works. One clear next step on every screen, phone first, no gate in front of a tool result.
5. Still ours in a year. Nothing borrowed from a trend.

Own one idea and keep everything else plain. The winners Alex named each own a single idea (Mercury: one photo world with a river; Stripe: one colour wave and a live number; Family: drawn characters). Nav, buttons and forms stay boring and fast.

Round 1 concepts (2026-11-14): "The flow line" (one SVG water line drawn from the logo wave, Figtree) and "Real people" (Alex, the team and real reviews, Atkinson Hyperlegible). Recommended: merge, with the people as the body and the line as the single signature. Reskinning the current template (audit Option B) is dropped.

## 1. Read first

Live sources override this file. Query them at the start of every run.

- Supabase brain, project `jkeujqzlclrxhwamplby`, table `brain`:
  - `topic ilike '%website design direction%'` (Jul 17 redesign direction)
  - `topic ilike '%interactive tools minimal%'` (Oct 23 rule for calculators and quizzes)
  - `topic ilike '%no funded volume%'` (Nov 2 claims rule)
  - `topic ilike '%web design resource library%'` (this skill's resource list, kept current)
  - `topic ilike '%flow homepage lovable%'` (which Lovable project serves which domain, prerender history)
- Drive: FLOW Brain Doc 01 "HARD Rules and Standing Rules" and Doc 08 "Change Log".

## 2. Where each site lives

| Domain | Built in | Notes |
|---|---|---|
| www.getflowmortgage.ca | Lovable project "Flow Mortgage Hub" `6bf89f98-af7b-4e56-9d55-b7dc5af1f96b`, repo themortgagepug/flow-mortgage-hub | Look-alike "Flow Mortgage Studio" serves studio.getflowmortgage.ca. Confirm the domain in Share/Publish before editing. |
| rate.getflowmortgage.ca | Lovable project `62c19ea2-e711-4f60-9b59-6f397b40cfd5` | Has no Git connection. The repo themortgagepug/flow-rate-checker is a dead mirror (see its DEPLOYMENT.md). |

Lovable prompts go as one line (Enter sends). "Merged" is not "live": every change needs Publish. Publish only after Alex says go.

## 3. Design direction (Alex, Jul 17 2026)

- Dark backgrounds.
- A range of water blues: deep ocean navy to teal to turquoise and aqua. One cyan on navy is the current look and reads as a template.
- A human, easy-to-read typeface. Alex named Inter, Poppins, Montserrat, Space Grotesk and Roboto as "AI" fonts and rejected Fraunces (serif display).
- Stand out, but stay easy to navigate. Smooth motion with framer-motion, nothing gimmicky.
- Rejected looks: warm-paper editorial, dark fintech with particles or glow, serif display.
- Benchmark against named real sites: Family, Stripe, Mercury, Lusion, Wealthsimple.
- Only design what ships cleanly in Lovable (React, Tailwind, shadcn, framer-motion).

Interactive tools (calculators, quizzes, rate checker), Oct 23: navy, white and grey with cyan as the only accent. No cards, glows, gradients, green or amber. Site fonts inside the site Layout.

Decks and one-sheets use Style A (navy, cyan edge, Bebas Neue and Inter). That rule does not apply to the website.

## 4. Copy and claims rules for live pages

- Award claim: "Award-winning, CMP Top 75 broker every year since 2018", with source and date. "Top 3", "Top 20" and "Top 25" are not approved.
- Reviews: "400+ five-star Google reviews".
- No funded counts, application counts or dollar volume ("$1B+ funded", "4,000+ properties financed").
- No em dashes. No emojis.
- No rates without Alex's written OK. Never Ratehub or aggregator rates.
- Never gate a quiz or tool result behind name, email or phone.
- Never name other brokers. No client faces.
- Run the humanizer skill on any new page copy before showing it to Alex.

## 5. Audit in one command

```bash
node .claude/skills/flow-web-design/scripts/site-audit.cjs https://www.getflowmortgage.ca/ ./audit-out
```

It prints JSON and saves desktop and phone screenshots:

- Phone LCP and first paint under Lighthouse mobile throttling (150 ms, 1.6 Mbps, 4x CPU). Run it twice: results moved 5.2 s to 6.0 s between runs on 2026-11-13/14.
- JavaScript weight split by host (own code vs Google Tag Manager, Facebook and the rest).
- Fonts loaded, tap targets under 44 px, page height on a phone.
- Every "Top N", dollar-volume, funded or financed, families count, rating mention, emoji and em dash, with surrounding text.

Then look at the screenshots yourself. Check:

1. Speed: phone LCP under 2.5 s. Third-party tags load after first paint.
2. Claims and copy rules from section 4.
3. Palette and type against section 3.
4. Repetition: rating shown at most twice, one stats band, one button per card.
5. Phone: no overlap from the chat bubble, solid menu panel, buttons at least 44 px (48 is better).
6. Reviews visible without clicking. Text only.
7. Header is one row on desktop.

Baseline from 2026-11-14 (homepage): phone LCP 5.2 to 6.0 s; 2.0 MB JS uncompressed (own 937 KB in 47 files, GTM 529 KB, Facebook 553 KB); fonts Outfit, Inter, Montserrat; 93 small tap targets; 11,200 px tall on a phone. Rate site: LCP 2.4 s, 0.33 MB JS.

## 6. Design resource library

Verdicts are against section 3. Licences read 2026-11-13.

| Resource | Use it for | Licence | Verdict |
|---|---|---|---|
| component.gallery | Checklist for FAQ accordions, reviews, ratings, tabs and nav. Compare Flow's version with 2-3 mature design systems. | Free reference, links out, no code | Use |
| navbar.gallery | Header redesign. Start with the Static and Announcement types. | Free, screenshots of live sites | Use |
| pixlpin.com | Mood boards of real finance sites (/designs/site/finance) and motion references. | Terms: "Seeing it here gives you no right to reuse it." Inspiration only. | Use, references only |
| vanta.supply | At most one slow water-like shader behind a hero, if light and off for reduced motion. | Commercial use OK, no credit, no resale. Pro shown at $72 a year. | Park. Its particles, glow and chrome are the rejected look. |
| dithercn.dev | Nothing for Flow. | No licence found | Skip. Retro pixel look plus WebGL weight. |

Never copy a design from a gallery. Use galleries to pick patterns, then build Flow's own version.

## 7. Output

- Findings and options to Alex as a PDF in FLOW - Mothership / FLOW / MARKETING / `<date> <name>`. Never .md files to Alex.
- Short lines, the decision in bold, numbers with every finding.
- Show a picture of any new layout, palette or typeface before building it.
- Draft only. Nothing is published or sent until Alex says so.
- Add new resources to the brain row "Reference Web Design Resource Library" and to the table above.
