# 不依赖 Tauri 的本地 Web 知识库问答工具方案

## Summary

可以，后续完全不需要把 “加 `Tauri` 桌面壳” 作为路线的一部分。我建议把这个产品明确定位成 **跨平台本地 Web 工具**，长期就是这种形态：在 Mac 和 Windows 上本机启动服务，用浏览器访问和使用，我也可以直接按这个方向帮你实现。

这个选择的好处是：
- 你不需要承担桌面应用打包、签名、安装器、系统权限、自动更新这些额外复杂度
- Mac 和 Windows 双端兼容成本更低
- 文件上传、知识库管理、检索问答、引用展示、Markdown/DOCX 导出都更适合 Web 交互
- 后续我实现时可以把重点放在“知识库质量”和“答案可追溯性”，而不是外壳

当前版本补充约束：
- 第一版正式纳入 `图片 OCR`、`批量上传`、`多轮追问`、`打开原始文件`、`来源高亮展示`
- 第一版正式纳入 `网页链接导入` 和 `批量上传网页链接`
- 这 5 项按“可用版”落地，不按完整版承诺

最终结论：
- **推荐形态**：本地 Web 工具
- **不推荐**：命令行工具、首版桌面原生应用、提前绑定 Tauri 路线
- **实现方向**：直接按“长期本地 Web”设计与开发

## Key Changes

### 1. 产品定义

产品是一个单用户、本地运行、跨平台的知识库问答工具。

核心体验：
- 用户创建一个或多个知识库
- 每个知识库内导入文件或网页链接
- 提问时勾选 1 个或多个知识库，限定本次检索边界
- 系统从所选知识库中检索相关片段
- 大模型基于检索内容生成答案
- 页面展示答案与来源
- 结果支持导出为 Markdown，DOCX 作为增强项

第一版明确不做：
- 登录
- 云同步
- 多用户协作
- 网络搜索增强
- 本地大模型
- 音频视频解析
- 语音输入/语音播报

### 2. 推荐技术栈

前端：
- `React + Vite`
- 路由用轻量方案即可
- UI 组件库选成熟、中文体验好的库，目标是开发效率，不做重设计系统

后端：
- `FastAPI`
- 负责文件上传、解析、索引、问答、导出

本地存储：
- 元数据：`SQLite`
- 原始文件：本地目录
- 向量索引：`Chroma`

文档解析：
- PDF：`PyMuPDF`
- DOCX：读取段落和表格文本
- PPTX：`python-pptx`
- Excel/CSV：`openpyxl` / `pandas`
- 网页链接：V1 支持公开网页正文抽取，转纯文本入库，并支持批量导入链接列表
- 图片：V1 支持 `png/jpg/jpeg` 的 OCR，并将识别文本作为普通文本入库

模型层：
- Embedding：独立封装一个适配层
- 生成模型：独立封装一个聊天模型适配层
- 第一版走 API，不自部署模型
- 模型供应商不写死，接口保持可替换

导出：
- Markdown：Must have
- DOCX：Should have

### 3. 模块拆分

建议把系统拆成 7 个模块，后续实现时也按这个顺序推进：

1. 知识库管理
- 创建、重命名、删除知识库
- 维护知识库元数据
- 管理知识库对应的文件与索引目录

2. 文档导入与解析
- 文件上传
- 支持批量上传与拖拽多文件上传
- 支持单条网页链接导入与批量网页链接导入
- 按文件类型分发解析器
- 抽取纯文本和结构化位置信息
- 对网页执行正文抓取、标题提取和基础清洗
- 对 `png/jpg/jpeg` 执行 OCR，并将识别文本作为普通文档内容入库
- 记录解析状态与失败原因

3. 文本切片与索引
- 统一切片策略
- 保存片段、位置标签、文档归属
- 生成 embedding 并写入向量库

4. 检索与重排
- 只在用户选中的知识库范围内检索
- 返回相关片段、文档信息、位置标签
- V1 可先只做向量检索，不强制上重排模型

5. 问答生成
- 将问题与检索结果送入生成模型
- 强制要求答案只基于检索结果
- 如果证据不足，必须返回“未找到足够依据”
- 支持当前会话内多轮追问，但每轮仍重新检索，避免上下文漂移

