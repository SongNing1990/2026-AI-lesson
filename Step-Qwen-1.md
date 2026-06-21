# Step Qwen 1 - 扩展模型配置与系统配置输出

## 目标

为 Qwen2.5 本地接入补齐后端配置项，使系统具备明确的 LLM 运行时配置，并能通过系统接口对外输出当前模型配置。

## 输入

- `design for Qwen2.5.md`
- 当前后端配置结构
- 当前接口：
  - `GET /system/config`

## 需要实现

1. 在后端配置中增加 LLM 相关配置项：
   - `llm_enabled`
   - `llm_provider`
   - `llm_model_name`
   - `llm_base_url`
   - `llm_timeout_seconds`
   - `llm_temperature`
   - `llm_max_tokens`
   - `llm_fallback_to_extractive`

2. 设置默认值：
   - provider 默认 `ollama`
   - model 默认 `qwen2.5:7b-instruct`
   - base url 默认 `http://127.0.0.1:11434`

3. 更新 `/system/config` 输出：
   - 保留原字段
   - 新增输出当前 LLM 配置字段

4. 更新 README 或相关文档说明：
   - 写明 Ollama 默认地址
   - 写明默认模型名

## 输出

- 可用的 LLM 配置项
- `/system/config` 可输出当前模型配置

## 校验

1. 启动后端后，`GET /system/config` 能返回新增 LLM 字段。
2. 在不改环境变量的情况下，默认值正确。
3. 修改环境变量后，配置能被正确覆盖。

## 不要做

- 不接入真正模型调用
- 不修改问答主流程
- 不增加前端模型切换

## 完成判定

当系统能够明确表达“当前准备用哪个本地模型、通过哪个服务地址调用”时，本步骤完成。
