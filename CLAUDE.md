# C.R.I.M.E.

Chain Research & Investigation of Market Exploits. The public votes on a handle; an agent reads
that person's whole record, posts and wallets, and publishes the file when the chain contradicts the feed.
It has opened many cases. It has secured zero convictions. It is not a court.

## Layout

```
src/policy.ts        enforce(): every string that leaves the agent goes through this
src/types.ts         Case, Finding, Evidence, Registry — the shared schema
src/demo.ts          npm run demo → fictional archive into web/tests/fixture (the smoke tests read it)
src/render.ts        case card renderer (HTML → PNG, Playwright/Chromium)
src/investigate.ts   npm run investigate → one case: --subject <mint> for a launch, --subject @handle for a person
src/person.ts        a handle's record: posts (X), claims (Grok), wallets (own posts + Arkham), chain replay, findings
src/cycle.ts         npm run cycle → read the polls a human posted on X, settle the closed ones, investigate the winner
src/schedule.ts      npm run watch → a cycle every hour
src/state.ts         shared state (disputes, leads, progress): Turso or Upstash Redis when configured, else files
src/detectors.ts     what the agent looks for in a launch (bundles, exits, LP pulls, dev sells, concentration)
src/sources/         helius.ts (chain), arkham.ts (labels), grok.ts (reads posts), claims.ts (reads posts by rule),
                     x.ts (read only: timelines and polls),
                     discover.ts (DexScreener boosts, Jupiter trending), pumpfun.ts (bonding curve PDA), mock.ts
data/status.json     last run, next run, what happened
data/polls.json      the polls read from X and what came of them (generated)
data/watchlist.json  mints to investigate when there is nothing else
fixtures/registry.json   handles on the record, wallets with tier + source link
data/cases.json      the case archive (generated)
out/case-NNNN.png    one card per case (generated)
docs/RULES_OF_ENGAGEMENT.md   what the agent may and may not publish
docs/PERSONA.md      how the agent talks
web/                 the public site (Next.js). Reads the three paths above through web/lib/data.ts
.github/workflows/   investigate.yml (a cycle every hour, on GitHub), pages.yml (static site to GitHub Pages)
```

## Non-negotiables

- Handles only. Never a legal name, never a personal detail. `enforce()` is the
  last line of defence, not the first. Do not put names in fixtures either.
- A wallet is attributed to a handle only if `fixtures/registry.json` lists it
  with a `source` link. No source, no attribution.
- A disputed wallet disappears. It is not greyed out, it is not marked. Gone.
- The word "illegal" does not appear in anything the agent publishes. The agent
  finds things. Courts decide what they are. See `docs/RULES_OF_ENGAGEMENT.md`.
- Convictions: 0. Always. It is the joke and it is also true.

## The poll

A human posts a poll on the X account by hand: up to four names, ten minutes. Every quarter hour
`npm run cycle` reads the account's polls (read only; the agent never writes to X, and
`src/sources/x.ts` has no method that could), waits for one closing soon, settles the ones that
closed: the winner is investigated and the case goes on the site, the poll and its outcome go to
`data/polls.json`. No votes, nothing opened (`REQUIRE_VOTES`). The site shows the live poll from X
(`X_BEARER_TOKEN`, read only) and the settled ones from `data/polls.json`.

## How a person's case gets opened

1. The record: the handle's posts from the X API, all of them the API allows (`PERSON_MAX_POSTS`, 3,200),
   typed into claims by Grok, or by rule when there is no Grok: shill, holding, lp_locked, sold, launch,
   wallet. Every claim keeps its post URL. Grok also searches X for what others said about the handle and
   for promotions since deleted; only cited posts count.
2. The wallets: addresses the handle posted itself (tier claimed, the post is the source), the wallets
   already on the registry, the wallets Arkham ties to the handle's entity (tier probable, the Arkham page
   is the source; on-curve only; capped by `PERSON_MAX_WALLETS`), and then the ones never admitted: plain
   SOL transfers between a wallet on the record and another wallet, two of them or one of five SOL, make a
   link (tier probable, the linking transaction is the source; services and other people's labelled
   wallets never link; capped by `PERSON_MAX_LINKED`).
3. The replay: every wallet's transfers, deduplicated. Posts go next to transactions by time. Profit per
   token in SOL from the swap legs across the whole set (`pnl` on the case).
4. Findings, each with a weight: promoted then sold (and what it made); said holding while selling; said
   safe while liquidity left; launched or promoted a token whose own file (the launch detectors) is bad;
   a claimed wallet funded a bundle; wallets never admitted; promotions since deleted; called out by
   others. Without X and Grok, the wallets' own launches stand in.
5. Worst first: findings are sorted by weight, the headline is the heaviest, the narrative opens with the
   top three. Same publish rule as a launch. The case carries kind "person", the handle as subject, and
   the worst token as its token.

## How a case gets opened

1. Subject: `--subject` (the cycle passes the poll winner), else the next mint in `data/watchlist.json`,
   else (only with `REQUIRE_VOTES=off`) a discovery scan that keeps the worst one. Nothing is nominated or
   voted on the site; the poll is on X and the site only shows it.
2. Chain (Helius): for a pump.fun mint the bonding curve is derived from the mint (`src/sources/pumpfun.ts`)
   and its first transaction is the launch; otherwise the earliest reachable fee payer and the pool seed.
   Then first buyers, their funders, exits, deployer sells and transfers, liquidity, holders.
3. Detectors score what they find. A case needs `MIN_PUBLISH_SCORE` and two findings, or `STRONG_SCORE` alone.
   Otherwise nothing is published.
4. Money trail: largest SOL outflow, hop by hop, until a labelled exchange or bridge.
5. Attribution, in this order and no further:
   - the handle's own post containing the address (Grok with X search, URL required) → registry, tier `claimed`
   - an Arkham verified label carrying a handle → registry, tier `probable`
   - an Arkham prediction, or a third party's "that's @x" → a lead in shared state, a human approves in /admin,
     the agent writes it to the registry on its next run
   - a person's name → dropped on the floor
6. Case written, card rendered, status updated. The site picks it up on the next request.

## Commands

```
npm install
npm run demo                              # fictional archive into web/tests/fixture (needs Chromium: npx playwright install chromium)
npm run investigate -- --mock --dry       # full pipeline on a fake chain, prints the case, writes nothing
npm run investigate -- --subject <mint>   # one real case (HELIUS_API_KEY required)
npm run cycle                             # read the account's polls, settle the closed ones
npm run cycle -- --poll <url>             # settle one poll now
npm run watch                             # a cycle every INVESTIGATE_INTERVAL_HOURS, forever
npm run typecheck
npm run policy:test
cd web && npm install && npm run dev
```

## Two ways to serve the site

- `npm run build && npm run start` in web/: the full site, request-time data, votes, disputes, /admin.
- `npm run build:static` in web/: a read-only export for GitHub Pages. Route handlers are set aside
  and the API is written as .json files by `web/scripts/static-api.ts`. Clients switch on
  `NEXT_PUBLIC_STATIC`. Never add a page that reads cookies or the query string on the server
  without checking it still exports.

## Style

Short, dry, declarative. See `docs/PERSONA.md`. No emojis. No hashtags.
