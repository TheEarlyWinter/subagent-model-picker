import { listConfiguredChatModels } from "../lib/model-catalog.js";
import { loadModelPolicy } from "../lib/policy-loader.js";

export const name = "model-options";
export const description = "Read the user's subagent model preference before launching a subagent. Call this before every subagent launch. It returns the requested model, the target agent's configured model, the global fallback, or tells you to ask the user.";
export const sessionPermission = { readOnly: true };
export const parameters = {
  type: "object",
  properties: {
    requestedModelName: {
      type: "string",
      description: "The model wording explicitly present in the latest user request. When supplied, it always takes priority over agent-specific and global preferences.",
    },
    agentId: {
      type: "string",
      description: "Optional target subagent id. Pass the exact id when the subagent tool targets a specific agent so its dedicated model preference can apply.",
    },
  },
};

export async function execute(params, ctx) {
  const requestedModelName = typeof params?.requestedModelName === "string"
    ? params.requestedModelName.trim()
    : "";
  const agentId = typeof params?.agentId === "string" ? params.agentId.trim() : "";
  const { publicPolicy, readPolicy, resolveConfiguredPreference, resolveModelChoice } = await loadModelPolicy();
  const policy = readPolicy(ctx);
  const publicState = publicPolicy(policy);

  // A model stated by the user must win over every saved preference.
  if (requestedModelName) {
    const configuredCatalog = await listConfiguredChatModels(ctx);
    const configuredDirect = configuredCatalog.ok
      ? configuredCatalog.models.find((entry) => entry.ref === requestedModelName)
      : null;
    const resolution = configuredDirect
      ? { ok: true, model: configuredDirect.ref, source: "configured_chat_model", availability: "configured", policy: publicState }
      : await resolveModelChoice(ctx, { modelName: requestedModelName, agentId });
    if (resolution.ok) {
      return {
        content: [{
          type: "text",
          text: [
            "SUBAGENT_MODEL_POLICY",
            "action: use_requested_model",
            `model: ${resolution.model}`,
            `source: ${resolution.source}`,
            "The user explicitly selected this model. Use this exact value as subagent.model instead of any saved preference.",
          ].join("\n"),
        }],
        details: { action: "use_requested_model", ...resolution, ...publicState },
      };
    }
    return {
      content: [{
        type: "text",
        text: [
          "SUBAGENT_MODEL_POLICY",
          "action: ask_user",
          `reason: ${resolution.reason}`,
          "The explicit user choice could not be resolved. Ask the user again; do not substitute a saved preference.",
        ].join("\n"),
      }],
      details: { action: "ask_user", ...resolution, ...publicState },
    };
  }

  const resolution = resolveConfiguredPreference(ctx, policy, agentId);
  if (resolution.ok) {
    const action = resolution.source === "agent_preference"
      ? "use_agent_preference"
      : "use_configured_default";
    return {
      content: [{
        type: "text",
        text: [
          "SUBAGENT_MODEL_POLICY",
          `action: ${action}`,
          `model: ${resolution.model}`,
          ...(resolution.agentId ? [`agentId: ${resolution.agentId}`] : []),
          resolution.source === "agent_preference"
            ? "No model was explicitly requested. Use this target agent's saved model as subagent.model."
            : "No model was explicitly requested and the target agent has no dedicated preference. Use this global fallback as subagent.model.",
        ].join("\n"),
      }],
      details: { action, ...resolution, availability: "not_checked", ...publicState },
    };
  }

  const configured = await listConfiguredChatModels(ctx);
  const configuredModels = configured.ok && configured.models.length
    ? configured.models.map(({ name, ref }) => `- ${name}: ${ref}`).join("\n")
    : "- 当前未读到已配置的聊天模型";
  return {
    content: [{
      type: "text",
      text: [
        "SUBAGENT_MODEL_POLICY",
        "action: ask_user",
        "No model was explicitly requested, and neither a target-agent preference nor a global fallback is configured. Ask the user which model to use before launching the subagent.",
        "The user may reply with an exact configured provider/id or ‘默认’. Resolve their answer with subagent-model-picker_resolve-model.",
        "Configured chat models:",
        configuredModels,
      ].join("\n"),
    }],
    details: { action: "ask_user", configuredModels: configured.models, modelCatalogError: configured.ok ? null : configured.reason, ...publicState },
  };
}