6. 结果展示与导出
- 展示答案、来源、命中文档
- 在抽取文本预览中高亮命中片段
- 对本地文件提供“打开原始文件”入口
- 导出 Markdown
- DOCX 导出作为增强

7. 历史记录
- 保存提问、知识库范围、答案、时间
- 支持查看历史问答

### 4. 跨平台实现约束

必须从一开始按 Mac + Windows 一致性设计：
- 文件路径统一使用平台抽象，不手写分隔符
- 支持中文文件名、空格路径、长路径
- 不依赖仅在某一平台好装的工具链
- 不要求用户本地装数据库服务
- 不要求用户本地装模型服务

推荐数据目录：
- macOS：`~/Library/Application Support/YourApp/`
- Windows：`%AppData%\\YourApp\\`

统一子目录：
- `files/`
- `vector_store/`
- `exports/`
- `logs/`
- `app.db`

### 5. V1 功能优先级

Must have：
- 创建、重命名、删除知识库
- 批量上传 `PDF / DOCX / PPTX / Excel / CSV / PNG / JPG / JPEG`
- 上传单条网页链接与批量网页链接
- 文本抽取与图片 OCR
- 切片与索引
- 针对 1 个或多个知识库提问
- 多轮追问
- 返回带来源的答案
- 来源至少包含：知识库名、文件名、页码/工作表/段落
- 命中片段高亮展示
- 打开原始文件
- Markdown 导出
- 本地持久化
- 问答历史基础保存

Should have：
- DOCX 导出
- 文件解析状态页
- 文档摘要

Could have：
- 单文件内更精细的位置高亮
- 图片 OCR 结果校正
- 跨会话追问延续
- 原始文件定位增强

Won’t have now：
- 音频视频
- 语音
- 云同步
- 登录
- 权限系统
- 网络搜索
- 本地大模型
- 桌面原生外壳

### 6. 这 5 个新增 V1 功能的实现边界

- `图片 OCR`
  - V1 仅支持 `png/jpg/jpeg`
  - OCR 输出作为普通文本入库
  - 不承诺扫描 PDF OCR、表格还原、手写识别优化

- `批量上传`
  - 支持文件多选和拖拽多文件
  - 后台逐个解析并展示成功/失败状态
  - V1 不做复杂上传队列编排和断点续传

- `多轮追问`
  - 仅保留当前会话上下文
  - 每轮问题都基于当前会话摘要和最新问题重新检索
  - 提供“清空会话”入口

- `打开原始文件`
  - 仅支持本地导入文件
  - 通过系统默认程序打开原始文件
  - 网页链接来源不提供此能力

- `来源高亮展示`
  - V1 仅在系统抽取后的文本预览中高亮命中片段
  - 不承诺在原始 PDF、DOCX、PPTX 中做坐标级精准高亮
  - 目标是让用户快速核对证据，而不是做完整文档阅读器

- `网页链接导入`
  - V1 仅支持公开可访问网页
  - 支持单条输入和批量粘贴链接列表
  - 以正文抽取后的纯文本入库，不保证完整保留原网页排版
  - 不支持登录态网页、强反爬页面、复杂单页应用的完整渲染抓取

## Public Interfaces

核心对象：
- `KnowledgeBase`
  - `id`
  - `name`
  - `created_at`

- `Document`
  - `id`
  - `knowledge_base_id`
  - `name`
  - `type`
  - `source_type`
  - `storage_path`
  - `parse_status`
  - `parse_error`
  - `preview_text`
  - `source_url`

- `Chunk`
  - `id`
  - `document_id`
  - `knowledge_base_id`
  - `text`
  - `location_label`
  - `chunk_index`

- `ChatRecord`
  - `id`
  - `question`
  - `selected_kb_ids`
  - `answer_markdown`
  - `created_at`

核心接口：
- `POST /knowledge-bases`
- `GET /knowledge-bases`
- `PATCH /knowledge-bases/{id}`
- `DELETE /knowledge-bases/{id}`
- `POST /documents/upload`
- `POST /documents/import-url`
- `POST /documents/import-urls`
- `POST /documents/open`
- `GET /documents`
- `POST /documents/{id}/index`
- `POST /qa/ask`
- `GET /history`
- `POST /export/markdown`
- `POST /export/docx`

