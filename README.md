# 本地知识库问答工具

一个面向本地运行的知识库问答项目，当前实现为：

- 后端：`FastAPI + SQLAlchemy`
- 前端：`React + Vite`
- 检索：本地文本切分 + `ChromaDB` 向量检索
- 存储：本地 `storage/` 目录

项目目标是让用户在本地创建知识库、上传文件或网页链接、进行带来源的问答，并通过可视化前端完成日常操作。

## 当前已实现能力

- 知识库 CRUD
- 知识库分类（前端本地持久化）
- 知识库本地缓存持久化（前端 `localStorage`）
- 文件上传与自动解析
- 批量上传本地文件
- 批量导入网页链接
- 支持打开原始文件、下载文件、删除文件
- 支持文件在知识库之间批量移动
- 支持图片 OCR
- 支持 `.xls`、`.xlsx`、`.csv`、`.pdf`、`.docx`、`.pptx`、图片等解析
- 文件悬浮预览
- 单知识库问答
- 问答结果带来源引用
- 主题模糊检索 + 主体精准约束
- 回答弹窗、复制答案、生成长图、生成思维导图
- 分类、知识库、文件的多选和批量操作

## 当前前端交互形态

- 左侧：知识库分类 + 未分类知识库导航
- 右上：知识库列表 / 当前知识库文件列表
- 右下：当前知识库问答窗口
- 文件页支持“框选模式”
  - 框选
  - 全选
  - 取消
  - 删除选中
  - 加入知识库

## 技术栈

### 前端

- `React 18`
- `TypeScript`
- `Vite`
- `react-router-dom`

### 后端

- `FastAPI`
- `Uvicorn`
- `SQLAlchemy`
- `python-multipart`

### 文档解析 / OCR / 检索

- `python-docx`
- `python-pptx`
- `openpyxl`
- `xlrd`
- `pypdf`
- `Pillow`
- `rapidocr-onnxruntime`
- `opencc-python-reimplemented`
- `chromadb`

## 项目结构

```text
apps/
  api/                  FastAPI 后端
    app/
      core/             配置、数据库、路径
      models/           数据模型
      repositories/     数据访问层
      routers/          API 路由
      schemas/          请求/响应模型
      services/         文档解析、网页导入、问答、向量检索
  web/                  React + Vite 前端
    src/
      App.tsx           主界面与核心交互
      styles.css        主样式
scripts/
  setup/                初始化脚本
  dev/                  开发启动脚本
  validate_*.py         各阶段校验脚本
storage/
  app.db                SQLite 数据库
  chroma/               Chroma 向量数据
  files/                上传后的文件
  exports/              导出目录
  logs/                 日志目录
Step-1.md ~ Step-11.md  分步骤实现文档
design6.13v2130.md      详细设计文档
QA_history.md           当前会话整理记录
```

## 环境要求

- macOS 或 Windows
- Node.js `20+`
- npm `10+`
- Python `3.9+`

## 安装

### 方式一：手动安装

#### 后端

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

#### 前端

```bash
cd apps/web
npm install
```

### 方式二：使用脚本

#### macOS

```bash
bash scripts/setup/bootstrap_mac.sh
```

#### Windows

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup/bootstrap_windows.ps1
```

## 启动方式

### 方式一：分别启动

#### 启动后端

```bash
cd apps/api
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

后端地址：

- `http://127.0.0.1:8000`
- 健康检查：`http://127.0.0.1:8000/system/health`
- 系统配置：`http://127.0.0.1:8000/system/config`

#### 启动前端

```bash
cd apps/web
npm run dev -- --host 127.0.0.1 --port 5173
```

前端地址：

- `http://127.0.0.1:5173`

说明：

- 前端会自动尝试连接：
  - `http://当前域名:8000`
  - `http://127.0.0.1:8000`
  - `http://localhost:8000`

### 方式二：macOS 一键启动

```bash
bash scripts/dev/start_mac.sh
```

说明：

- 脚本会启动后端 `127.0.0.1:8000`
- 再启动前端 `127.0.0.1:5173`

### 方式三：Windows 一键启动

```bat
scripts\dev\start_windows.bat
```

## 主要 API

### 系统

- `GET /system/health`
- `GET /system/config`

### 知识库

