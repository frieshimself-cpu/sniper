# C.R.I.M.E. — web

The public site. Next.js App Router, TypeScript, Tailwind, no UI library.
It reads the agent's output through one module, `lib/data.ts`:

```
../data/cases.json          the case archive
../out/case-NNNN.png        one card per case (served at /cases/:n/card.png)
../fixtures/registry.json   handles and wallets on the record
../src/policy.ts            enforce(): every string passes through it
```

Site state that is not the agent's (ballots, votes, disputes) lives as JSON
files in `.data/` (or `CRIME_STATE_DIR`). One process, one writer. Back it up.

## Run it

```
# from the repo root: real data first
npm install                        # the real archive is in data/, out/ and fixtures/; npm run demo only feeds the tests

cd web
npm install
cp .env.example .env.local         # then edit
npm run dev                        # http://localhost:3000
```

Production:

```
npm run build
npm run start -- -p 3000
```

Tests (one Playwright smoke test per page, against the production build and the demo data):

```
npm run build && npm test
```

## Pages

| Path | What |
| --- | --- |
| `/` | counter (cases opened, crimes found, convictions 0), status pills, today's ballot, latest six cases |
| `/cases` | archive. Search by CA, `$symbol` or `@handle`. Filter by severity. Newest first |
| `/cases/:n` | the card PNG, findings, evidence table with Solscan links, money trail, narrative, CSV, `og:image` |
| `/persons`, `/persons/:handle` | dossiers. Rollup, wallets on the record (tier + source), tokens, Dispute |
| `/ballot` | this hour's ballot, the poll on X, tallies, history with the case each winner became |
| `/stamp` | client-side stamp generator. Upload, drag, rotate, download |
| `/embed` | iframe snippet for the 600×160 counter at `/embed/counter`, API docs |
| `/rules` | rules of engagement, how to dispute |
| `/admin` | password. Build today's ballot from eligible subjects, review disputes |

## API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/stats` | the counter. 15 s cache |
| GET | `/api/cases?q=&severity=&limit=` | archive, newest first |
| GET | `/api/cases/:n` | one case |
| GET | `/api/persons/:handle` | one dossier |
| GET | `/api/ballot?history=1` | today's ballot and tallies |
| POST | `/api/vote` | `{ ballot, option, wallet, signature }` |
| POST | `/api/dispute` | `{ wallet, signature }`. Hides the wallet. Returns `"Noted."` |
| POST | `/api/admin/login`, `/api/admin/logout`, `/api/admin/ballot`, `/api/admin/dispute` | admin cookie |

Signatures are base58, ed25519 over the UTF-8 message, Solana wallet style
(`signMessage` in Phantom and friends). Messages:

```
CRIME ballot <id> vote <option>
CRIME dispute <wallet>
```

Verification is server-side with `tweetnacl` and `bs58`. A vote needs the
signing wallet to hold at least `MIN_VOTE_BALANCE` of `CRIME_MINT`, checked
over RPC with `getTokenAccountsByOwner`. One vote per wallet per ballot. Never
weighted. Ballots close at the end of the UTC day. The runner-up carries to the
next ballot. Nothing is put on a ballot twice in 30 days.

Hard rules enforced in code, not by convention:

- handles only, never a legal name or personal detail (`enforce()` runs on every string that leaves `lib/data.ts` and every API response)
- a wallet is shown next to a handle only if the registry has it with a `source` link
- a disputed wallet is hidden everywhere, immediately, not greyed
- the word that courts use never appears (the smoke test checks every page and endpoint)

## Environment

| Var | Default | Meaning |
| --- | --- | --- |
| `SITE_URL` | `http://localhost:3000` | public base URL. Used for `og:image` and the embed snippet |
| `ADMIN_PASSWORD` | unset | required for `/admin`. Unset means `/admin` is closed |
| `CRIME_MINT` | unset | SPL mint of the CRIME token |
| `MIN_VOTE_BALANCE` | `1000` | minimum UI balance of `CRIME_MINT` to vote |
| `HELIUS_API_KEY` | unset | builds `https://mainnet.helius-rpc.com/?api-key=...` |
| `SOLANA_RPC_URL` | unset | full RPC URL. Overrides `HELIUS_API_KEY` |
| `VOTE_BALANCE_CHECK` | `on` | `off` skips the balance check. Dev and demo only |
| `BALLOT_SCORE_THRESHOLD` | `40` | a token is eligible for the ballot at or above this case score |
| `CRIME_STATE_DIR` | `web/.data` | where ballots, votes and disputes are written |

