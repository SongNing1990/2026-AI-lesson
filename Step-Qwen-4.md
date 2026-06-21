# Step Qwen 4 - 将问答主流程切换为检索后调用 Qwen 生成

## 目标

把当前 `/qa/ask` 从“模板拼答案”切换为“检索后调用 Qwen 生成答案”，同时保留现有来源引用和命中文档结构。

## 输入

- `design for Qwen2.5.md`
- Step-Qwen-2 的模型调用层
- Step-Qwen-3 的 Prompt 构造层
- 当前 `ask_question()` 流程

## 需要实现

1. 保留当前能力：
   - `build_contextual_question()`
   - 向量检索
   - rerank
   - top hits 选择
   - citations 构造
   - matched_documents 构造
   - 会话持久化

2. 替换答案生成逻辑：
   - 不再把 `build_answer()` 作为主路径
   - 新增 `generate_answer_with_qwen(...)`

3. 问答返回结构保持不变：
   - `answer`
   - `citations`
   - `matched_documents`
   - `answer_limited`
   - `message`
   - `session_id`

4. 证据不足时：
   - 保持当前保守返回逻辑
   - 不强行调用模型胡答

5. 会话历史中保存：
   - 用户问题
   - 模型回答
   - 引用快照
   - 检索快照

## 输出

- 已接入 Qwen2.5 的 `/qa/ask`
- 检索 + 生成的完整 RAG 链路

## 校验

1. 提问后，回答不再是简单模板拼接。
2. 回答内容明显依赖知识库证据。
3. 来源引用展示仍然正常。
4. 多轮追问仍然可用。
5. 证据不足时，回答保持保守。

## 不要做

- 不修改前端问答交互
- 不做模型切换 UI
- 不替换向量库

## 完成判定

当 `/qa/ask` 已经通过 Qwen2.5 生成知识库答案，且现有引用结构不被破坏时，本步骤完成。
