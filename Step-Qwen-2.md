# Step Qwen 2 - 实现 Ollama Provider 调用层

## 目标

新增独立的 LLM 调用层，通过 Ollama HTTP 接口调用 `Qwen2.5-Instruct`，为后续问答主流程接入生成模型做好基础能力。

## 输入

- `design for Qwen2.5.md`
- Step-Qwen-1 的配置结果
- Ollama 默认接口地址：
  - `http://127.0.0.1:11434`

## 需要实现

1. 新增独立服务层：
   - 例如 `llm_client.py`

2. 提供统一的文本生成接口：
   - 输入至少包含：
     - model
     - system_prompt
     - user_prompt
     - temperature
     - max_tokens
   - 输出纯文本答案

3. 接入 Ollama：
   - 按配置地址发起 HTTP 请求
   - 支持默认模型 `qwen2.5:7b-instruct`

4. 异常处理：
   - Ollama 服务不可达
   - 模型未拉取
   - 请求超时
   - 返回内容为空

5. 统一错误语义：
   - 调用失败时返回后端可识别的异常或错误结果

## 输出

- 可复用的 Ollama Provider 层
- 稳定的文本生成函数

## 校验

1. 当本地 Ollama 已启动且已拉取模型时，能得到文本返回。
2. 当 Ollama 未启动时，错误信息明确。
3. 当模型不存在时，错误信息明确。
4. 超时不会导致后端进程异常退出。

## 不要做

- 不改 `/qa/ask`
- 不做 Prompt 设计
- 不接前端

## 完成判定

当后端已经可以独立调用本地 Qwen2.5 并获得文本结果时，本步骤完成。
