# 本地知识库问答工具详细设计文档

## 1. 文档说明

### 1.1 文档目标

本文档用于定义第一版本地知识库问答工具的产品范围、交互方案、技术架构、数据结构、接口设计、界面设计和验收标准。目标是让该文档可以直接作为后续实现依据，减少开发中反复决策的成本。

### 1.2 产品定位

本产品是一个 **Mac 与 Windows 双端可用的本地 Web 知识库问答工具**。  
用户在本机运行服务，通过浏览器访问工具，创建知识库、导入文件或网页链接、发起问答、查看来源、导出结果。

### 1.3 目标用户

- 自己
- 同学
- 老师
- 需要对学习资料、课程资料、论文笔记、项目资料进行本地知识问答的人

### 1.4 设计原则

- 第一版优先可用，不追求大而全
- 优先本地运行与跨平台兼容
- 优先检索边界明确、答案可信、来源可核对
- 优先学习效率，不做花哨但无用的视觉设计
- 所有增强功能都必须控制在可实现范围内

## 2. 产品目标与范围

### 2.1 第一版核心目标

第一版需要完成一条完整可用链路：

1. 创建知识库
2. 向知识库导入本地文件或网页链接
3. 解析内容并建立索引
4. 对一个或多个知识库提问
5. 输出带来源的答案
6. 支持追问
7. 支持导出结果

### 2.2 第一版产品目标

- 支持本地知识整理与问答
- 支持跨知识库范围控制
- 支持来源核对和证据查看
- 支持批量导入
- 支持静态图片 OCR
- 支持公开网页正文抓取
- 支持 Markdown 导出，DOCX 作为增强

### 2.3 第一版明确不做

- 登录注册
- 多用户协作
- 云同步
- 支付
- 权限系统
- 网络搜索增强
- 本地大模型部署
- 音频视频解析
- 语音输入与语音播报
- 扫描 PDF OCR
- 原始 PDF/Word/PPT 内精准可视化高亮

## 3. 形态与运行方式

### 3.1 产品形态

产品长期保持为 **本地 Web 工具**：

- 本机启动后端服务
- 浏览器访问前端页面
- 所有文件、索引、数据库均保存在本机
- 不依赖远程数据库服务

### 3.2 不采用桌面壳的原因

- 可避免安装包、签名、更新、权限弹窗等额外复杂度
- 更易兼容 Mac 与 Windows
- 更适合快速实现与迭代
- 文件上传、批量导入、答案展示、引用展示在 Web 交互中更自然

### 3.3 双平台运行要求

- 支持 macOS 与 Windows
- 文件路径统一通过平台抽象处理
- 支持中文文件名、空格路径、长路径
- 不依赖仅在单平台安装顺畅的重型依赖

## 4. 用户场景

### 4.1 场景一：课程资料问答

用户创建“机器学习课程”知识库，上传 PDF 讲义、PPT、作业说明和 Excel 数据表，对知识库提问，例如：

- “讲义中对过拟合的定义是什么？”
- “老师在第几页提到交叉验证？”
- “作业要求中对实验报告格式的说明是什么？”

### 4.2 场景二：论文阅读整理

用户创建“论文阅读”知识库，上传论文 PDF、读书笔记 DOCX、截图和网页文章链接，进行问答与追问，例如：

- “这篇论文的方法部分的核心假设是什么？”
- “和我上传的另一篇论文相比有什么区别？”
- “帮我总结我资料中对这个概念的共同结论。”

### 4.3 场景三：项目资料查询

用户创建“毕业设计”知识库，导入项目文档、需求表、会议纪要和网页参考资料，快速检索：

- “目前需求文档中关于登录模块有哪些限制？”
- “会议纪要里谁提到过延期风险？”

## 5. 功能范围与优先级

### 5.1 Must have

