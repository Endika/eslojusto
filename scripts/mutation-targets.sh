#!/usr/bin/env bash
# Comma-separated logic files a PR must leave without surviving mutants: every changed
# source file plus the source file behind every changed test. Components, page scripts,
# copy, translations and prose are covered by the e2e and copy tests instead and stay out.
set -euo pipefail
base="$1"
git diff --name-only --diff-filter=AMR "$base"...HEAD -- src tests |
  while read -r f; do
    case "$f" in
      tests/*.test.ts | tests/*.test.tsx)
        src="src/${f#tests/}"
        src="${src%.test.ts*}"
        for ext in .ts .tsx; do [ -f "$src$ext" ] && echo "$src$ext"; done
        ;;
      *) echo "$f" ;;
    esac
  done |
  grep -E '^src/.*\.tsx?$' |
  grep -vE '\.d\.ts$|^src/(components|content|i18n|layouts|pages|prose|scripts|styles|views)/' |
  sort -u | paste -sd, -
