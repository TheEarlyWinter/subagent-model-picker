import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listConfiguredAgents } from "../lib/agent-catalog.js";
import { listConfiguredChatModels } from "../lib/model-catalog.js";
import { loadModelPolicy } from "../lib/policy-loader.js";

const ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets");
const PREFERENCES_CSS = fs.readFileSync(path.join(ASSETS_DIR, "preferences.css"), "utf8");
const PREFERENCES_JS = fs.readFileSync(path.join(ASSETS_DIR, "preferences.js"), "utf8");

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pageHtml(ctx, request) {
  const query = new URL(request.url).searchParams;
  const themeCss = query.get("hana-css");
  const themeTone = query.get("hana-theme") || "inherit";
  const themeLink = themeCss ? `<link rel="stylesheet" href="${escapeHtml(themeCss)}">` : "";
  return `<!doctype html>
<html lang="zh-CN" data-hana-theme="${escapeHtml(themeTone)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${themeLink}
  <style>${PREFERENCES_CSS}</style>
  <title>子代理模型</title>
</head>
<body>
  <script>window.parent.postMessage({source:"hana-plugin",type:"ready"},"*");</script>
  <main class="settings-shell">
    <header class="page-header">
      <div>
        <p class="eyebrow">SUBAGENT MODEL POLICY</p>
        <h1>子代理模型</h1>
        <p class="lede">为不同的子代理 agent 设置模型。派发时会优先使用该 agent 的专属配置。</p>
      </div>
      <span class="status-pill">规则已加载</span>
    </header>
    <p class="activation-note">拦截扩展只会绑定到本次 reload 之后新建的会话；当前已打开的会话不会立即接管，请在新会话中使用。</p>

    <section class="settings-section" aria-labelledby="agent-heading">
      <div class="section-heading">
        <h2 id="agent-heading">Agent 专属模型</h2>
        <p>Agent 被作为子代理派出时，优先使用此处选择的模型。留空则回退到下方的全局默认模型。</p>
      </div>
      <div id="agent-list" class="agent-list" aria-live="polite"></div>
      <p id="agent-catalog-status" class="hint">正在读取已配置的 Agent…</p>
    </section>

    <section class="settings-section" aria-labelledby="default-heading">
      <div class="section-heading">
        <h2 id="default-heading">全局默认模型</h2>
        <p>当目标 agent 没有专属配置时使用。留空则助手会在派发前询问你。</p>
      </div>
      <label class="field-label" for="default-model">已配置的聊天模型</label>
      <select id="default-model" class="text-input" disabled aria-describedby="model-catalog-status">
        <option value="">正在读取已配置模型…</option>
      </select>
      <p id="model-catalog-status" class="hint">模型列表来自 Hana 当前 Provider 配置。</p>
    </section>

    <footer class="page-footer">
      <span id="save-status" role="status"></span>
      <button id="save-preferences" class="primary-button" type="button">保存偏好</button>
    </footer>
  </main>
  <script>${PREFERENCES_JS}</script>
</body>
</html>`;
}

async function preferenceState(ctx) {
  const { publicPolicy, readPolicy } = await loadModelPolicy();
  const policy = readPolicy(ctx);
  const [configuredModels, configuredAgents] = await Promise.all([
    listConfiguredChatModels(ctx),
    listConfiguredAgents(ctx),
  ]);
  return {
    ...publicPolicy(policy),
    configuredModels: configuredModels.models,
    modelCatalogError: configuredModels.ok ? null : configuredModels.reason,
    agents: configuredAgents.agents,
    agentCatalogError: configuredAgents.ok ? null : configuredAgents.reason,
  };
}

export default function registerPreferencesRoutes(app, ctx) {
  app.get("/model-preferences", (c) => c.html(pageHtml(ctx, c.req)));

  app.get("/model-preferences/api", async (c) => {
    return c.json({ ok: true, ...(await preferenceState(ctx)) });
  });

  app.put("/model-preferences/api", async (c) => {
    let payload;
    try {
      payload = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "请求体必须是 JSON。" }, 400);
    }
    const { validatePreferences } = await loadModelPolicy();
    const validated = validatePreferences(payload);
    if (!validated.ok) return c.json(validated, 400);

    const configuredModels = await listConfiguredChatModels(ctx);
    const selectedModels = [
      validated.value.defaultModel,
      ...Object.values(validated.value.agentModels),
    ].filter(Boolean);
    if (configuredModels.ok) {
      const available = new Set(configuredModels.models.map((entry) => entry.ref));
      const missing = selectedModels.find((model) => !available.has(model));
      if (missing) {
        return c.json({ ok: false, error: `模型 ${missing} 不在当前已配置的聊天模型中。` }, 400);
      }
    }

    try {
      ctx.config.setMany(validated.value);
      return c.json({ ok: true, ...(await preferenceState(ctx)) });
    } catch (error) {
      return c.json({ ok: false, error: error?.message || String(error) }, 400);
    }
  });
}
