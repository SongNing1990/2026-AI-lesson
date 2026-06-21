# Qwen2.5 接入设计文档

## 1. 目标

将当前知识库问答项目从“检索后模板拼接答案”升级为“检索 + Qwen2.5 生成答案”的 RAG 方案。

本次接入目标：

- 默认接入 `Qwen2.5-7B-Instruct`
- 支持后续切换 `Qwen2.5-14B-Instruct`
- 优先适配 `macOS + Windows`
- 优先采用本地免费运行方式
- 保留现有知识库、引用来源、会话、多轮追问、前端展示逻辑

默认设计结论：

- 模型运行时：`Ollama`
- 默认模型：`qwen2.5:7b-instruct`
- 14B 作为高级可切换模式
- 保留当前 Chroma 检索和 rerank 逻辑
- 仅替换“答案生成层”，不重做整套检索架构

---

## 2. 当前现状

当前后端问答链路位于：

- `apps/api/app/services/qa_service.py`

当前 `ask_question()` 的核心流程是：

1. 接收问题和知识库范围
2. 结合会话历史构造 `contextual_question`
3. 对知识库进行向量回填
4. 用 `query_vectors()` 做向量检索
5. 用 `rerank_hits()` 做重排
6. 用 `build_answer()` 直接拼出答案文本
7. 返回结构化引用和命中文档

当前系统特点：

- 已有本地知识库存储
- 已有文档切分和向量索引
- 已有多轮会话
- 已有来源引用卡片
- 前端已经依赖结构化字段：
  - `answer`
  - `citations`
  - `matched_documents`
  - `answer_limited`
  - `message`

因此接入 Qwen2.5 时，不应破坏这些返回结构。

---

## 3. 接入原则

### 3.1 总体原则

接入 Qwen2.5 时，采用：

- 检索仍由本地系统控制
- 引用仍由本地系统控制
- 模型只负责“基于证据生成答案”

不能改成：

- 模型自己决定引用来源
- 模型脱离证据自由发挥
- 检索和生成彻底耦合在一起

### 3.2 为什么选 Ollama

对当前项目最合适的原因：

- mac 和 windows 都容易安装
- 本地免费可用
- 切换 7B / 14B 简单
- HTTP 接口稳定
- 对现有 FastAPI 项目接入成本低

### 3.3 为什么默认 7B

- 普通电脑更容易跑稳
- 更适合先完成 V1 集成
- 14B 对资源要求更高
- 后续再通过配置切换到 14B

---

## 4. 目标架构

升级后的问答链路：

1. 前端调用 `POST /qa/ask`
2. 后端执行现有知识库检索和重排
3. 后端把问题和证据片段组装成 Qwen 专用 Prompt
4. 后端调用 Ollama 上的 `Qwen2.5-Instruct`
5. 模型返回自然语言答案
6. 后端继续返回现有结构化来源：
   - `citations`
   - `matched_documents`
7. 前端继续按当前 UI 展示答案和来源

即：

- `retrieval` 不变
- `citation generation` 不变
- `answer generation` 改为 Qwen

---

## 5. 后端改造设计

### 5.1 新增 LLM Provider 层

不要把 Ollama 调用直接写入 `qa_service.py`。

建议新增：

- `apps/api/app/services/llm_client.py`
- `apps/api/app/services/llm_prompting.py`

#### `llm_client.py` 职责

负责统一调用本地 LLM 服务。

建议提供接口：

```python
def generate_text(
    *,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int,
) -> str:
    ...
```

默认实现：

- provider = `ollama`
- 请求地址 = `http://127.0.0.1:11434/api/generate` 或 chat 接口

要求：

- 处理超时
- 处理连接失败
- 处理模型未拉取
- 返回纯文本

#### `llm_prompting.py` 职责

负责构造知识库问答 Prompt。

建议提供接口：

```python
def build_qa_prompts(
    *,
    question: str,
    knowledge_base_names: list[str],
    citations: list[QACitation],
) -> tuple[str, str]:
    ...
```

返回：

- `system_prompt`
- `user_prompt`

---

### 5.2 `qa_service.py` 改造

当前：

- `build_answer(normalized_question, citations)` 直接拼答案

改造后：

- `build_answer()` 不再作为主答案生成方式
- 新增 `generate_answer_with_qwen(...)`

建议改造流程：

1. 保留：
   - `build_contextual_question()`
   - `validate_knowledge_bases()`
   - `backfill_vectors_for_knowledge_bases()`
   - `query_vectors()`
   - `rerank_hits()`
   - `select_top_hits()`
   - `build_citation()`
   - `build_matched_documents()`

2. 在生成 `citations` 和 `matched_documents` 后：
   - 把命中的 top hits 转换为可读证据块
   - 调 `build_qa_prompts()`
   - 调 `llm_client.generate_text()`

3. 把模型输出写入：
   - `QAAskResponse.answer`

4. 保留：
   - `citations`
   - `matched_documents`
   - `message`
   - `answer_limited`
   - `session_id`

#### 新的回答生成函数建议

```python
def generate_answer_with_qwen(
    *,
    question: str,
    knowledge_base_names: list[str],
    citations: list[QACitation],
) -> str:
    ...
```

---

### 5.3 证据块拼接策略

虽然 Qwen2.5 支持长上下文，但不建议无上限传入。

默认策略：

