function normalizeAgent(entry) {
  const id = typeof entry?.id === "string" ? entry.id.trim() : "";
  if (!id) return null;
  const name = typeof entry?.name === "string" && entry.name.trim() ? entry.name.trim() : id;
  return {
    id,
    name,
    identity: typeof entry?.identity === "string" ? entry.identity.trim() : "",
    isCurrent: entry?.isCurrent === true,
    isPrimary: entry?.isPrimary === true,
  };
}

export async function listConfiguredAgents(ctx) {
  if (typeof ctx?.bus?.request !== "function") {
    return { ok: false, agents: [], reason: "宿主未提供 Agent 目录读取能力。" };
  }
  try {
    const result = await ctx.bus.request("agent:list", {});
    const unique = new Map();
    for (const entry of Array.isArray(result?.agents) ? result.agents : []) {
      const agent = normalizeAgent(entry);
      if (agent && !unique.has(agent.id)) unique.set(agent.id, agent);
    }
    return {
      ok: true,
      agents: [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN") || a.id.localeCompare(b.id)),
    };
  } catch (error) {
    return { ok: false, agents: [], reason: `读取 Agent 目录失败：${error?.message || String(error)}` };
  }
}
