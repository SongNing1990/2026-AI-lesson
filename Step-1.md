# Step 1 - 初始化项目骨架与本地开发环境

## 目标

基于 `design6.13v2130.md` 初始化一个可运行的单仓库项目骨架，包含前端 `React + Vite`、后端 `FastAPI`、基础目录结构、启动脚本和开发说明。此步骤只解决“项目能启动、目录清晰、环境可装”的问题，不实现业务功能。

## 输入

- `design6.13v2130.md`
- 当前仓库根目录
- 目标技术栈：
  - 前端：`React + Vite`
  - 后端：`FastAPI`
  - 元数据：`SQLite`
  - 向量索引：后续步骤接入 `Chroma`

## 需要实现

1. 创建与设计文档一致的目录结构：
   - `apps/web`
   - `apps/api`
   - `storage`
   - `scripts/dev`
   - `scripts/setup`

2. 初始化前端基础工程：
   - 可启动的 Vite React 项目
   - 基础路由占位
   - 基础全局样式文件

3. 初始化后端基础工程：
   - 可启动的 FastAPI 项目
   - `main.py`
   - `core/config.py`
   - `core/db.py`
   - `core/paths.py`
   - 基础健康检查接口 `GET /system/health`

4. 创建开发启动脚本：
   - `scripts/dev/start_mac.sh`
   - `scripts/dev/start_windows.bat`

5. 创建安装说明或 README 占位，至少写明：
   - Python/Node 版本要求
   - 本地安装步骤
   - 前后端启动方式

## 输出

- 完整的项目基础目录结构
- 可独立启动的前端开发服务器
- 可独立启动的后端开发服务器
- 基础健康检查接口
- 启动脚本与最小开发说明

## 校验

1. 运行前端后能打开默认页面。
2. 运行后端后访问 `/system/health` 返回成功状态。
3. 目录结构与 `design6.13v2130.md` 中的约定一致，不擅自增删核心目录。
4. 启动脚本在 macOS 和 Windows 语义上都合理，不要求一步到位完全自动化，但至少可读、可改、可执行。

## 不要做

- 不实现数据库表
- 不实现知识库 CRUD
- 不实现上传、解析、问答、导出
- 不接入模型或向量库

## 完成判定

满足“新开发者拉下仓库后，可以按说明把前后端都跑起来”即可进入下一步。
