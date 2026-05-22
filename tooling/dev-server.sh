#!/usr/bin/env sh
set -eu

REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
OPEN_COMMAND=${1:-"open -a 'Google Chrome' http://localhost:3333"}
PARENT_PID=$PPID

open_when_ready() {
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 \
    21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 \
    41 42 43 44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 59 60; do
    if curl -sf http://localhost:3333 >/dev/null 2>&1; then
      eval "$OPEN_COMMAND" >/dev/null 2>&1 || true
      return 0
    fi

    sleep 1
  done
}

cd "$REPO_ROOT/docs"

open_when_ready &
OPENER_PID=$!

mintlify dev --port 3333 --no-open &
SERVER_PID=$!

cleanup() {
  kill -TERM "$SERVER_PID" "$OPENER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}

trap cleanup INT TERM HUP EXIT

(
  while kill -0 "$PARENT_PID" 2>/dev/null; do
    sleep 1
  done

  cleanup
) &

wait "$SERVER_PID"
