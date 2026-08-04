const MODEL_REF_RE = /^[^/\s]+\/[^/\s]+$/;

export default function requireExplicitSubagentModel(pi) {
  pi.on("tool_call", async (event) => {
    if (event?.toolName !== "subagent") return;

    // Discovery is a pure read path; it never launches a child session.
    const requestedAgent = typeof event.input?.agent === "string" ? event.input.agent.trim() : "";
    if (requestedAgent === "?" || requestedAgent === "list") return;

    const model = typeof event.input?.model === "string" ? event.input.model.trim() : "";
    if (!model) {
      return {
        block: true,
        reason: "子代理模型选择插件已拦截这次派发：请先向用户确认模型，并调用 subagent-model-picker_model-options 或 subagent-model-picker_resolve-model 获得准确的 provider/id，再携带 model 参数调用 subagent。",
      };
    }

    if (!MODEL_REF_RE.test(model)) {
      return {
        block: true,
        reason: "子代理的 model 必须是 provider/id 格式。请用 subagent-model-picker_resolve-model 规范化用户的选择后重试。",
      };
    }
  });
}