`/qa/ask` 输入：
- `question`
- `knowledge_base_ids[]`
- `top_k`
- `history_id`，V1 可为空
- `session_id`

`/qa/ask` 输出：
- `answer`
- `citations[]`
- `matched_documents[]`

引用对象至少包含：
- `knowledge_base_name`
- `document_name`
- `location_label`
- `snippet`
- `highlight_ranges`

## Test Plan

必须覆盖这些场景：
- Mac 和 Windows 都能完成首次启动
- 创建多个知识库后，文件不会串库
- 一次上传多个文件时，成功和失败状态分别可见
- 一次导入多个网页链接时，成功和失败状态分别可见
- PDF、DOCX、PPTX、Excel、CSV 均可解析
- PNG、JPG、JPEG 图片可完成 OCR 并参与检索
- 公开网页链接可抽取正文并参与检索
- 中文文档、中文路径、中文文件名正常处理
- 仅选择 A 知识库提问时，不得检索到 B 知识库内容
- 选择多个知识库提问时，答案来源标注正确
- 多轮追问时，上下文可延续，但每轮结果仍受知识库选择约束
- 表格内容可被检索到
- 文档解析失败时，状态和错误信息可见
- 无命中时返回“证据不足”，不得编造
- 来源片段在文本预览中能正确高亮
- 点击“打开原始文件”后，可用系统默认程序打开本地文件
- Markdown 导出内容与页面答案一致
- 删除知识库后，本地文件、数据库记录、向量索引一并清理
- 重启应用后，知识库、文档、历史记录仍存在

验收标准：
- 新用户在任一平台上都能在 10 分钟内完成首次安装并提问
- 不需要独立安装数据库或向量数据库服务
- 不需要本地部署大模型
- 问答结果必须带来源
- 第一版能稳定处理学习资料、课程讲义、论文笔记、项目文档这类常见文本型资料

## Assumptions

默认采用这些前提：
- 产品长期保持“本地 Web 工具”形态，不转 Tauri
- 第一版面向个人使用，但要求 Mac 和 Windows 都能运行
- 第一版优先把文本类知识问答做稳
- 图片 OCR 属于第一版正式范围，但只做静态图片可用版
- 网页链接导入属于第一版正式范围，但只做公开网页正文抓取可用版
- 音频、视频、语音能力暂不纳入第一版
- 模型使用外部 API，不自部署本地大模型

## Database Design

建议 V1 直接使用 `SQLite`，表结构保持简单但为批量上传、多轮追问和导出留好扩展位。

### 1. `knowledge_bases`

- `id` TEXT PRIMARY KEY
- `name` TEXT NOT NULL
- `description` TEXT NULL
- `color` TEXT NULL
- `created_at` DATETIME NOT NULL
- `updated_at` DATETIME NOT NULL
- `deleted_at` DATETIME NULL

约束与索引：
- `INDEX idx_kb_updated_at (updated_at)`
- `UNIQUE` 约束可不加在 `name`，允许重名但前端应提示风险

### 2. `documents`

- `id` TEXT PRIMARY KEY
- `knowledge_base_id` TEXT NOT NULL
- `name` TEXT NOT NULL
- `source_type` TEXT NOT NULL
  - `file`
  - `url`
- `file_type` TEXT NOT NULL
  - `pdf`
  - `docx`
  - `pptx`
  - `xlsx`
  - `csv`
  - `png`
  - `jpg`
  - `jpeg`
  - `html`
- `mime_type` TEXT NULL
- `source_url` TEXT NULL
- `original_path` TEXT NULL
- `storage_path` TEXT NOT NULL
- `file_size` INTEGER NULL
- `checksum` TEXT NULL
- `parse_status` TEXT NOT NULL
  - `pending`
  - `processing`
  - `done`
  - `failed`
- `parse_error` TEXT NULL
- `preview_text` TEXT NULL
- `page_count` INTEGER NULL
- `metadata_json` TEXT NULL
- `created_at` DATETIME NOT NULL
- `updated_at` DATETIME NOT NULL

约束与索引：
- `FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id)`
- `INDEX idx_documents_kb_status (knowledge_base_id, parse_status)`
- `INDEX idx_documents_checksum (checksum)`

