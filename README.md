# C.R.I.M.E.

Chain Research & Investigation of Market Exploits. Cases opened. Crimes found.
Convictions: 0.

- `src/`, `fixtures/`, `data/`, `out/` — the agent core, its policy, and its output. See `CLAUDE.md`.
- `web/` — the public site. See `web/README.md`.
- `docs/` — rules of engagement and persona.

```
npm install && npm run demo                 # fictional archive + cards
npm run investigate -- --mock --dry         # the real pipeline on a fake chain
cp .env.example .env                        # add HELIUS_API_KEY, ARKHAM_API_KEY, XAI_API_KEY
npm run watch                               # a case every six hours
cd web && npm install && npm run dev
```

Attribution is sourced or it is a lead. A lead waits for a human in `/admin`.
