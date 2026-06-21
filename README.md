# 本地知识库问答工具

一个面向本地运行的知识库问答项目。当前实现为：

- 后端：`FastAPI + SQLAlchemy + SQLite`
- 前端：`React + Vite + TypeScript`
- 检索：本地分块 + `ChromaDB` 向量检索
- 模型：本地 `Ollama + Qwen2.5`
- 存储：本地 `storage/` 目录

项目目标是让用户在本地创建知识库、导入文件和网页链接、进行带来源的连续问答，并通过可视化前端完成检索、核对、导出和日常管理。

## 当前已实现能力

### 知识库与分类

- 知识库创建、列表、编辑、删除
- 知识库分类创建、编辑、删除、置顶
- 分类与知识库多选、批量加入分类、移出分类、批量删除
- 最近使用知识库展示
- 知识库与分类前端 `localStorage` 持久化

### 文件与网页导入

- 批量上传本地文件
- 批量导入网页链接
- 上传后自动解析
- 文件按知识库目录保存，保留原始文件名
- 支持打开原始文件、下载文件、删除文件
- 文件右键继续解析
- 文件批量删除、批量加入其他知识库
- 文件上传时间展示
- 文件悬浮时右侧摘要联动显示
- 右侧文档摘要随悬浮文件实时切换

### 当前支持的解析类型

- `pdf`
- `docx`
- `pptx`
- `xls`
- `xlsx`
- `csv`
- `png`
- `jpg`
- `jpeg`
- 网页链接正文抓取

### OCR 与文档处理

- 图片 OCR
- 旧版 `.xls` 解析
- 文档自动分块
- 文档摘要生成
- 文件解析状态中心
- 知识库重新索引

### 问答与会话

- 单知识库问答
- 多知识库联合问答
- 连续多轮问答
- 会话自动创建
- 会话重命名、清空、删除
- 跨会话搜索问答记录
- 主题模糊检索 + 主体精准约束
- 回答带来源引用与命中片段高亮
- 来源弹窗打开原始文件或网页
- 回答中“正在回答，请等待”提示
- 回答生成中暂时隐藏“提问”按钮，完成后自动恢复

### 导出与分享

- 回答复制
- Markdown 导出
- DOCX 导出
- 回答分享长图下载
- 本地分享码打开答案

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

### 本地模型

- `Ollama`
- `Qwen2.5-7B-Instruct`
- `Qwen2.5-14B-Instruct`

## 项目结构

```text
apps/
  api/
    app/
      core/             配置、数据库、路径
      models/           数据模型
      repositories/     数据访问层
      routers/          API 路由
      schemas/          请求/响应模型
      services/         文档解析、问答、导出、向量检索、Qwen 调用
  web/
    src/
      App.tsx           主界面与核心交互
      styles.css        主样式
scripts/
  setup/                初始化脚本
  dev/                  开发启动脚本
  validate_*.py         校验脚本
storage/
  app.db                SQLite 数据库
  chroma/               Chroma 向量数据
  files/                上传文件目录
  exports/              导出目录
  logs/                 日志目录
Step-1.md ~ Step-11.md
Step-Qwen-1.md ~ Step-Qwen-7.md
design6.13v2130.md
design for Qwen2.5.md
QA_History.md
```

## 环境要求

- macOS 或 Windows
- Node.js `20+`
- npm `10+`
- Python `3.9+`
- 本地可运行 `Ollama`

## 安装

### 后端

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 前端

```bash
cd apps/web
npm install
```

### 一键初始化

macOS：

```bash
bash scripts/setup/bootstrap_mac.sh
```

Windows：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup/bootstrap_windows.ps1
```

## 本地模型准备

默认使用 `Ollama`。

macOS 示例：

```bash
brew install ollama
brew services start ollama
ollama pull qwen2.5:7b-instruct
```

如需切换到 `14B`：

```bash
ollama pull qwen2.5:14b-instruct
```

## 启动方式

### 分别启动

#### 启动后端

默认 `7B`：

```bash
cd apps/api
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

切换 `14B`：

```bash
cd apps/api
source .venv/bin/activate
export LOCAL_KB_LLM_MODEL_NAME=qwen2.5:14b-instruct
export LOCAL_KB_MODEL_CONFIG_NAME=ollama-qwen2.5-14b-default
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Windows PowerShell 示例：

```powershell
cd apps/api
.venv\Scripts\Activate.ps1
$env:LOCAL_KB_LLM_MODEL_NAME="qwen2.5:14b-instruct"
$env:LOCAL_KB_MODEL_CONFIG_NAME="ollama-qwen2.5-14b-default"
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

