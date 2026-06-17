#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

cd "$ROOT_DIR/apps/api"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

cd "$ROOT_DIR/apps/web"
npm install

echo "Bootstrap finished."
