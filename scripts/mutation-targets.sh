#!/usr/bin/env bash
# Comma-separated logic files a PR must leave without surviving mutants: every changed
# source file plus the source file behind every changed test. Components, page scripts,
# copy, translations and prose are covered by the e2e and copy tests instead and stay out,
# and so does any other file that touches the DOM: its pure logic lives in a module of its own.
set -euo pipefail
base="$1"
# A deleted test counts too: removing it can leave its source with surviving mutants.
git diff --name-only --diff-filter=AMRD "$base"...HEAD -- src tests |
  while read -r f; do
    case "$f" in
      tests/*.test.ts | tests/*.test.tsx)
        stem="src/${f#tests/}"
        stem="${stem%.test.ts*}"
        # Event.restore.test.ts belongs to Event.ts: drop dotted parts until a source exists.
        while :; do
          src=""
          for ext in .ts .tsx; do [ -f "$stem$ext" ] && src="$stem$ext"; done
          if [ -n "$src" ]; then echo "$src"; break; fi
          case "$(basename "$stem")" in *.*) stem="${stem%.*}" ;; *) break ;; esac
        done
        ;;
      *) [ -f "$f" ] && echo "$f" ;;
    esac
  done |
  grep -E '^src/.*\.tsx?$' |
  grep -vE '\.d\.ts$|^src/(components|content|i18n|layouts|pages|prose|scripts|styles|views)/' |
  while read -r f; do
    grep -qE 'document\.|querySelector|addEventListener|window\.' "$f" || echo "$f"
  done |
  sort -u | paste -sd, -
