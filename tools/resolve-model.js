import { listConfiguredChatModels } from "../lib/model-catalog.js";
import { loadModelPolicy } from "../lib/policy-loader.js";

export const name = "resolve-model";
export const description = "Resolve a user's subagent model choice into a configured explicit provider/id. Call this after the user names a model or replies ‘默认’, before calling subagent. The target agent's dedicated model preference is used before the global fallback.";
export const sessionPermission = { readOnly: true };
export const parameters = {
  type: "object",
  required: ["modelName"],
  properties: {
    modelName: {
      type: "string",
      description: "The user's exact model choice, for example a configured provider/id or ‘默认’.",
    },
    agentId: {
      type: "string",
      description: "Optional target subagent id. Pass the exact id so a ‘默认’ choice resolves through its dedicated model preference.",
    },
  },
};

export async function execute(params, ctx) {
  const requestedModel = typeof params?.modelName === "string" ? params.modelName.trim() : "";
  const { publicPolicy, readPolicy, resolveModelChoice } = await loadModelPolicy();
  const configuredCatalog = await listConfiguredChatModels(ctx);
  const configuredDirect = configuredCatalog.ok
    ? configuredCatalog.models.find((entry) => entry.ref === requestedModel)
    : null;
  const result = configuredDirect
    ? { ok: true, model: configuredDirect.ref, source: "configured_chat_model", availability: "configured", policy: publicPolicy(readPolicy(ctx)) }
    : await resolveModelChoice(ctx, params || {});
  if (result.ok) {
    return {
      content: [{
        type: "text",
        text: [
          "SUBAGENT_MODEL_RESOLUTION",
          "ok: true",
          `model: ${result.model}`,
          `source: ${result.source}`,
          "Pass this exact model value to subagent.model. Hana will perform final availability validation when launching.",
        ].join("\n"),
      }],
      details: result,
    };
  }
  return {
    content: [{
      type: "text",
      text: [
        "SUBAGENT_MODEL_RESOLUTION",
        "ok: false",
        `reason: ${result.reason}`,
        "Ask the user again. Do not call subagent until resolution succeeds.",
      ].join("\n"),
    }],
    details: result,
  };
}