- 创建、重命名、删除知识库
- 批量上传本地文件
- 上传单条网页链接与批量网页链接
- 支持 `PDF / DOCX / PPTX / Excel / CSV / PNG / JPG / JPEG`
- 文本抽取与静态图片 OCR
- 文档解析与索引构建
- 对单个或多个知识库提问
- 多轮追问
- 返回带来源的答案
- 命中片段高亮展示
- 打开原始文件
- Markdown 导出
- 问答历史基础保存
- 文件解析状态展示
- 检索命中片段列表
- 无命中引导反馈
- 删除前影响提示

### 5.2 Should have

- DOCX 导出
- 文档摘要卡片
- 最近使用知识库
- 单文档重新解析
- 整个知识库重新索引
- 会话重命名
- 会话清空

### 5.3 Could have

- 单文件内更精细的位置高亮
- 图片 OCR 结果校正
- 跨会话追问延续
- 原始文件定位增强
- 更丰富的导出模板

## 6. 关键能力边界

### 6.1 图片 OCR

- 仅支持 `png/jpg/jpeg`
- OCR 结果作为普通文本入库
- 不承诺扫描 PDF OCR、表格结构恢复、手写识别优化

### 6.2 批量上传

- 支持多选文件
- 支持拖拽多文件上传
- 支持批量网页链接列表导入
- 返回逐项处理结果
- 不做断点续传和复杂队列调度

### 6.3 多轮追问

- 仅保留当前会话上下文
- 每一轮都重新执行检索
- 结合最近若干轮上下文生成答案
- 提供清空会话入口

### 6.4 打开原始文件

- 仅对本地文件类型支持
- 使用系统默认程序打开
- 网页链接来源不支持此操作

### 6.5 来源高亮展示

- 第一版只在系统抽取后的文本预览中高亮命中片段
- 不承诺在原始 PDF、DOCX、PPTX 中精准高亮
- 目标是帮助用户快速核对证据

### 6.6 网页链接导入

- 仅支持公开可访问网页
- 支持单条导入和批量粘贴链接列表
- 仅抓取正文、标题和基础元数据
- 不支持登录态网页、复杂反爬页面、完整页面还原

## 7. 交互与页面设计

### 7.1 整体布局

采用三栏式布局：

- 左侧栏：知识库与会话导航
- 中间栏：问答主区域
- 右侧栏：来源证据与文档预览

### 7.2 页面结构

#### 首页 / 工作台

- 最近使用知识库
- 新建知识库按钮
- 最近会话列表
- 空状态提示

#### 知识库详情页

- 知识库名称与描述
- 文档列表
- 批量上传入口
- 批量网页链接导入入口
- 文档类型筛选
- 文档解析状态筛选
- 重新索引按钮

#### 问答页

- 问题输入框
- 已选知识库范围
- 回答展示区
- 追问输入框
- 导出按钮
- 复制答案按钮

#### 证据面板

- 命中来源列表
- 命中片段高亮预览
- 打开原始文件按钮
- 文档摘要卡片

### 7.3 视觉方向

界面以“学习效率优先”为主：

- 风格安静、专业、克制
- 背景使用轻微暖灰色，不用纯白
- 主色建议使用深墨绿、岩蓝或炭灰
- 命中高亮建议使用低饱和琥珀黄或浅青绿色
- 阴影、边框、卡片层级清晰但不过度装饰

### 7.4 低成本高收益的界面细节

- 知识库卡片显示文档数与更新时间
- 文档类型图标
- 拖拽上传态反馈
- 解析进度状态芯片
- 删除确认弹窗
- 无命中引导卡片
- 引用片段折叠与展开
- 一键复制答案
- 一键复制引用
- 导出成功反馈

## 8. 技术方案

### 8.1 总体架构

系统采用前后端分离、单仓库管理：

- 前端：`React + Vite`
- 后端：`FastAPI`
- 元数据：`SQLite`
- 向量索引：`Chroma`
- 文件存储：本地目录

### 8.2 技术选型原因

#### 前端

选择 `React + Vite`：

- 启动快
- 结构清晰
- 跨平台本地 Web 场景成熟
- 后续扩展成本低

