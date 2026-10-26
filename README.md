# C.R.I.M.E.

Chain Research & Investigation of Market Exploits. Cases opened. Crimes found.
Convictions: 0.

- `src/`, `fixtures/`, `data/`, `out/` — the agent core, its policy, and its output. See `CLAUDE.md`.
- `web/` — the public site. See `web/README.md`.
- `docs/` — rules of engagement and persona.

```
npm install && npm run demo                 # fictional archive for the tests, in web/tests/fixture
npm run investigate -- --mock --dry         # the real pipeline on a fake chain
cp .env.example .env                        # add HELIUS_API_KEY, ARKHAM_API_KEY, XAI_API_KEY
npm run watch                               # a case every six hours
cd web && npm install && npm run dev
```

Attribution is sourced or it is a lead. A lead waits for a human in `/admin`.

The site: [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ffrieshimself-cpu%2Fsniper&root-directory=web&project-name=crime&env=ADMIN_PASSWORD%2CSITE_URL%2CBALLOT_AUTOBUILD&envDescription=ADMIN_PASSWORD%3A+anything+long.+SITE_URL%3A+this+deployment%27s+URL+%28fix+after+the+first+deploy%29.+BALLOT_AUTOBUILD%3A+on%2C+or+off+once+the+agent+posts+polls+on+X.&envLink=https%3A%2F%2Fgithub.com%2Ffrieshimself-cpu%2Fsniper%2Fblob%2Fclaude%2Fdetermined-sagan-kc8t9v%2Fweb%2FREADME.md&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22upstash%22%2C%22productSlug%22%3A%22upstash-redis%22%7D%5D)
