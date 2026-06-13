# Step 2 - 建立后端配置、数据库模型与持久化基础

## 目标

在已有后端骨架上，落地 `design6.13v2130.md` 中的数据模型、数据库初始化逻辑和本地路径管理能力，为后续知识库、文档、会话、导出等功能提供统一的持久化基础。

## 输入

- `design6.13v2130.md`
- 上一步创建的 `apps/api` 工程
- 数据模型章节：
  - `knowledge_bases`
  - `documents`
  - `document_chunks`
  - `chat_sessions`
  - `chat_messages`
  - `export_jobs`
  - `app_settings`

## 需要实现

1. 选定并实现 ORM/数据库访问方案。
   - 推荐使用 `SQLAlchemy + SQLite`
   - 保持实现简单，不引入重型迁移系统也可以，但表创建逻辑必须清晰

2. 实现配置管理：
   - 应用数据目录
   - SQLite 文件位置
   - `storage/files`
   - `storage/exports`
   - `storage/logs`

3. 建立数据库模型与初始化：
   - 按设计文档定义表和必要索引
   - 保留 `source_url`、`preview_text`、`summary_text`、`retry_count`、`last_opened_at` 等关键字段

4. 实现数据库启动初始化：
   - 启动时自动创建缺失表
   - 启动时自动创建缺失目录

5. 提供最小系统配置接口：
   - `GET /system/config`
   - 返回应用数据目录、导出目录、OCR 开关、模型配置名的占位值

## 输出

- 可用的数据库模型层
- 自动初始化数据库和目录的后端启动逻辑
- 统一配置读取逻辑
- `GET /system/config` 接口

## 校验

1. 启动后端后，SQLite 文件会自动创建。
2. 所有核心表会被自动创建。
3. `storage/files`、`storage/exports`、`storage/logs` 自动存在。
4. `GET /system/config` 返回的路径信息与本地目录一致。

## 不要做

- 不实现知识库业务接口
- 不写上传解析逻辑
- 不接入 Chroma
- 不实现问答逻辑

## 完成判定

当后端具备稳定的数据落盘基础，且后续步骤不必再反复修改目录和数据库初始化逻辑时，本步骤完成。