#### 后端

选择 `FastAPI`：

- 易于处理文件上传和 REST API
- 适合解析、检索、导出等后端任务
- Python 生态适合文档处理

#### 存储与索引

- `SQLite`：本地部署简单
- `Chroma`：适合 V1 本地向量检索

### 8.3 文档解析技术

- PDF：`PyMuPDF`
- DOCX：段落与表格抽取
- PPTX：`python-pptx`
- Excel/CSV：`openpyxl` / `pandas`
- 网页：正文提取与清洗
- 图片：OCR 识别后入库

### 8.4 模型使用方式

- Embedding 模型通过适配层接入
- 生成模型通过聊天模型适配层接入
- 第一版使用 API 调用，不做本地模型部署
- 模型供应商不在架构上写死

## 9. 核心业务流程

### 9.1 文档导入流程

1. 用户选择知识库
2. 上传本地文件或输入网页链接
3. 系统保存原始文件或网页原始内容
4. 创建文档记录，状态为 `pending`
5. 后台开始解析，状态为 `processing`
6. 抽取文本、位置信息、预览内容
7. 生成 chunks
8. 生成 embedding 并写入向量索引
9. 文档状态更新为 `done`
10. 若失败则状态为 `failed` 并记录错误

### 9.2 问答流程

1. 用户选择一个或多个知识库
2. 输入问题
3. 系统先在所选知识库范围内检索相关 chunks
4. 若为多轮追问，拼接最近若干轮上下文
5. 将问题、上下文、检索结果送入生成模型
6. 返回答案、引用来源、命中文档信息
7. 前端渲染答案与高亮证据
8. 保存会话与消息记录

### 9.3 导出流程

1. 用户在问答页点击导出
2. 系统读取当前会话或指定回答
3. 生成导出内容
4. 输出 Markdown 或 DOCX 文件
5. 返回下载地址或导出状态

## 10. 数据模型设计

### 10.1 `knowledge_bases`

- `id` TEXT PRIMARY KEY
- `name` TEXT NOT NULL
- `description` TEXT NULL
- `color` TEXT NULL
- `created_at` DATETIME NOT NULL
- `updated_at` DATETIME NOT NULL
- `last_opened_at` DATETIME NULL
- `deleted_at` DATETIME NULL

索引：

- `INDEX idx_kb_updated_at (updated_at)`
- `INDEX idx_kb_last_opened_at (last_opened_at)`

### 10.2 `documents`

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
- `summary_text` TEXT NULL
- `page_count` INTEGER NULL
- `retry_count` INTEGER NOT NULL DEFAULT 0
- `last_parsed_at` DATETIME NULL
- `metadata_json` TEXT NULL
- `created_at` DATETIME NOT NULL
- `updated_at` DATETIME NOT NULL

索引：

- `FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id)`
- `INDEX idx_documents_kb_status (knowledge_base_id, parse_status)`
- `INDEX idx_documents_checksum (checksum)`

### 10.3 `document_chunks`

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

索引：

- `FOREIGN KEY (document_id) REFERENCES documents(id)`
- `FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id)`
- `UNIQUE (document_id, chunk_index)`
- `UNIQUE (vector_id)`
- `INDEX idx_chunks_kb_doc (knowledge_base_id, document_id)`

### 10.4 `chat_sessions`

- `id` TEXT PRIMARY KEY
- `title` TEXT NULL
- `selected_kb_ids_json` TEXT NOT NULL
- `last_message_at` DATETIME NULL
- `created_at` DATETIME NOT NULL
- `updated_at` DATETIME NOT NULL

### 10.5 `chat_messages`

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

索引：

- `FOREIGN KEY (session_id) REFERENCES chat_sessions(id)`
- `INDEX idx_messages_session_created (session_id, created_at)`

### 10.6 `export_jobs`

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

### 10.7 `app_settings`

- `key` TEXT PRIMARY KEY
- `value` TEXT NOT NULL
- `updated_at` DATETIME NOT NULL

