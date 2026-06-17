@echo off
set ROOT_DIR=%~dp0\..\..

cd /d %ROOT_DIR%\apps\api
python -m venv .venv
call .venv\Scripts\activate
pip install -r requirements.txt
start cmd /k "call .venv\Scripts\activate && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

cd /d %ROOT_DIR%\apps\web
npm install
npm run dev -- --host 127.0.0.1 --port 5173
