#!/usr/bin/env bash
set -euo pipefail
# When Vercel Root Directory is "web", cwd is already web/.
if [[ -f vite.config.js ]]; then
  npm ci
else
  npm ci --prefix web
fi
