#!/bin/sh
# Corre todos los tests. Uso: sh tests/run.sh
set -e
fallos=0
for t in "$(dirname "$0")"/*.test.js; do
  echo "════ $(basename "$t") ════"
  node "$t" || fallos=1
done
[ $fallos -eq 0 ] && echo "\n✓ Todo verde" || { echo "\n✗ Hay tests fallando"; exit 1; }
