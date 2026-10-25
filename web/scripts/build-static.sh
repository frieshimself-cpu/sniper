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
  [ -d "$ASIDE/api" ] && rm -rf app/api && mv "$ASIDE/api" app/api
  [ -d "$ASIDE/cases" ] && rm -rf app/cases && mv "$ASIDE/cases" app/cases
  [ -d "$ASIDE/feed.xml" ] && rm -rf app/feed.xml && mv "$ASIDE/feed.xml" app/feed.xml
  [ -d "$ASIDE/admin" ] && rm -rf "app/(site)/admin" && mv "$ASIDE/admin" "app/(site)/admin"
  rm -rf "$ASIDE" .next/types
}
trap restore EXIT
mv app/api "$ASIDE/api"
mv app/cases "$ASIDE/cases"
mv app/feed.xml "$ASIDE/feed.xml"
mv "app/(site)/admin" "$ASIDE/admin"
cp scripts/static-layouts/cases.tsx "app/(site)/cases/[n]/layout.tsx"
cp scripts/static-layouts/persons.tsx "app/(site)/persons/[handle]/layout.tsx"
STATIC_EXPORT=1 NEXT_PUBLIC_STATIC=1 npx next build
# with a custom distDir the export lands there; move it to out/ and add the API files
rm -rf out && mv .next-static out
STATIC_EXPORT=1 NEXT_PUBLIC_STATIC=1 npx tsx scripts/static-api.ts
touch out/.nojekyll
echo "static export in web/out ($(find out -type f | wc -l) files)"
