#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

echo "[api] preparing virtual environment"
cd "$ROOT_DIR/apps/api"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

echo "[api] starting FastAPI on http://127.0.0.1:8000"
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 &
API_PID=$!

echo "[web] installing dependencies"
cd "$ROOT_DIR/apps/web"
npm install

echo "[web] starting Vite on http://127.0.0.1:5173"
npm run dev -- --host 127.0.0.1 --port 5173

trap 'kill $API_PID' EXIT
