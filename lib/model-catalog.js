const MODEL_REF_RE = /^[^/\s]+\/[^/\s]+$/;

function normalizeModelRef(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return MODEL_REF_RE.test(text) ? text : null;
}

export async function listConfiguredChatModels(ctx) {
  if (typeof ctx?.bus?.request !== "function") {
    return { ok: false, models: [], reason: "宿主未提供模型目录读取能力。" };
  }
  try {
    const result = await ctx.bus.request("provider:models-by-type", { type: "chat" });
    const unique = new Map();
    for (const entry of Array.isArray(result?.models) ? result.models : []) {
      const provider = typeof entry?.provider === "string" ? entry.provider.trim() : "";
      const id = typeof entry?.id === "string" ? entry.id.trim() : "";
      const ref = normalizeModelRef(`${provider}/${id}`);
      if (!ref || unique.has(ref)) continue;
      unique.set(ref, {
        ref,
        provider,
        id,
        name: typeof entry?.name === "string" && entry.name.trim() ? entry.name.trim() : id,
      });
    }
    return {
      ok: true,
      models: [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN") || a.ref.localeCompare(b.ref)),
    };
  } catch (error) {
    return { ok: false, models: [], reason: `读取已配置聊天模型失败：${error?.message || String(error)}` };
  }
}
