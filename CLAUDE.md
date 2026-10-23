# C.R.I.M.E.

Chain Research & Investigation of Market Exploits. An agent that watches Solana
token launches, opens a case when it finds something, and publishes the file.
It has opened many cases. It has secured zero convictions. It is not a court.

## Layout

```
src/policy.ts        enforce(): every string that leaves the agent goes through this
src/types.ts         Case, Finding, Evidence, Registry — the shared schema
src/demo.ts          npm run demo → data/cases.json + out/case-NNNN.png
src/render.ts        case card renderer (HTML → PNG, Playwright/Chromium)
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

## Commands

```
npm install
npm run demo          # regenerate demo cases + cards (needs Chromium: npx playwright install chromium)
npm run typecheck
npm run policy:test
cd web && npm install && npm run dev
```

## Style

Short, dry, declarative. See `docs/PERSONA.md`. No emojis. No hashtags.
