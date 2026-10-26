#!/usr/bin/env bash
# The launch, in phases. Nothing here runs on its own; a human says which phase.
#
#   scripts/launch.sh prepare   back to zero, the first poll on the record as won by Kimchi, pushed
#   scripts/launch.sh curtain   the curtain comes down on crime.tech (Vercel env), and the site redeploys
#   scripts/launch.sh run       the hour-long investigation of @kimchi1x, live on the site
#   scripts/launch.sh finish    after the run: the case, the card, the poll record and the status committed and pushed
#   scripts/launch.sh go        prepare, curtain, run, finish, in that order
#
# Needs: .env (HELIUS, ARKHAM, XAI, X_BEARER_TOKEN), VERCEL_TOKEN in the environment for `curtain`.
set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT=prj_7tOdFc4u42jjXORKXWRpOJAzSB0Y
TEAM=team_71vnTSxu7dtPQ8YX42gwl9fa
SUBJECT="${SUBJECT:-@kimchi1x}"
POLL_ID="${POLL_ID:-2114755345792798981}"
BRANCH=$(git rev-parse --abbrev-ref HEAD)

commit_push() {
  mkdir -p out
  git add -A -- data fixtures out
  if git diff --cached --quiet; then echo "nothing to commit"; return 0; fi
  git commit -q -m "$1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NuQJBQKc9AkqdfqJh5SMj7"
  git pull -q --rebase --autostash origin "$BRANCH"
  git push origin "$BRANCH" 2>&1 | tail -1
}

no_run_in_progress() {
  if pgrep -f 'src/investigate.ts' >/dev/null; then
    echo "a run is in progress; stop it first:"; pgrep -af 'src/investigate.ts'; exit 1
  fi
}

record_poll() {
  # the first poll, as it stood when it closed, with the case once there is one
  node --input-type=commonjs -e "
    const fs = require('node:fs');
    const f = 'data/polls.json';
    const d = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { updated_at: '', polls: [] };
    const caseN = process.argv[1] ? Number(process.argv[1]) : undefined;
    const rec = {
      id: '$POLL_ID', url: 'https://x.com/crimeislegalpf/status/$POLL_ID',
      opened_at: '2026-10-26T16:25:39Z', closes_at: '2026-10-26T16:35:39Z',
      options: [{ label: 'Alon', votes: 6, subject: '@a1lon9' }, { label: 'Kimchi', votes: 57, subject: '@kimchi1x' }, { label: 'PoorGoat', votes: 2, subject: '@poorgoat_' }, { label: 'Insentos', votes: 1, subject: '@insentos' }],
      total: 66, winner: 'Kimchi', ...(caseN ? { case_n: caseN } : {}),
      message: process.argv[2] || (caseN ? 'Investigated.' : 'Won the poll. Under investigation.'), processed_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    };
    d.polls = [...d.polls.filter((p) => p.id !== rec.id), rec];
    d.updated_at = rec.processed_at;
    fs.writeFileSync(f, JSON.stringify(d, null, 2) + '\n');
    console.log('poll recorded', caseN ? 'with case ' + caseN : 'without a case');
  " "${1:-}" "${2:-}"
}

prepare() {
  PROGRESS_PUSH=on npm run -s reset
  record_poll
  node --input-type=commonjs -e "
    const fs = require('node:fs');
    const s = JSON.parse(fs.readFileSync('data/status.json', 'utf8'));
    s.message = 'Kimchi won the poll. The file is being written.';
    fs.writeFileSync('data/status.json', JSON.stringify(s, null, 2) + '\n');
  "
  commit_push "Back to zero; the first poll on the record"
  echo "prepared: zero cases, the poll on the record, the feed idle"
}

curtain() {
  : "${VERCEL_TOKEN:?VERCEL_TOKEN is needed to lift the curtain}"
  local id
  id=$(curl -s "https://api.vercel.com/v9/projects/$PROJECT/env?teamId=$TEAM" -H "Authorization: Bearer $VERCEL_TOKEN" | node -e "
    let s=''; process.stdin.on('data', (d) => (s += d)).on('end', () => { const e = JSON.parse(s).envs.find((x) => x.key === 'COMING_SOON_HOSTS'); console.log(e ? e.id : ''); });")
  if [ -n "$id" ]; then
    curl -s -X DELETE "https://api.vercel.com/v9/projects/$PROJECT/env/$id?teamId=$TEAM" -H "Authorization: Bearer $VERCEL_TOKEN" > /dev/null
    echo "curtain: COMING_SOON_HOSTS removed"
  else
    echo "curtain: already down"
  fi
  # a redeploy of the current head, so the new environment is served
  local sha
  sha=$(git rev-parse HEAD)
  curl -s -X POST "https://api.vercel.com/v13/deployments?teamId=$TEAM&forceNew=1" -H "Authorization: Bearer $VERCEL_TOKEN" -H "content-type: application/json" \
    -d "{\"name\":\"crime\",\"project\":\"$PROJECT\",\"target\":\"production\",\"gitSource\":{\"type\":\"github\",\"repoId\":\"${VERCEL_REPO_ID:-1298492421}\",\"ref\":\"$BRANCH\",\"sha\":\"$sha\"}}" | node -e "
    let s=''; process.stdin.on('data', (d) => (s += d)).on('end', () => { const j = JSON.parse(s); console.log('redeploy:', j.id ? j.id + ' ' + j.readyState : JSON.stringify(j.error || j).slice(0, 200)); });"
}

run() {
  mkdir -p logs
  PROGRESS_PUSH=on npm run -s investigate -- --subject "$SUBJECT" 2>&1 | tee "logs/run-$(date -u +%Y%m%dT%H%M%SZ).log"
}

finish() {
  no_run_in_progress
  local n
  n=$(node --input-type=commonjs -e "const d = require('./data/cases.json'); const c = d.cases.filter((x) => (x.subjects || []).map((s) => s.toLowerCase()).includes('$SUBJECT'.toLowerCase())).sort((a, b) => b.n - a.n)[0]; console.log(c ? c.n : '');")
  # the status says what happened, and promises nothing: the next case comes from the next poll
  node --input-type=commonjs -e "
    const fs = require('node:fs');
    const s = JSON.parse(fs.readFileSync('data/status.json', 'utf8'));
    const n = '$n';
    s.state = 'idle'; s.mode = 'live'; s.next_run_at = null;
    if (n) { s.last_case = Number(n); s.message = 'Case ' + n.padStart(4, '0') + ' opened on $SUBJECT. The next poll decides who is next.'; }
    else s.message = '$SUBJECT read in full. Nothing met the bar for a file. The next poll decides who is next.';
    fs.writeFileSync('data/status.json', JSON.stringify(s, null, 2) + '\n');
  "
  if [ -n "$n" ]; then record_poll "$n"; else record_poll "" "Read in full. Nothing met the bar for a file."; fi
  commit_push "${n:+Case $n: }the first file, the poll settled"
  echo "finished: ${n:+case $n, }pushed"
}

case "${1:-}" in
  prepare) prepare ;;
  curtain) curtain ;;
  run) run ;;
  finish) finish ;;
  go) no_run_in_progress; prepare; curtain; if ! run; then echo "the run failed; read the log in logs/, then: scripts/launch.sh run"; exit 1; fi; finish ;;
  *) echo "usage: scripts/launch.sh prepare|curtain|run|finish|go"; exit 2 ;;
esac