The agent has its own `.env` at the repo root (see `../.env.example`): `HELIUS_API_KEY`, `ARKHAM_API_KEY`, `XAI_API_KEY`,
`INVESTIGATE_INTERVAL_HOURS`, `MIN_PUBLISH_SCORE`, `DISCOVER_SCAN`. The site never needs those keys. It reads what the agent writes.

With `VOTE_BALANCE_CHECK=on` and no RPC or mint, `/api/vote` answers 503 and
the ballot page says so. Nothing else degrades.

## Deploy on Vercel (the full site, no server)

The full site runs on Vercel: votes, disputes, `/admin`, request-time data. Mutable state
lives in Upstash Redis so the agent on GitHub and the site on Vercel share it.

1. Import the repo at vercel.com/new. Root Directory: `web`. Framework: Next.js. Keep
   "Include source files outside of the Root Directory" on (the site imports `../src`).
2. Storage, add Upstash Redis (Vercel Marketplace). It sets `KV_REST_API_URL` and
   `KV_REST_API_TOKEN` on the project. Copy both into the GitHub repository secrets too, so
   the agent writes ballots and reads leads in the same place.
3. Environment variables on the project: `SITE_URL` (the Vercel URL), `ADMIN_PASSWORD`,
   `BALLOT_AUTOBUILD=off` when the agent posts polls on X (otherwise leave it on),
   `CRIME_MINT`, `MIN_VOTE_BALANCE`, `HELIUS_API_KEY` if on-site wallet voting is used.
4. Deploy. Every case the agent commits triggers a new deployment, because the build
   copies `../data`, `../out` and `../fixtures` into the site (`scripts/sync-agent-data.mjs`).
5. Set `SITE_URL` as a repository variable on GitHub so posts link to the Vercel site.

## The site on GitHub Pages, no server## The site on GitHub Pages, no server

`.github/workflows/pages.yml` builds a read-only static export of the site and publishes it
to GitHub Pages after every case the agent opens. Enable it once: Settings, Pages, Source:
GitHub Actions. The site then lives at `https://<owner>.github.io/<repo>/`.

What the static copy cannot do: accept votes, accept disputes, or show `/admin`. Those need
the server build below. Everything else is there: counter, archive and search, case files
with cards and CSVs, dossiers, rules, the stamp generator, the embed, and the API as files
(`/api/stats.json`, `/api/cases.json`, `/api/cases/1.json`, `/api/persons/<handle>.json`,
`/api/ballot.json`).

`npm run build:static` makes the same export locally into `web/out`.

## Run the agent on GitHub, no server

`.github/workflows/investigate.yml` runs one cycle an hour on GitHub's runners: it puts up
to four fresh launches on a poll on X for ten minutes, investigates the winner, posts the case
back to X with its card, and commits the case, the card and the registry to the branch.
Without X credentials the ballot runs on the site instead. Without votes nothing is opened.
Set these in the repository: Settings, Secrets and variables, Actions.

| Secret | Required |
| --- | --- |
| `HELIUS_API_KEY` | yes |
| `ARKHAM_API_KEY` | no, adds labels, exchange names on the trail, pump.fun usernames |
| `XAI_API_KEY` | no, adds self-claimed wallets from X posts |
| `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` | no, moves the vote to a poll on X and posts cases there (developer.x.com, Read and Write) |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | no, shares ballots and leads with the Vercel site |

Optional repository variables: `SITE_URL`, `X_POLL_MINUTES` (10), `REQUIRE_VOTES` (on), `MIN_PUBLISH_SCORE` (35).
Run it by hand from the Actions tab (workflow_dispatch) with a mint, or as a dry run.
The site then only needs to redeploy on push, or to pull the branch on a timer.

## Deploy with Docker (the short way)

Any VPS with Docker. Ubuntu on Hetzner or DigitalOcean, the smallest box with 2 GB RAM is enough.