前端会自动尝试连接：

- `http://当前域名:8000`
- `http://127.0.0.1:8000`
- `http://localhost:8000`

### 一键启动

macOS：

```bash
bash scripts/dev/start_mac.sh
```

Windows：

```bat
scripts\dev\start_windows.bat
```

## 当前前端交互形态

- 左侧：知识库分类 + 未分类知识库导航 + 最近知识库 + 最近会话
- 右上：知识库列表 / 当前知识库文件列表
- 右上文件页：文件列表 + 右侧文档摘要卡片
- 右下：当前知识库问答窗口
- 回答结果：固定尺寸弹窗，支持复制、Markdown 导出、DOCX 导出、分享长图
- 顶部：更大的工具名称 + 知识卡片风格 logo
- 字体：标题衬线、正文无衬线、技术信息等宽

## 主要 API

### 系统

- `GET /system/health`
- `GET /system/config`
- `GET /system/llm-status`

### 知识库

- `POST /knowledge-bases`
- `GET /knowledge-bases`
- `GET /knowledge-bases/recent`
- `PATCH /knowledge-bases/{knowledge_base_id}`
- `DELETE /knowledge-bases/{knowledge_base_id}`
- `POST /knowledge-bases/{knowledge_base_id}/reindex`

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

### 会话

- `POST /chat/sessions`
- `GET /chat/sessions`
- `GET /chat/sessions/{session_id}`
- `POST /chat/sessions/{session_id}/rename`
- `POST /chat/sessions/{session_id}/clear`
- `DELETE /chat/sessions/{session_id}`

### 问答

- `POST /qa/ask`

### 导出

- `POST /export/markdown`
- `POST /export/docx`
- `GET /export/{export_id}`
- `GET /export/{export_id}/download`

## 存储说明

项目运行后，核心数据默认存放在 `storage/`：

- [storage/app.db](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/storage/app.db)
- [storage/chroma](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/storage/chroma)
- [storage/files](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/storage/files)
- [storage/exports](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/storage/exports)
- [storage/logs](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/storage/logs)

前端本地缓存：

- 知识库分类：`local-kb-categories-v1`
- 知识库缓存：`local-kb-knowledge-bases-v1`
- 分享数据：`local-kb-share-payloads`

说明：

- 前端重启后，知识库分类与知识库列表会优先从 `localStorage` 恢复
- 真实文档、索引、数据库和会话历史以后端 `storage/` 为准

## 校验脚本

当前仓库包含这些验证脚本：

- `scripts/validate_step4.py`
- `scripts/validate_step5.py`
- `scripts/validate_step5_regressions.py`
- `scripts/validate_step6.py`
- `scripts/validate_document_actions.py`
- `scripts/validate_step7.py`
- `scripts/validate_step8.py`

示例：

```bash
PYTHONPATH=apps/api ./apps/api/.venv/bin/python scripts/validate_step7.py
```

## 已知限制

- `doc`、音频、视频尚未完成真实解析链路
- 分类持久化仍在前端 `localStorage`，还不是后端数据库
- 分享能力当前以本地长图和本地分享码为主，不是线上分享系统
- 某些旧数据库记录如果对应本地文件已丢失，重新解析或打开原文件会失败

## 推荐后续演进

1. 把分类从前端 `localStorage` 迁移到后端数据库
2. 补齐 `doc`、音频、视频解析链路
3. 增加更细粒度的批量操作反馈与撤销
4. 增强网页抓取的稳定性与反爬兼容
5. 增加更完整的权限、同步与多端能力

## 相关文档

- [design6.13v2130.md](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/design6.13v2130.md)
- [design6.12v1715.md](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/design6.12v1715.md)
- [design for Qwen2.5.md](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/design%20for%20Qwen2.5.md)
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
- [Step-Qwen-1.md](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/Step-Qwen-1.md)
- [Step-Qwen-2.md](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/Step-Qwen-2.md)
- [Step-Qwen-3.md](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/Step-Qwen-3.md)
- [Step-Qwen-4.md](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/Step-Qwen-4.md)
- [Step-Qwen-5.md](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/Step-Qwen-5.md)
- [Step-Qwen-6.md](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/Step-Qwen-6.md)
- [Step-Qwen-7.md](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/Step-Qwen-7.md)
- [QA_History.md](/Users/ningmeng/Desktop/cd%20~/Vibe工作流/QA_History.md)