### 3. `document_chunks`

- `id` TEXT PRIMARY KEY
- `document_id` TEXT NOT NULL
- `knowledge_base_id` TEXT NOT NULL
- `chunk_index` INTEGER NOT NULL
- `text` TEXT NOT NULL
- `token_count` INTEGER NULL
- `location_label` TEXT NOT NULL
- `page_number` INTEGER NULL
- `sheet_name` TEXT NULL
- `start_offset` INTEGER NULL
- `end_offset` INTEGER NULL
- `vector_id` TEXT NOT NULL
- `created_at` DATETIME NOT NULL

约束与索引：
- `FOREIGN KEY (document_id) REFERENCES documents(id)`
- `FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id)`
- `UNIQUE (document_id, chunk_index)`
- `UNIQUE (vector_id)`
- `INDEX idx_chunks_kb_doc (knowledge_base_id, document_id)`

### 4. `chat_sessions`

- `id` TEXT PRIMARY KEY
- `title` TEXT NULL
- `selected_kb_ids_json` TEXT NOT NULL
- `created_at` DATETIME NOT NULL
- `updated_at` DATETIME NOT NULL

说明：
- V1 不强行做复杂会话归档，直接把所选知识库 ID 列表以 JSON 保存即可

### 5. `chat_messages`

- `id` TEXT PRIMARY KEY
- `session_id` TEXT NOT NULL
- `role` TEXT NOT NULL
  - `user`
  - `assistant`
- `question_text` TEXT NULL
- `answer_markdown` TEXT NULL
- `citations_json` TEXT NULL
- `retrieval_snapshot_json` TEXT NULL
- `created_at` DATETIME NOT NULL

约束与索引：
- `FOREIGN KEY (session_id) REFERENCES chat_sessions(id)`
- `INDEX idx_messages_session_created (session_id, created_at)`

说明：
- 用户消息仅保存 `question_text`
- 助手消息保存 `answer_markdown`、引用和检索快照
- 多轮追问直接依赖 `chat_sessions + chat_messages`

### 6. `export_jobs`

- `id` TEXT PRIMARY KEY
- `session_id` TEXT NOT NULL
- `format` TEXT NOT NULL
  - `md`
  - `docx`
- `status` TEXT NOT NULL
  - `pending`
  - `done`
  - `failed`
- `output_path` TEXT NULL
- `error_message` TEXT NULL
- `created_at` DATETIME NOT NULL
- `finished_at` DATETIME NULL

约束与索引：
- `FOREIGN KEY (session_id) REFERENCES chat_sessions(id)`
- `INDEX idx_exports_session (session_id)`

### 7. `app_settings`

- `key` TEXT PRIMARY KEY
- `value` TEXT NOT NULL
- `updated_at` DATETIME NOT NULL

用途：
- 默认导出目录
- 最近使用的知识库
- OCR 开关
- 模型配置名称

### 8. 数据删除规则

- 删除知识库时，级联删除：
  - `documents`
  - `document_chunks`
  - 与该知识库相关但已失去上下文意义的会话可保留或软删；V1 建议保留会话，但在 UI 中提示原知识库已删除
- 删除单个文档时，必须同步删除：
  - 原始文件
  - 向量库中的对应 `vector_id`
  - `document_chunks`

## Project Structure

建议直接用前后端分离但同仓库的结构，避免一开始做过度工程。

```text
project-root/
  design6.12v1715.md
  apps/
    web/
      src/
        app/
        pages/
        components/
        features/
          knowledge-bases/
          documents/
          chat/
          exports/
        services/
        hooks/
        types/
      public/
      package.json
      vite.config.ts
    api/
      app/
        main.py
        core/
          config.py
          db.py
          paths.py
        models/
        schemas/
        routers/
          knowledge_bases.py
          documents.py
          chat.py
          exports.py
          system.py
        services/
          parsers/
          ocr/
          indexing/
          retrieval/
          llm/
          exporters/
        repositories/
        workers/
        utils/
      tests/
      requirements.txt
  storage/
    files/
    exports/
    logs/
  scripts/
    dev/
      start_mac.sh
      start_windows.bat
    setup/
      bootstrap_mac.sh
      bootstrap_windows.ps1
```

