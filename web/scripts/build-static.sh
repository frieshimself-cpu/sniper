#!/usr/bin/env bash
# Static export for GitHub Pages. Every route handler is set aside for the build (the API,
# cards and CSVs are written as files by scripts/static-api.ts), as is /admin. Restored afterwards.
set -euo pipefail
cd "$(dirname "$0")/.."
ASIDE=".static-aside"
rm -rf "$ASIDE" out .next-static
mkdir -p "$ASIDE"
restore() {
  rm -f "app/(site)/cases/[n]/layout.tsx" "app/(site)/persons/[handle]/layout.tsx"
  [ -d "$ASIDE/persons-handle" ] && mv "$ASIDE/persons-handle" "app/(site)/persons/[handle]"
  [ -d "$ASIDE/cases-n" ] && mv "$ASIDE/cases-n" "app/(site)/cases/[n]"
  [ -d "$ASIDE/api" ] && rm -rf app/api && mv "$ASIDE/api" app/api
  [ -d "$ASIDE/cases" ] && rm -rf app/cases && mv "$ASIDE/cases" app/cases
  [ -d "$ASIDE/feed.xml" ] && rm -rf app/feed.xml && mv "$ASIDE/feed.xml" app/feed.xml
  [ -d "$ASIDE/admin" ] && rm -rf "app/(site)/admin" && mv "$ASIDE/admin" "app/(site)/admin"
  [ -d "$ASIDE/nominate" ] && rm -rf "app/(site)/nominate" && mv "$ASIDE/nominate" "app/(site)/nominate"
  rm -rf "$ASIDE" .next/types
}
trap restore EXIT
mv app/api "$ASIDE/api"
mv app/cases "$ASIDE/cases"
mv app/feed.xml "$ASIDE/feed.xml"
mv "app/(site)/admin" "$ASIDE/admin"
mv "app/(site)/nominate" "$ASIDE/nominate"
# An export needs at least one param per dynamic route. With none, the route is left out.
COUNTS=$(STATIC_EXPORT=1 NEXT_PUBLIC_STATIC=1 npx tsx scripts/count.ts)
CASES=${COUNTS%% *}; HANDLES=${COUNTS##* }
echo "export: $CASES cases, $HANDLES handles"
if [ "$CASES" -gt 0 ]; then cp scripts/static-layouts/cases.tsx "app/(site)/cases/[n]/layout.tsx"; else mv "app/(site)/cases/[n]" "$ASIDE/cases-n"; fi
if [ "$HANDLES" -gt 0 ]; then cp scripts/static-layouts/persons.tsx "app/(site)/persons/[handle]/layout.tsx"; else mv "app/(site)/persons/[handle]" "$ASIDE/persons-handle"; fi
STATIC_EXPORT=1 NEXT_PUBLIC_STATIC=1 npx next build
# with a custom distDir the export lands there; move it to out/ and add the API files
rm -rf out && mv .next-static out
STATIC_EXPORT=1 NEXT_PUBLIC_STATIC=1 npx tsx scripts/static-api.ts
touch out/.nojekyll
echo "static export in web/out ($(find out -type f | wc -l) files)"
echo "note: run \"npm run build\" again before \"npm run start\"; the export leaves its config in .next"
