import { listConfiguredChatModels } from "./model-catalog.js";

const MODEL_REF_RE = /^[^/\s]+\/[^/\s]+$/;
const DEFAULT_WORDS = new Set(["默认", "default", "随便", "你定", "auto"]);

export function normalizeModelRef(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return MODEL_REF_RE.test(text) ? text : null;
}

function normalizeAgentModels(value) {
  const mappings = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return mappings;
  for (const [rawAgentId, rawModel] of Object.entries(value)) {
    const agentId = typeof rawAgentId === "string" ? rawAgentId.trim() : "";
    const model = normalizeModelRef(rawModel);
    if (agentId && model) mappings[agentId] = model;
  }
  return mappings;
}

function targetAgentId(ctx, requestedAgentId) {
  if (typeof requestedAgentId === "string" && requestedAgentId.trim()) return requestedAgentId.trim();
  if (typeof ctx?.agentId === "string" && ctx.agentId.trim()) return ctx.agentId.trim();
  return null;
}

export function readPolicy(ctx) {
  return {
    configuredDefault: normalizeModelRef(ctx.config?.get?.("defaultModel")),
    agentModels: normalizeAgentModels(ctx.config?.get?.("agentModels")),
  };
}

export function publicPolicy(policy) {
  return {
    defaultModel: policy.configuredDefault || null,
    agentModels: { ...policy.agentModels },
  };
}

export { listConfiguredChatModels } from "./model-catalog.js";

export function resolveConfiguredPreference(ctx, policy, requestedAgentId) {
  const agentId = targetAgentId(ctx, requestedAgentId);
  const agentModel = agentId ? policy.agentModels[agentId] : null;
  if (agentModel) {
    return { ok: true, model: agentModel, source: "agent_preference", agentId };
  }
  if (policy.configuredDefault) {
    return { ok: true, model: policy.configuredDefault, source: "configured_default", agentId };
  }
  return {
    ok: false,
    reason: agentId
      ? `agent ${agentId} 尚未设置专属模型，且没有全局默认模型。`
      : "无法确定目标 agent，且没有全局默认模型。",
    agentId,
  };
}

export async function resolveModelChoice(ctx, { modelName, agentId } = {}) {
  const raw = typeof modelName === "string" ? modelName.trim() : "";
  const policy = readPolicy(ctx);
  const normalized = raw.toLocaleLowerCase("zh-CN");

  if (!raw || DEFAULT_WORDS.has(normalized)) {
    const resolved = resolveConfiguredPreference(ctx, policy, agentId);
    return resolved.ok
      ? { ...resolved, availability: "not_checked", policy: publicPolicy(policy) }
      : { ...resolved, policy: publicPolicy(policy) };
  }

  const direct = normalizeModelRef(raw);
  if (!direct) {
    return {
      ok: false,
      reason: `未识别模型“${raw}”。请从“子代理模型”页面的已配置聊天模型中选择，或提供精确的 provider/id。`,
      policy: publicPolicy(policy),
    };
  }

  const configured = await listConfiguredChatModels(ctx);
  const trustedModels = new Set([
    policy.configuredDefault,
    ...Object.values(policy.agentModels),
  ].filter(Boolean));
  if (configured.ok) {
    for (const entry of configured.models) trustedModels.add(entry.ref);
  }
  if (trustedModels.has(direct)) {
    const isConfigured = configured.models.some((entry) => entry.ref === direct);
    return {
      ok: true,
      model: direct,
      source: isConfigured ? "configured_chat_model" : "saved_preference",
      availability: isConfigured ? "configured" : "not_checked",
      policy: publicPolicy(policy),
    };
  }
  return {
    ok: false,
    reason: configured.ok
      ? `“${direct}”格式正确，但不在已配置聊天模型或已保存的 agent 模型偏好中。请从“子代理模型”页面选择它。`
      : `“${direct}”格式正确，但当前无法读取模型目录，且它不在已保存的模型偏好中。`,
    policy: publicPolicy(policy),
  };
}

export function validatePreferences(input = {}) {
  const defaultModelRaw = typeof input.defaultModel === "string" ? input.defaultModel.trim() : "";
  const defaultModel = defaultModelRaw ? normalizeModelRef(defaultModelRaw) : "";
  if (defaultModelRaw && !defaultModel) {
    return { ok: false, error: "全局默认模型必须是 provider/id 格式，或留空。" };
  }

  const agentModels = {};
  const rawAgentModels = input.agentModels && typeof input.agentModels === "object" && !Array.isArray(input.agentModels)
    ? input.agentModels
    : {};
  for (const [rawAgentId, rawModel] of Object.entries(rawAgentModels)) {
    const agentId = typeof rawAgentId === "string" ? rawAgentId.trim() : "";
    const modelRaw = typeof rawModel === "string" ? rawModel.trim() : "";
    const model = modelRaw ? normalizeModelRef(modelRaw) : "";
    if (!agentId) return { ok: false, error: "Agent id 不能为空。" };
    if (modelRaw && !model) return { ok: false, error: `Agent “${agentId}”的模型必须是 provider/id 格式。` };
    if (model) agentModels[agentId] = model;
  }
  return { ok: true, value: { defaultModel, agentModels } };
}