- 最终送模型的证据块数量：`3 ~ 5`
- 每条证据块截断长度：控制在适度范围
- 优先保留高分命中
- 优先保留主体匹配更强的命中
- 避免重复片段反复传入

证据块格式建议：

```text
[证据1]
知识库：xxx
文档：xxx
定位：第 3 页 / 第 2 段
内容：......
```

---

### 5.4 模型回答约束

模型回答必须严格约束为知识库问答，不是普通聊天。

System Prompt 需要明确要求：

- 只能依据提供证据回答
- 不得编造不存在的信息
- 如果证据不足，要明确说明不足
- 中文回答
- 回答简洁、清楚、直接
- 不把文件名本身当作事实依据
- 不自由输出来源列表，来源由系统单独展示

User Prompt 结构建议：

- 用户问题
- 当前知识库范围
- 证据块列表
- 输出要求

---

### 5.5 回退策略

默认保留回退逻辑：

- 如果 Ollama 不可达
- 或模型调用超时
- 或模型未安装

则：

- 优先返回明确错误信息
- 可选回退到当前抽取式 `build_answer()` 逻辑

建议默认配置：

- `llm_fallback_to_extractive = true`

这样可以避免模型服务异常时整个问答不可用。

---

## 6. 配置设计

当前配置中需要扩展真正可运行的模型设置。

建议在：

- `apps/api/app/core/config.py`

中新增：

```python
llm_enabled: bool = True
llm_provider: str = "ollama"
llm_model_name: str = "qwen2.5:7b-instruct"
llm_base_url: str = "http://127.0.0.1:11434"
llm_timeout_seconds: int = 120
llm_temperature: float = 0.2
llm_max_tokens: int = 1024
llm_fallback_to_extractive: bool = True
```

建议保留：

- `model_config_name`

但改为更真实的值，例如：

- `ollama-qwen2.5-7b-default`

---

## 7. 系统接口变更

### 7.1 `/system/config`

建议扩展返回：

- `llm_provider`
- `llm_model_name`
- `llm_base_url`
- `llm_enabled`

### 7.2 新增 `/system/llm-status`（建议）

建议新增接口：

- `GET /system/llm-status`

返回示例：

```json
{
  "available": true,
  "provider": "ollama",
  "model": "qwen2.5:7b-instruct",
  "reachable": true,
  "message": "ok"
}
```

用于：

- 设置页展示
- 前端快速诊断模型服务状态

### 7.3 `/qa/ask`

第一版建议请求结构不变。

即继续保留：

```json
{
  "question": "...",
  "knowledge_base_ids": ["..."],
  "session_id": "...",
  "top_k": 5
}
```

模型选择先走服务端配置，不在第一版前端暴露切换。

---

## 8. 前端改造设计

前端大框架不需要变化，但建议补两类信息。

### 8.1 设置页展示模型配置

在设置页中增加：

- provider
- model
- base url
- 模型可用状态

### 8.2 问答失败提示更清晰

区分几种错误：

- Ollama 未启动
- 模型未下载
- 模型超时
- 后端调用失败

前端不用改问答主交互：

- 提问框保留
- 回答弹窗保留
- 引用展示保留
- 会话记录保留

---

## 9. Ollama 本地运行约定

### 9.1 默认安装方式

用户先安装 Ollama。

### 9.2 默认拉取模型

默认模型：

```bash
ollama pull qwen2.5:7b-instruct
```

高级模式：

```bash
ollama pull qwen2.5:14b-instruct
```

### 9.3 默认服务地址

```text
http://127.0.0.1:11434
```

---

## 10. 推荐实现顺序

建议按这个顺序落地：

1. 扩展配置层
2. 扩展 `/system/config`
3. 新增 `llm_client.py`
4. 新增 `llm_prompting.py`
5. 改造 `qa_service.ask_question()`
6. 增加 Ollama 可用性检测
7. 保留并接好 fallback
8. 设置页展示当前模型信息
9. 本地用 `qwen2.5:7b-instruct` 联调
10. 再验证 `14b-instruct` 切换

---

## 11. 测试设计

### 11.1 功能测试

- 已上传 PDF / DOCX / Excel / 网页链接
- 对知识库提问
- 返回答案为自然语言生成，不再只是模板拼接
- 引用来源仍然正确显示
- 多轮追问仍可用

### 11.2 异常测试

- Ollama 未启动
- 模型未拉取
- 模型响应超时
- 回退到抽取式回答

### 11.3 质量测试

验证以下问题类型：

- 定义类问题
- 总结类问题
- 主体限定类问题
- 模糊主题但主体明确的问题
- 证据不足问题

重点检查：

- 是否胡编
- 是否偏离知识库
- 是否把文件名当作事实内容
- 是否能正确利用多段证据

---

## 12. 默认结论

本项目接入 Qwen2.5 的推荐默认方案是：

- Provider：`Ollama`
- 默认模型：`Qwen2.5-7B-Instruct`
- 高级模式：`Qwen2.5-14B-Instruct`
- 检索层：继续使用现有 Chroma
- 重排层：继续使用现有 `rerank_hits()`
- 回答生成层：改为 Qwen2.5
- 引用层：继续由后端结构化生成
- 前端：仅补状态展示，不重做主界面

这是当前项目最适合的接入方式，兼顾：

- 免费
- 中文效果
- 本地可运行
- Mac / Windows 兼容
- 对现有项目改造成本可控