目录原则：
- `apps/web` 只负责交互，不直接碰本地文件系统
- `apps/api` 负责文件落盘、解析、索引、问答、导出
- `storage/` 只作为本地运行时目录；若后续要发给用户，改成系统应用数据目录

## API Design

V1 API 保持 REST 风格，重点覆盖知识库管理、文档处理、问答会话和导出。

### 1. 知识库

- `POST /knowledge-bases`
  - 请求：`name`, `description?`
  - 响应：知识库详情

- `GET /knowledge-bases`
  - 响应：知识库列表，附文档数、最后更新时间

- `PATCH /knowledge-bases/{id}`
  - 请求：`name?`, `description?`
  - 响应：更新后的知识库详情

- `DELETE /knowledge-bases/{id}`
  - 响应：删除结果

### 2. 文档

- `POST /documents/upload`
  - `multipart/form-data`
  - 字段：`knowledge_base_id`, `files[]`
  - 行为：支持批量上传，返回每个文件的接收结果

- `POST /documents/import-url`
  - 请求：`knowledge_base_id`, `url`
  - 行为：抓取正文并转成内部文档

- `POST /documents/import-urls`
  - 请求：`knowledge_base_id`, `urls[]`
  - 行为：批量抓取网页正文并分别转成内部文档，返回逐条结果

- `GET /documents`
  - 查询参数：`knowledge_base_id`, `parse_status?`
  - 响应：文档列表

- `GET /documents/{id}`
  - 响应：文档详情、解析状态、预览文本

- `POST /documents/{id}/index`
  - 行为：对单文档重新解析和重建索引

- `DELETE /documents/{id}`
  - 行为：删除文档、原始文件、chunks、向量索引

- `POST /documents/open`
  - 请求：`document_id`
  - 行为：调用系统默认程序打开原始文件

### 3. 聊天与追问

- `POST /chat/sessions`
  - 请求：`knowledge_base_ids[]`, `title?`
  - 响应：新会话详情

- `GET /chat/sessions`
  - 响应：会话列表

- `GET /chat/sessions/{id}`
  - 响应：会话详情与消息列表

- `POST /qa/ask`
  - 请求：
    - `session_id`
    - `question`
    - `knowledge_base_ids[]`
    - `top_k`
  - 响应：
    - `answer`
    - `citations[]`
    - `matched_documents[]`
    - `message_id`

说明：
- `session_id` 为空时，后端可自动创建新会话
- 多轮追问时，每次都重新做知识库范围内检索，再结合最近若干轮上下文生成答案

- `DELETE /chat/sessions/{id}`
  - 行为：删除会话及历史消息

### 4. 导出

- `POST /export/markdown`
  - 请求：`session_id`
  - 响应：导出任务或直接返回下载地址

- `POST /export/docx`
  - 请求：`session_id`
  - 响应：导出任务或直接返回下载地址

- `GET /exports/{id}`
  - 响应：导出状态、文件地址

### 5. 系统接口

- `GET /system/health`
  - 返回服务状态

- `GET /system/config`
  - 返回当前应用数据目录、导出目录、OCR 开关、模型配置名

## Implementation Order

为了让你尽快进入可演示状态，建议按下面顺序实现：

1. `knowledge_bases + documents` 基础 CRUD
2. `documents/upload` 批量上传与本地存储
3. 文档解析与 `document_chunks`
4. 向量索引与检索
5. `qa/ask` 单轮问答
6. `chat_sessions + chat_messages` 多轮追问
7. 预览文本高亮与“打开原始文件”
8. Markdown 导出
9. DOCX 导出
10. 网页链接导入与批量网页链接导入

## Acceptance Additions

除原有验收标准外，再补 5 条：

- 批量上传 20 个常见学习资料文件时，页面可持续反馈处理状态
- OCR 图片上传后，可在文档预览中看到识别文本
- 批量导入网页链接后，可看到逐条导入状态和失败原因
- 连续追问 3 到 5 轮时，不会丢失当前会话主题
- 点击“打开原始文件”后，系统默认应用能成功打开对应文件
- 来源高亮至少能在系统预览文本中准确定位命中片段
