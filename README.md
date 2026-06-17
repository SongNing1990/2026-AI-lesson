# 本地知识库问答工具

基于 `design6.13v2130.md` 的第一阶段项目骨架。

## 环境要求

- Node.js 20+
- npm 10+
- Python 3.9+

## 项目结构

```text
apps/
  web/    React + Vite 前端
  api/    FastAPI 后端
storage/  本地运行时目录
scripts/  启动与安装脚本
```

## 前端启动

```bash
cd apps/web
npm install
npm run dev
```

默认地址：

- `http://localhost:5173`

## 后端启动

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

默认地址：

- `http://localhost:8000`
- 健康检查：`http://localhost:8000/system/health`

## 一键脚本

- macOS: `scripts/dev/start_mac.sh`
- Windows: `scripts/dev/start_windows.bat`

## 当前阶段说明

当前仅完成项目骨架、基础健康检查接口与开发目录结构，不包含业务功能。