用途：

- 默认导出目录
- 最近使用知识库
- OCR 开关
- 模型配置名称

## 11. 本地目录结构

建议同仓库开发时使用如下结构：

```text
project-root/
  design6.12v1715.md
  design6.13v2130.md
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

运行时数据目录建议：

- macOS：`~/Library/Application Support/YourApp/`
- Windows：`%AppData%\\YourApp\\`

统一子目录：

- `files/`
- `vector_store/`
- `exports/`
- `logs/`
- `app.db`

## 12. API 设计

### 12.1 知识库接口

#### `POST /knowledge-bases`

请求：

- `name`
- `description?`

响应：

- 知识库详情

#### `GET /knowledge-bases`

响应：

- 知识库列表
- 文档数
- 最近更新时间

#### `GET /knowledge-bases/recent`

响应：

- 最近使用知识库列表

#### `PATCH /knowledge-bases/{id}`

请求：

- `name?`
- `description?`

#### `DELETE /knowledge-bases/{id}`

行为：

- 删除知识库
- 删除关联文档与索引
- 会话可保留，但 UI 提示关联知识库已删除

#### `POST /knowledge-bases/{id}/reindex`

行为：

- 重新解析该知识库下可用文档
- 重建 chunk 与向量索引

### 12.2 文档接口

#### `POST /documents/upload`

请求：

- `multipart/form-data`
- `knowledge_base_id`
- `files[]`

响应：

- 每个文件的接收结果
- 文档 ID
- 初始解析状态

#### `POST /documents/import-url`

请求：

- `knowledge_base_id`
- `url`

#### `POST /documents/import-urls`

请求：

- `knowledge_base_id`
- `urls[]`

响应：

- 逐条导入结果
- 成功与失败原因

#### `GET /documents`

查询参数：

- `knowledge_base_id`
- `parse_status?`

#### `GET /documents/{id}`

响应：

- 文档详情
- 解析状态
- 预览文本
- 摘要

#### `POST /documents/{id}/index`

行为：

- 对单文档重新解析和重建索引

#### `POST /documents/{id}/retry-parse`

行为：

- 失败文档重新处理

#### `DELETE /documents/{id}`

行为：

- 删除文档
- 删除原始文件
- 删除 chunks
- 删除向量索引

#### `POST /documents/open`

请求：

- `document_id`

行为：

- 使用系统默认程序打开原始文件

### 12.3 会话与问答接口

#### `POST /chat/sessions`

请求：

- `knowledge_base_ids[]`
- `title?`

#### `GET /chat/sessions`

响应：

- 会话列表

#### `GET /chat/sessions/{id}`

响应：

- 会话详情
- 消息列表

#### `POST /chat/sessions/{id}/rename`

请求：

- `title`

#### `POST /chat/sessions/{id}/clear`

行为：

- 清空当前会话消息

#### `DELETE /chat/sessions/{id}`

行为：

- 删除会话与消息记录

#### `POST /qa/ask`

请求：

- `session_id`
- `question`
- `knowledge_base_ids[]`
- `top_k`

响应：

- `answer`
- `citations[]`
- `matched_documents[]`
- `message_id`

说明：

- `session_id` 为空时可自动创建新会话
- 多轮追问时，每轮都重新检索
- 若证据不足，必须返回受限答案，不得编造

### 12.4 导出接口

#### `POST /export/markdown`

请求：

- `session_id`

#### `POST /export/docx`

请求：

- `session_id`

#### `GET /exports/{id}`

响应：

- 导出状态
- 文件地址

### 12.5 系统接口

#### `GET /system/health`

返回：

- 服务状态

#### `GET /system/config`

返回：

- 当前应用数据目录
- 导出目录
- OCR 开关
- 模型配置名

## 13. 来源与检索设计

### 13.1 检索边界

- 所有检索都必须限制在用户选择的知识库范围内
- 多知识库同时提问时，允许混合检索，但来源必须标清
- 未被选中的知识库不得参与答案生成

### 13.2 引用结构

每条引用至少包含：

- `knowledge_base_name`
- `document_name`
- `location_label`
- `snippet`
- `highlight_ranges`

### 13.3 无命中策略

若检索结果不足：

- 明确告知“未找到足够依据”
- 提示用户尝试扩大知识库范围
- 提示检查文档是否已解析完成
- 不得自由编造答案

## 14. 导出设计

### 14.1 Markdown 导出

导出内容结构统一为：

- 标题
- 提问时间
- 所选知识库
- 问题
- 回答
- 来源列表

### 14.2 DOCX 导出

作为增强项，结构与 Markdown 保持一致：

- 标题页头
- 问题
- 回答
- 来源引用
- 时间与知识库信息

## 15. 实现顺序

建议开发顺序如下：

1. 知识库与文档基础 CRUD
2. 本地文件批量上传
3. 文档解析与 chunk 建立
4. 向量索引与检索
5. 单轮问答
6. 多轮追问
7. 命中片段高亮
8. 打开原始文件
9. Markdown 导出
10. 网页链接导入与批量网页链接导入
11. 文件状态中心
12. 文档摘要
13. DOCX 导出
14. 最近使用与会话增强

## 16. 测试与验收

### 16.1 必测场景

- Mac 与 Windows 都能完成首次启动
- 创建多个知识库后，文件不会串库
- 一次上传多个文件时，成功和失败状态分别可见
- 一次导入多个网页链接时，成功和失败状态分别可见
- PDF、DOCX、PPTX、Excel、CSV 均可解析
- PNG、JPG、JPEG 可完成 OCR 并参与检索
- 公开网页链接可抽取正文并参与检索
- 中文文档、中文路径、中文文件名正常处理
- 多轮追问时，上下文可延续，但每轮仍受知识库选择约束
- 表格内容可被检索到
- 来源片段在文本预览中能正确高亮
- 点击“打开原始文件”后，可用系统默认程序打开本地文件
- Markdown 导出内容与页面答案一致
- 删除知识库后，本地文件、数据库记录、向量索引一并清理
- 重启应用后，知识库、文档、历史记录仍存在

### 16.2 补充验收点

- 批量上传 20 个常见学习资料文件时，页面能持续反馈处理状态
- OCR 图片上传后，可在文档预览中看到识别文本
- 批量导入网页链接后，可看到逐条导入状态和失败原因
- 连续追问 3 到 5 轮时，不会丢失当前会话主题
- 无命中场景下会出现明确引导，而不是空白失败
- 删除前弹窗能明确提示影响范围

### 16.3 成功标准

- 新用户在任一平台上都能在 10 分钟内完成首次安装并提问
- 不需要独立安装数据库或向量数据库服务
- 不需要本地部署大模型
- 问答结果必须带来源
- 第一版能稳定处理学习资料、课程讲义、论文笔记、项目文档

## 17. 风险与控制

### 17.1 主要风险

- 图片 OCR 准确率不稳定
- 网页正文抓取效果受站点结构影响
- 多格式文档解析质量不一致
- 批量导入时状态反馈复杂度提升
- 来源高亮如果承诺过高，容易实现失控

### 17.2 控制策略

- OCR 范围限制在静态图片
- 网页仅支持公开正文抓取
- 原始文件不做精准高亮承诺
- 多轮追问每轮重新检索，避免上下文漂移
- 所有复杂能力优先做“可用版”而不是“完整版”

## 18. 结论

该方案适合作为第一版详细设计基线。  
它在保证 Mac 与 Windows 可用、本地运行、知识库边界明确、答案可溯源的前提下，已经具备较完整的产品形态，同时仍保持在可控的实现范围内。

如果按本文档推进，第一版的重点不再是“还能加什么功能”，而是把以下四件事做稳：

- 文档解析稳定
- 检索边界准确
- 答案与来源可信
- 界面结构清晰、状态反馈完整
