/**
 * One smoke test per page, run against the production build with the demo data.
 * Also checks the hard rules a page can break: the forbidden word, hidden wallets.
 */
import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import nacl from "tweetnacl";
import bs58 from "bs58";

const FORBIDDEN = /\billegal/i;
const REGISTRY_WALLET = "DnDpLy3rHq8kWv2xU6tZcB1nM4sE9aG7fJ5rT8yK2pQw"; // @deployer_dan, confirmed
const STATE_DIR = path.join(process.cwd(), ".data-test");

async function clean(page: Page) {
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(FORBIDDEN);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.beforeAll(() => {
  fs.rmSync(STATE_DIR, { recursive: true, force: true });
});

test("/ is one page: counters, who gets exposed first, latest files, how it works, nominate", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Cases opened")).toBeVisible();
  await expect(page.getByText("Crimes found", { exact: true })).toBeVisible();
  await expect(page.getByText("Convictions", { exact: true })).toBeVisible();
  await expect(page.getByText("Agent watching", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Who gets exposed first" })).toBeVisible();
  await expect(page.locator(".gtext").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Vote" })).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "Latest files" })).toBeVisible();
  await expect(page.locator("a.file")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Put a name on the block" })).toBeVisible();
  await clean(page);
});

test("/cases searches by $symbol, @handle and CA and filters by severity", async ({ page }) => {
  await page.goto("/cases");
  await expect(page.getByRole("heading", { name: "Case archive" })).toBeVisible();
  const all = await page.locator("a.file").count();
  expect(all).toBeGreaterThan(0);
  const first = (await page.locator("a.file").first().getAttribute("href"))!;
  const c = await (await page.request.get(`/api${first}`)).json();

  await page.goto(`/cases?q=$${c.token.symbol}`);
  await expect(page.locator("a.file").first()).toContainText(`$${c.token.symbol}`);
  await page.goto(`/cases?q=${encodeURIComponent(c.subjects[0])}`);
  await expect(page.locator("a.file").first()).toContainText(c.subjects[0]);
  await page.goto(`/cases?q=${c.token.mint}`);
  await expect(page.locator("a.file")).toHaveCount(1);
  await page.goto("/cases?severity=critical");
  for (const t of await page.locator("a.file").allInnerTexts()) expect(t).toMatch(/CRITICAL/);
  await page.goto("/cases?q=nothing-matches-this");
  await expect(page.getByText("Nothing on file.")).toBeVisible();
  await clean(page);
});

test("/cases/[n] has the PNG, findings, evidence links, money trail, narrative, CSV and og:image", async ({ page }) => {
  await page.goto("/cases/1");
  await expect(page.locator('img[alt^="Case file 0001"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Findings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evidence" })).toBeVisible();
  await expect(page.locator('table.data a[href^="https://solscan.io/"]').first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Money trail" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Narrative" })).toBeVisible();
  const og = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(og).toMatch(/\/cases\/1\/card\.png$/);
  const png = await page.request.get("/cases/1/card.png");
  expect(png.status()).toBe(200);
  expect(png.headers()["content-type"]).toBe("image/png");
  const csv = await page.request.get("/cases/1/evidence.csv");
  expect(csv.status()).toBe(200);
  expect((await csv.text()).split("\r\n")[0]).toBe("case,n,at,kind,ref,wallet,amount,note,explorer");
  expect((await page.request.get("/cases/9999")).status()).toBe(404);
  await clean(page);
});

test("/persons lists handles only", async ({ page }) => {
  await page.goto("/persons");
  await expect(page.getByRole("heading", { name: "Persons on the record" })).toBeVisible();
  const handles = await page.locator("table.data tbody td:first-child").allInnerTexts();
  expect(handles.length).toBeGreaterThan(0);
  for (const h of handles) expect(h.trim()).toMatch(/^@[a-z0-9_.]+$/);
  await clean(page);
});

test("/persons/[handle] shows rollup, wallets with tier + source, tokens and Dispute", async ({ page }) => {
  await page.goto("/persons/deployer_dan");
  await expect(page.getByRole("heading", { name: "@deployer_dan", exact: true })).toBeVisible();
  await expect(page.getByText("Wallets on record")).toBeVisible();
  await expect(page.getByText("CONFIRMED")).toBeVisible();
  await expect(page.locator('a[href^="https://x.com/deployer_dan"]').first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Dispute" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tokens" })).toBeVisible();
  // @rug_rachel has no wallets in the registry: nothing may be shown
  await page.goto("/persons/rug_rachel");
  await expect(page.getByText("None.").first()).toBeVisible();
  expect((await page.request.get("/persons/nobody_here")).status()).toBe(404);
  await clean(page);
});

test("/ballot has four options and history; signed votes are one per wallet", async ({ page, request }) => {
  await page.goto("/ballot");
  await expect(page.getByRole("heading", { name: "The ballot" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Vote" })).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await clean(page);

  const { ballot } = await (await request.get("/api/ballot")).json();
  expect(ballot.options).toHaveLength(4);
  const kp = nacl.sign.keyPair();
  const wallet = bs58.encode(kp.publicKey);
  const sign = (m: string) => bs58.encode(nacl.sign.detached(new TextEncoder().encode(m), kp.secretKey));
  const option = ballot.options[0].key;
  const msg = `CRIME ballot ${ballot.id} vote ${option}`;
  const ok = await request.post("/api/vote", { data: { ballot: ballot.id, option, wallet, signature: sign(msg) } });
  expect(ok.status()).toBe(200);
  expect((await ok.json()).tally[option]).toBeGreaterThanOrEqual(1);
  const dup = await request.post("/api/vote", { data: { ballot: ballot.id, option, wallet, signature: sign(msg) } });
  expect(dup.status()).toBe(409);
  const bad = await request.post("/api/vote", { data: { ballot: ballot.id, option, wallet, signature: sign("other") } });
  expect(bad.status()).toBe(401);
});

test("/stamp renders the canvas and controls", async ({ page }) => {
  await page.goto("/stamp");
  await expect(page.getByRole("heading", { name: "Stamp it" })).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PNG" })).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(1);
  await clean(page);
});

test("/embed documents the iframe and /embed/counter is 600×160", async ({ page }) => {
  await page.goto("/embed");
  await expect(page.getByRole("heading", { name: "Embed the counter" })).toBeVisible();
  await expect(page.getByText("GET /api/stats")).toBeVisible();
  await expect(page.locator("iframe")).toHaveAttribute("width", "600");
  await clean(page);
  await page.goto("/embed/counter");
  await expect(page.getByText("Cases opened")).toBeVisible();
  const r = await page.request.get("/embed/counter");
  expect(r.headers()["content-security-policy"]).toContain("frame-ancestors *");
});

test("/rules carries the rules and how to dispute, without the forbidden word", async ({ page }) => {
  await page.goto("/rules");
  await expect(page.getByRole("heading", { name: "Rules of engagement" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How to dispute" })).toBeVisible();
  await clean(page);
});

test("/nominate shows the board and the form", async ({ page, request }) => {
  await page.goto("/nominate");
  await expect(page.getByRole("heading", { name: "The board" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nominate" })).toBeVisible();
  await clean(page);
  const kp = nacl.sign.keyPair();
  const wallet = bs58.encode(kp.publicKey);
  const sign = (m: string) => bs58.encode(nacl.sign.detached(new TextEncoder().encode(m), kp.secretKey));
  const ok = await request.post("/api/nominate", { data: { handle: "@some_kol", wallet, signature: sign("CRIME nominate @some_kol"), note: "shilled and sold" } });
  expect(ok.status()).toBe(200);
  const dup = await request.post("/api/nominate", { data: { handle: "@some_kol", wallet, signature: sign("CRIME nominate @some_kol") } });
  expect(dup.status()).toBe(409);
  const board = await (await request.get("/api/nominate")).json();
  expect(board.board[0].handle).toBe("@some_kol");
});

test("/about explains the project without the forbidden word", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: /opens a case every hour/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "The rules" })).toBeVisible();
  await clean(page);
});

test("/admin asks for the password, then builds a ballot and lists disputes", async ({ page, request }) => {
  await page.goto("/admin");
  await expect(page.getByLabel("Password")).toBeVisible();
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Wrong password");
  await page.getByLabel("Password").fill("smoke-test");
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page.getByRole("heading", { name: "This hour's ballot" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Disputes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Attribution leads" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Build ballot/ })).toBeVisible();
  await clean(page);
  expect((await request.post("/api/admin/ballot", { data: { keys: [] } })).status()).toBe(401);
});

test("API: stats, cases, persons, ballot are JSON and never carry the forbidden word", async ({ request }) => {
  for (const p of ["/api/stats", "/api/cases", "/api/cases/1", "/api/persons/deployer_dan", "/api/ballot?history=1"]) {
    const r = await request.get(p);
    expect(r.status(), p).toBe(200);
    expect(r.headers()["content-type"]).toContain("application/json");
    expect(await r.text()).not.toMatch(FORBIDDEN);
  }
  const stats = await (await request.get("/api/stats")).json();
  expect(stats.convictions).toBe(0);
  const feed = await request.get("/feed.xml");
  expect(feed.status()).toBe(200);
  expect(await feed.text()).toContain("<feed");
  expect(stats.cases_opened).toBeGreaterThan(0);
});

test("a signed dispute hides the wallet everywhere; a bad signature does nothing", async ({ page, request }) => {
  const before = await (await request.get("/api/persons/deployer_dan")).json();
  expect(before.walletsOnRecord.map((w: { address: string }) => w.address)).toContain(REGISTRY_WALLET);
  const kp = nacl.sign.keyPair();
  const bad = await request.post("/api/dispute", {
    data: { wallet: REGISTRY_WALLET, signature: bs58.encode(nacl.sign.detached(new TextEncoder().encode(`CRIME dispute ${REGISTRY_WALLET}`), kp.secretKey)) },
  });
  expect(bad.status()).toBe(401);

  // The registry key is not ours, so file the dispute the way the store would after a valid signature.
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(path.join(STATE_DIR, "disputes.json"), JSON.stringify([{ wallet: REGISTRY_WALLET, at: new Date().toISOString(), status: "open" }]));
  try {
    const after = await (await request.get("/api/persons/deployer_dan")).json();
    expect(after.walletsOnRecord.map((w: { address: string }) => w.address)).not.toContain(REGISTRY_WALLET);
    await page.goto("/persons/deployer_dan");
    expect(await page.content()).not.toContain(REGISTRY_WALLET);
    const cases = await (await request.get("/api/cases?q=%40deployer_dan")).json();
    for (const c of cases.cases) {
      const full = await (await request.get(`/api/cases/${c.n}`)).json();
      expect(JSON.stringify(full)).not.toContain(REGISTRY_WALLET);
      await page.goto(`/cases/${c.n}`);
      expect(await page.content()).not.toContain(REGISTRY_WALLET);
      expect((await (await request.get(`/cases/${c.n}/evidence.csv`)).text())).not.toContain(REGISTRY_WALLET);
    }
  } finally {
    fs.rmSync(path.join(STATE_DIR, "disputes.json"), { force: true });
  }
  // A real signed dispute from the wallet itself returns "Noted."
  const own = bs58.encode(kp.publicKey);
  const r = await request.post("/api/dispute", {
    data: { wallet: own, signature: bs58.encode(nacl.sign.detached(new TextEncoder().encode(`CRIME dispute ${own}`), kp.secretKey)) },
  });
  expect(r.status()).toBe(200);
  expect((await r.json()).message).toBe("Noted.");
});
