# C.R.I.M.E. — one image, two roles: `agent` (investigator on a timer) and `web` (the site).
FROM mcr.microsoft.com/playwright:v1.56.1-noble AS base
ENV NODE_ENV=production PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /srv/crime

# agent deps
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# web deps
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci --include=dev

COPY . .
RUN cd web && npm run build

# the site is served from /srv/crime/web, the agent from /srv/crime
EXPOSE 3000
CMD ["npm", "run", "watch"]
