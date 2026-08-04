---
name: subagent-model-picker
description: 当你准备调用 subagent 工具派出子代理、选择子代理模型、处理用户指定的模型或子代理模型偏好时，必须加载并遵循此流程。
---
# 子代理模型选择流程

此插件会拦截所有没有显式 `model` 参数的 `subagent` 调用。不要尝试绕过拦截。

## 必须遵守的流程

1. 先检查最新用户消息是否**明确指定模型**。明确指定时，调用 `subagent-model-picker_model-options`，把用户原话作为 `requestedModelName` 传入；它返回的 `use_requested_model` 必须优先于任何已保存偏好。
2. 用户没有指定模型时，调用 `subagent-model-picker_model-options`，并传入目标 `agentId`。若 `subagent` 省略 `agent`，可省略本工具的 `agentId`，它会以当前 agent 为目标。
3. 若返回 `action: use_agent_preference`，将返回的精确 `model` 值原样传给 `subagent.model`。这表示目标 agent 有专属模型配置。
4. 若返回 `action: use_configured_default`，将返回的精确 `model` 值原样传给 `subagent.model`。这表示目标 agent 没有专属配置，改用了全局默认模型。
5. 若返回 `action: ask_user`：先向用户询问子代理应使用哪一个模型，等待用户回答；不要在这一轮派发子代理。
6. 用户回答后，调用 `subagent-model-picker_resolve-model`，传入用户原话和目标 `agentId`（若有）。用户说“默认”时，工具先解析目标 agent 的专属配置，再解析全局默认模型。
7. 只有解析结果 `ok: true` 时，才能调用 `subagent`；将结果的精确 `model` 值原样填入 `subagent.model`。
8. 若解析结果 `ok: false`，向用户说明当前没有可用模型偏好，并请其选择精确的 `provider/id` 或到「子代理模型」页面保存配置。不要把猜测的模型名或不完整模型名直接传给 `subagent`。
9. 解析成功代表模型引用来自当前模型目录或已保存偏好，**不代表模型当前仍可用**；真正的可用性由 Hana 在派发时最终校验。

## 选择优先级

1. 用户在当前请求中明确指定的模型
2. 目标 agent 在「子代理模型」页面保存的专属模型
3. 页面保存的全局默认模型
4. 询问用户

## 示例

用户：`让 cixiaogui 派一个子代理审这个项目。`

先调用：

```json
{
  "agentId": "cixiaogui"
}
```

若返回：

```text
action: use_agent_preference
model: opencode-go/deepseek-v4-flash
```

再调用：

```json
{
  "agent": "cixiaogui",
  "task": "审查这个项目……",
  "model": "opencode-go/deepseek-v4-flash",
  "access": "read"
}
```

用户：`用 opencode-go/gpt-5.6-luna 让 cixiaogui 检查测试。`

先调用 `subagent-model-picker_model-options`，并传入：

```json
{
  "requestedModelName": "opencode-go/gpt-5.6-luna",
  "agentId": "cixiaogui"
}
```

用户明确指定的模型必须覆盖 cixiaogui 的专属配置。
