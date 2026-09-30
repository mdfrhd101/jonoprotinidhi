#!/usr/bin/env bash
# Reseed the dev database (so every account is un-enrolled) and run the browser smoke test.
# Needs: MongoDB running, `npm run dev:api` and `npm run dev:admin` already started.
set -e
cd "$(dirname "$0")/.."
( cd apps/api && SEED_RESET=1 npm run seed --silent | tail -2 )
PYTHONIOENCODING=utf-8 python e2e/smoke.py "$@"
