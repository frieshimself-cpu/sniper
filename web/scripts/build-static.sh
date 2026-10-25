#!/usr/bin/env bash
# Static export for GitHub Pages. Every route handler is set aside for the build (the API,
# cards and CSVs are written as files by scripts/static-api.ts), as is /admin. Restored afterwards.
set -euo pipefail
cd "$(dirname "$0")/.."
ASIDE=".static-aside"
rm -rf "$ASIDE" out .next/dev .next/types
mkdir -p "$ASIDE"
restore() {
  rm -f "app/(site)/cases/[n]/layout.tsx" "app/(site)/persons/[handle]/layout.tsx"
  [ -d "$ASIDE/api" ] && rm -rf app/api && mv "$ASIDE/api" app/api
  [ -d "$ASIDE/cases" ] && rm -rf app/cases && mv "$ASIDE/cases" app/cases
  [ -d "$ASIDE/admin" ] && rm -rf "app/(site)/admin" && mv "$ASIDE/admin" "app/(site)/admin"
  rm -rf "$ASIDE"
}
trap restore EXIT
mv app/api "$ASIDE/api"
mv app/cases "$ASIDE/cases"
mv "app/(site)/admin" "$ASIDE/admin"
cp scripts/static-layouts/cases.tsx "app/(site)/cases/[n]/layout.tsx"
cp scripts/static-layouts/persons.tsx "app/(site)/persons/[handle]/layout.tsx"
STATIC_EXPORT=1 NEXT_PUBLIC_STATIC=1 npx next build
STATIC_EXPORT=1 NEXT_PUBLIC_STATIC=1 npx tsx scripts/static-api.ts
touch out/.nojekyll
echo "static export in web/out ($(find out -type f | wc -l) files)"