```
git clone https://github.com/frieshimself-cpu/sniper /srv/crime && cd /srv/crime
cp .env.example .env              # HELIUS_API_KEY, ARKHAM_API_KEY, XAI_API_KEY
cp web/.env.example web/.env.local  # SITE_URL, ADMIN_PASSWORD, CRIME_MINT, HELIUS_API_KEY
docker compose up -d --build
```

That starts two containers from one image: `agent` (a case every six hours, cards rendered
with the bundled Chromium) and `web` (the site on 127.0.0.1:3000). The archive, cards,
registry and site state live in named volumes and survive rebuilds. Put TLS in front with
the `Caddyfile` in the repo root (`apt install caddy`, edit the domain, `systemctl restart caddy`)
or with the nginx block below.

Useful afterwards:

```
docker compose logs -f agent                              # watch it work
docker compose exec agent npm run investigate -- --subject <mint> --dry   # try a mint without publishing
docker compose exec agent npm run investigate -- --subject <mint>         # open a case now
git pull && docker compose up -d --build                  # update
```

## Deploy on a VPS behind nginx (without Docker)

Assumes Ubuntu, Node 22, the repo at `/srv/crime`, the site on port 3000.

1. Build the data and the site.

   ```
   cd /srv/crime
   npm ci && npx playwright install --with-deps chromium   # Chromium renders the cards
   cd web
   npm ci
   cat > .env.local <<'ENV'
   SITE_URL=https://crime.example
   ADMIN_PASSWORD=<long random string>
   CRIME_MINT=<mint>
   MIN_VOTE_BALANCE=1000
   HELIUS_API_KEY=<key>
   CRIME_STATE_DIR=/var/lib/crime
   ENV
   sudo mkdir -p /var/lib/crime && sudo chown $USER /var/lib/crime
   npm run build
   ```

2. Run the agent as a service so a case opens every six hours. `/etc/systemd/system/crime-agent.service`:

   ```
   [Unit]
   Description=C.R.I.M.E. investigator
   After=network.target

   [Service]
   WorkingDirectory=/srv/crime
   EnvironmentFile=/srv/crime/.env
   ExecStart=/usr/bin/npm run watch
   Restart=always
   User=crime

   [Install]
   WantedBy=multi-user.target
   ```

   The agent reads `web/.data/ballots.json` for the ballot winner, so run both services as the same user, or set
   `CRIME_STATE_DIR` identically for both.

3. Run the site as a service. `/etc/systemd/system/crime-web.service`:

   ```
   [Unit]
   Description=C.R.I.M.E. web
   After=network.target

   [Service]
   WorkingDirectory=/srv/crime/web
   ExecStart=/usr/bin/npm run start -- -p 3000
   Restart=always
   User=crime
   Environment=NODE_ENV=production

   [Install]
   WantedBy=multi-user.target
   ```

   ```
   sudo systemctl enable --now crime-agent crime-web
   ```

4. nginx. `/etc/nginx/sites-available/crime`:

   ```
   server {
       listen 80;
       server_name crime.example;
       return 301 https://$host$request_uri;
   }

   server {
       listen 443 ssl http2;
       server_name crime.example;

       ssl_certificate     /etc/letsencrypt/live/crime.example/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/crime.example/privkey.pem;

       client_max_body_size 1m;

       location /_next/static/ {
           proxy_pass http://127.0.0.1:3000;
           proxy_cache_valid 200 1y;
           add_header Cache-Control "public, max-age=31536000, immutable";
       }

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

   ```
   sudo ln -s /etc/nginx/sites-available/crime /etc/nginx/sites-enabled/
   sudo certbot --nginx -d crime.example
   sudo nginx -t && sudo systemctl reload nginx
   ```

   Do not add `X-Frame-Options` globally: `/embed/counter` must be frameable.
   The app sets `frame-ancestors *` on that one route only.

5. Updating. When the agent writes a new `data/cases.json` or a new card the
   site picks it up on the next request. No restart. For a new site build:

   ```
   cd /srv/crime && git pull && cd web && npm ci && npm run build && sudo systemctl restart crime-web
   ```

6. Back up `/var/lib/crime` (votes and disputes), `data/` and `fixtures/registry.json`
   (the archive and the attributions the agent has made).