- `POST /knowledge-bases`
- `GET /knowledge-bases`
- `GET /knowledge-bases/recent`
- `PATCH /knowledge-bases/{knowledge_base_id}`
- `DELETE /knowledge-bases/{knowledge_base_id}`

### 文档

- `GET /documents`
- `GET /documents/{document_id}`
- `POST /documents/upload`
- `POST /documents/import-url`
- `POST /documents/import-urls`
- `POST /documents/import-links`
- `POST /documents/move`
- `GET /documents/{document_id}/open`
- `POST /documents/{document_id}/open-local`
- `GET /documents/{document_id}/download`
- `DELETE /documents/{document_id}`
- `POST /documents/{document_id}/index`
- `POST /documents/{document_id}/retry-parse`

### 问答

- `POST /qa/ask`

## 当前支持的文件类型

- `pdf`
- `docx`
- `pptx`
- `xls`
- `xlsx`
- `csv`
- `png`
- `jpg`
- `jpeg`
- 网页链接（抓取网页正文）

说明：

- 音频、视频、`doc` 目前还没有在当前代码里真正实现解析链路
- 当前 README 只写已经在代码中落地的能力

## 存储说明

项目运行后，核心数据默认存放在 `storage/`：

- [storage/app.db](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/storage/app.db)
  - SQLite 主数据库
- [storage/chroma](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/storage/chroma)
  - 本地向量索引
- [storage/files](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/storage/files)
  - 上传后的文件，按知识库名称分目录保存
- [storage/exports](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/storage/exports)
  - 导出目录
- [storage/logs](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/storage/logs)
  - 日志目录

前端本地缓存：

- 知识库分类：`local-kb-categories-v1`
- 知识库缓存：`local-kb-knowledge-bases-v1`
- 分享数据：`local-kb-share-payloads`

说明：

- 即使前端重启，知识库分类和知识库列表也会优先从 `localStorage` 恢复
- 真实文档、索引和数据库仍以后端 `storage/` 为准

## 校验脚本

项目包含多份验证脚本，可用于回归测试：

- `scripts/validate_step4.py`
- `scripts/validate_step5.py`
- `scripts/validate_step5_regressions.py`
- `scripts/validate_step6.py`
- `scripts/validate_document_actions.py`
- `scripts/validate_step7.py`

例如：

```bash
PYTHONPATH=apps/api ./apps/api/.venv/bin/python scripts/validate_step7.py
```

当前 `validate_step7.py` 重点覆盖：

- 同问不同库不串库
- 问答结果带来源
- 无命中时返回受限答案
- `matched_documents` 与 `citations` 归属正确
- 主题级模糊检索
- 主体精准约束
- 机构主体识别约束

## 已知限制

- 当前问答接口是“单轮问答”，没有真正的会话级多轮上下文管理
- 分类持久化在前端 `localStorage`，不是后端数据库
- 知识库列表也做了前端缓存，但真实状态仍以后端为准
- 音频、视频、`doc` 尚未完成真实解析实现
- 后端根页面里展示的前端链接仍写成了 `5177`，而当前 Vite 默认端口配置是 `5173`
- 分享能力目前主要是本地导出长图和思维导图，不是完整线上分享系统

## 推荐开发顺序

如果你继续在当前项目上演进，建议优先处理：

1. 把分类从前端 `localStorage` 迁移到后端数据库
2. 增加真正的多轮会话问答
3. 为音频、视频、`doc` 增加解析链路
4. 增加 Markdown / DOCX 导出
5. 增加批量操作后的更细粒度反馈与撤销能力

## 相关文档

- [design6.13v2130.md](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/design6.13v2130.md)
- [design6.12v1715.md](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/design6.12v1715.md)
- [Step-1.md](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/Step-1.md)
- [Step-2.md](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/Step-2.md)
- [Step-3.md](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/Step-3.md)
- [Step-4.md](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/Step-4.md)
- [Step-5.md](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/Step-5.md)
- [Step-6.md](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/Step-6.md)
- [Step-7.md](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/Step-7.md)
- [Step-8.md](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/Step-8.md)
- [Step-9.md](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/Step-9.md)
- [Step-10.md](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/Step-10.md)
- [Step-11.md](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/Step-11.md)
- [QA_history.md](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/QA_history.md)
