// Copies the agent's output (../data, ../out, ../fixtures) into web/agent-data so a Vercel build
// ships it with the serverless functions. Harmless elsewhere: the site reads ../ unless VERCEL is set.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "..");
const dest = path.resolve(process.cwd(), "agent-data");
fs.rmSync(dest, { recursive: true, force: true });
let n = 0;
for (const dir of ["data", "out", "fixtures"]) {
  const from = path.join(root, dir);
  if (!fs.existsSync(from)) continue;
  fs.mkdirSync(path.join(dest, dir), { recursive: true });
  for (const f of fs.readdirSync(from)) {
    if (!/\.(json|png)$/.test(f)) continue;
    fs.copyFileSync(path.join(from, f), path.join(dest, dir, f));
    n++;
  }
}
console.log(`agent-data: ${n} files`);
