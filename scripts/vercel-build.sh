#!/usr/bin/env bash
set -euo pipefail
if [[ -f vite.config.js ]]; then
  npm run build
else
  npm run build --prefix web
fi
