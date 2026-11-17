# Handoff: Flow website redesign ("Lift")

Branch: `claude/flow-website-audit-g323li` in `themortgagepug/flow-rate-checker` (open PR #7, not merged).
Last updated: 2026-11-17. Draft only. Nothing here is live, published or deployed.

## 1. Goal

Alex, 2026-11-14: "The goal is to build the non ai looking, unique, fast and functional site that represent who we are and stays unique to us."

Every page decision is scored on five tests, in order:

1. Made by a person, for Flow.
2. Only Flow could use it.
3. Fast: phone LCP under 2.5 s.
4. Works: one clear next step on every screen, phone first.
5. Still ours in a year.

## 2. Where things are

| What | Where |
|---|---|
| Current prototype (v5), single file, open in any browser | `prototype/flow-lift-v5.html` |
| Same prototype as editable source (images not in repo; use the single file to view) | `.claude/skills/flow-web-design/reference/lift.html` |
| Design rules, claims rules, resource library | `.claude/skills/flow-web-design/SKILL.md` |
| Speed and copy audit script | `.claude/skills/flow-web-design/scripts/site-audit.cjs` (`node site-audit.cjs <url> <outDir>`) |
| Smooth walkthrough video recorder (Playwright clock, 30 fps frames) | `.claude/skills/flow-web-design/scripts/record-frames.cjs` |
| Older direction (round 3, "Below the surface", dropped) | `.claude/skills/flow-web-design/reference/below-the-surface.html` |
| PDFs, videos and every prototype version | Google Drive: FLOW - Mothership / FLOW / MARKETING / 2026-11-14 Website Concepts (folder id `1nC85Sca_TXXflkC9GuKK13_qQ7_0TqtI`) |
| Audit PDF | Same MARKETING folder: 2026-11-14 Website Visual Audit |
| Running notes | Supabase brain (project `jkeujqzlclrxhwamplby`), table `brain`, rows 1267 (resource library) and 1268 (goal, every round, every decision) |

Preview or Vercel URLs: none. Nothing has been deployed. To preview, open `prototype/flow-lift-v5.html` locally. Add `#day` or `#dusk` to the URL to force the sky.

This repo is a mirror of the rate checker site (see DEPLOYMENT.md). The live homepage www.getflowmortgage.ca is the Lovable project "Flow Mortgage Hub" (repo themortgagepug/flow-mortgage-hub). Nothing in this branch changes either site.

## 3. Decisions Alex made (newest first)

### v5 (Nov 16)

- **Rate is never first.** It must never lead any list, section order, picker or nav. Alex: "rates is Not first.. ever". On the homepage the rate question is the last section.
- **No Bank of Canada date chip.**
- **The main call to action is a guided picker**, "What are you working on?". It routes to the live program pages:
  - Buying a home: /ready
  - Renewing my mortgage: /smart
  - Using my equity: /equity
  - I'm self-employed: /boss
  - Investing in property: /invest
  - Not sure yet? Talk to us: /contact
- **"Get started" in the nav and the phone dock scrolls to the picker.**
- **Balloons are decoration only.** Alex: "The balloons are a bit confusing". Three balloons stay tied to the hero home. There is no "Balloon N of 5", no gauge and no balloon copy.

### v4 (Nov 16)

- **The sky follows the viewer's local day and night.** It uses sunrise and sunset for the date (latitude 50, DST-aware). A manual override button stays.
- **The team is small and in the background.** Alex: "smaller or behind in case they change". The page shows small overlapping faces, "Talk with our team" and a "Meet the team" link to /about. No names or roles appear on the homepage.
- **Team photos come from the live About page.** Alex: "see current team page". Check the `team_members` table for who is active.
- **Event photos are used only where they apply.** Alex on the EVOLV photo: "no unless it applies".

### v3 (Nov 15)

- **One typeface:** Figtree 400/600/800 for every word.
- **Houses are cartoon but clean and flat.** They have thick navy outlines, round windows and flat fills. Each one rides on a raft.
- **Motion is calm.** Nothing pops, flickers or jumps. Walkthrough videos are recorded frame by frame.
- **The page is not centred on Alex.** There is no founder face in the hero. He dislikes the brick-wall portrait.
- **Copy goes through the humanizer pass.** No AI phrasing.

### v2 (Nov 15)

- **Client questions use the client's own wording, made exceptionally clear.** There is no "Based on a real client question" label.

### Round 4, "Lift" (Nov 15)

- **Brighter, friendlier blues with no teal.** Alex: "looks a little bit intimidating ... I want more blue".
- **Nothing may look like it is sinking.** Alex: "looks much more like drowning". The page rises.
- **Floating houses and a home lifted by balloons, in our own drawings.** Never copy the Up house.

### Earlier rounds

- Rounds 1 to 3 were dropped: "The flow line", "The waterline" and "Below the surface".

### Standing rules, every round

- **Approved claims only:**
  - "400+ five-star Google reviews"
  - "Award-winning, CMP Top 75 broker every year since 2018"
- **Not allowed in copy:**
  - "Top 3", "Top 20" or "Top 25"
  - funded volume or funded counts
  - "4,000+ families"
- **Rates and positioning:** no rates without Alex's written OK, no cheap-rate positioning, and never predict rate direction.
- **People:** never name other brokers, and never show client faces.
- **Results:** never gate a quiz or tool result behind contact details.
- **Writing:** no em dashes, no emojis.
- **Drafts:** nothing publishes or sends without Alex's go.

## 4. What's done

- Visual audit of www.getflowmortgage.ca (Nov 14):
  - Phone LCP 5.2 to 6.0 s on a Lighthouse-style throttle.
  - 2.0 MB of JS, about half of it Google Tag Manager and Facebook.
  - 93 tap targets under 44 px.
  - The claims and copy issues are listed in the audit PDF.
- Design resource library reviewed, with licences: component.gallery, navbar.gallery, pixlpin.com, vanta.supply, dithercn.dev.
- `flow-web-design` skill: rules, audit script and video recorder.
- Prototypes, each with a PDF and phone/desktop walkthrough videos in Drive:
  - Rounds 1 to 4
  - Lift v2, v3, v4 and v5
- v5 measured on a local server: phone LCP 0.7 s, Figtree only, 0 tap targets under 44 px, no sideways scroll, 0 em dashes or emojis.

## 5. What's left

1. **Alex's go on v5.** He said "It's getting way better" on v4, and v5 applies his notes.
2. **Build plan and build for the real site.** The other session is moving the site from Lovable to Vercel. Port `reference/lift.html` as components:
   - one SVG scene
   - picker
   - question sections
   - team row
   - reviews
   - footer

   Keep the 2.5 s phone LCP budget. Load tracking tags after first paint. Run `site-audit.cjs` before any publish.
3. **Team photos.**
   - The March 2026 team headshots, which are also the ones on the live About page, carry the Gemini sparkle. That means they are AI-made or AI-edited.
   - Alex chose to use the About page photos as small avatars.
   - Real photos would fit the "non AI looking" goal better. Ask before using them larger.
4. **Live site fixes found along the way** (not done, need Alex's go):
   - Leah May is still on the About page. She resigned Oct 30.
   - Name spelling: "Joanna Kuchta" on the site vs "Joana" in `team_members`.
   - Emoji in the About footer heading.
   - Em dashes in review credits.
   - Unapproved "Top N" and "families" claims.
   - Region wording: the site says Canada-wide, the voice rules say BC and Alberta.
   - Footer acronyms S.M.A.R.T. and E.Q.U.I.T.Y. are not on the allowed list.
   - "Banks sell rates. We deliver clarity." is a banned two-beat slogan.
   - Tyler R. review label.
5. **Call counts on the question sections are draft keyword matches.** For example, "Asked on about 1 in 4 of our calls" comes from 1,810 calls in `ops_content_extracts`. They need a tagging pass before going public.
6. **The "Watch how it works" video slot needs homepage video #6.** The plan is in Drive MARKETING / 2026-11-06 Hormozi VSL Build.
7. **Photos on Alex's MacBook are not reachable from cloud sessions.** Use a Drive folder, or Remote Control folder sharing from the Claude desktop app on that Mac.
