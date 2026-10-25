# C.R.I.M.E.

Chain Research & Investigation of Market Exploits. An agent that watches Solana
token launches, opens a case when it finds something, and publishes the file.
It has opened many cases. It has secured zero convictions. It is not a court.

## Layout

```
src/policy.ts        enforce(): every string that leaves the agent goes through this
src/types.ts         Case, Finding, Evidence, Registry — the shared schema
src/demo.ts          npm run demo → data/cases.json + out/case-NNNN.png (fictional)
src/render.ts        case card renderer (HTML → PNG, Playwright/Chromium)
src/investigate.ts   npm run investigate → one real case from the chain
src/schedule.ts      npm run watch → an investigation every 6 hours
src/detectors.ts     what the agent looks for (bundles, exits, LP pulls, dev sells, concentration)
src/sources/         helius.ts (chain), arkham.ts (labels), grok.ts (X posts), mock.ts (fake chain for tests)
data/leads.json      attribution the agent could not source well enough; reviewed in /admin
data/status.json     last run, next run, what happened
data/watchlist.json  mints to investigate when the ballot has no new winner
fixtures/registry.json   handles on the record, wallets with tier + source link
data/cases.json      the case archive (generated)
out/case-NNNN.png    one card per case (generated)
docs/RULES_OF_ENGAGEMENT.md   what the agent may and may not publish
docs/PERSONA.md      how the agent talks
web/                 the public site (Next.js). Reads the three paths above through web/lib/data.ts
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

## How a case gets opened

1. Subject: yesterday's ballot winner, else the next mint in `data/watchlist.json`, else `--subject`.
2. Chain (Helius): deployer, pool, launch, first buyers, their funders, sells, liquidity, holders.
3. Detectors score what they find. Below `MIN_PUBLISH_SCORE` nothing is published.
4. Money trail: largest SOL outflow, hop by hop, until a labelled exchange or bridge.
5. Attribution, in this order and no further:
   - the handle's own post containing the address (Grok with X search, URL required) → registry, tier `claimed`
   - an Arkham verified label carrying a handle → registry, tier `probable`
   - an Arkham prediction, or a third party's "that's @x" → `data/leads.json`, a human approves in /admin
   - a person's name → dropped on the floor
6. Case written, card rendered, status updated. The site picks it up on the next request.

## Commands

```
npm install
npm run demo                              # fictional archive + cards (needs Chromium: npx playwright install chromium)
npm run investigate -- --mock --dry       # full pipeline on a fake chain, prints the case, writes nothing
npm run investigate -- --subject <mint>   # one real case (HELIUS_API_KEY required)
npm run watch                             # every INVESTIGATE_INTERVAL_HOURS, forever
npm run typecheck
npm run policy:test
cd web && npm install && npm run dev
```

## Style

Short, dry, declarative. See `docs/PERSONA.md`. No emojis. No hashtags.
