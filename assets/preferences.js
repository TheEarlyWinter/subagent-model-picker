const $ = (selector) => document.querySelector(selector);
const agentList = $("#agent-list");
const agentCatalogStatus = $("#agent-catalog-status");
const defaultInput = $("#default-model");
const modelCatalogStatus = $("#model-catalog-status");
const saveStatus = $("#save-status");

function api(path, init) {
  if (window.hana?.api?.fetch) return window.hana.api.fetch(path, init);

  // Direct iframe pages may not expose the SDK global. Use the host's
  // surface-session fallback for this plugin's own route API.
  const headers = new Headers(init?.headers || {});
  const surfaceSession = new URLSearchParams(window.location.search).get("pluginSurfaceSession");
  if (surfaceSession) headers.set("X-Hana-Plugin-Surface-Session", surfaceSession);
  return window.fetch(new URL(path, window.location.href), {
    ...init,
    headers,
    credentials: init?.credentials || "same-origin",
  });
}

function setStatus(message, state = "") {
  saveStatus.textContent = message;
  if (state) saveStatus.dataset.state = state;
  else delete saveStatus.dataset.state;
}

function modelOption(select, model, label) {
  const option = document.createElement("option");
  option.value = model.ref;
  option.textContent = label || `${model.name || model.id} · ${model.ref}`;
  select.append(option);
}

function renderDefaultModels(data) {
  const selected = data.defaultModel || "";
  const models = Array.isArray(data.configuredModels) ? data.configuredModels : [];
  defaultInput.replaceChildren();

  const askEveryTime = document.createElement("option");
  askEveryTime.value = "";
  askEveryTime.textContent = "不设置全局默认模型（没有专属配置时询问）";
  defaultInput.append(askEveryTime);
  for (const model of models) modelOption(defaultInput, model);

  if (selected && !models.some((model) => model.ref === selected)) {
    modelOption(defaultInput, { ref: selected }, `已保存但当前未列出：${selected}`);
  }
  defaultInput.value = selected;

  if (data.modelCatalogError) {
    defaultInput.disabled = true;
    modelCatalogStatus.textContent = `无法读取已配置的聊天模型：${data.modelCatalogError}`;
    return;
  }
  defaultInput.disabled = models.length === 0;
  modelCatalogStatus.textContent = models.length
    ? `已读取 ${models.length} 个当前配置的聊天模型。`
    : "当前没有已配置的聊天模型；请先在 Hana 的模型设置中添加模型。";
}

function renderAgentModels(data) {
  const agents = Array.isArray(data.agents) ? data.agents : [];
  const models = Array.isArray(data.configuredModels) ? data.configuredModels : [];
  const agentModels = data.agentModels && typeof data.agentModels === "object" ? data.agentModels : {};
  agentList.replaceChildren();

  for (const agent of agents) {
    const row = document.createElement("div");
    row.className = "agent-row";

    const identity = document.createElement("div");
    identity.className = "agent-identity";
    const name = document.createElement("strong");
    name.textContent = agent.name;
    const id = document.createElement("code");
    id.textContent = agent.id;
    identity.append(name, id);
    if (agent.identity) {
      const description = document.createElement("span");
      description.className = "agent-description";
      description.textContent = agent.identity;
      identity.append(description);
    }

    const select = document.createElement("select");
    select.className = "text-input agent-model";
    select.dataset.agentId = agent.id;
    select.disabled = Boolean(data.modelCatalogError) || models.length === 0;
    const fallback = document.createElement("option");
    fallback.value = "";
    fallback.textContent = "使用全局默认模型";
    select.append(fallback);
    for (const model of models) modelOption(select, model);

    const selected = agentModels[agent.id] || "";
    if (selected && !models.some((model) => model.ref === selected)) {
      modelOption(select, { ref: selected }, `已保存但当前未列出：${selected}`);
    }
    select.value = selected;
    row.append(identity, select);
    agentList.append(row);
  }

  if (data.agentCatalogError) {
    agentCatalogStatus.textContent = `无法读取已配置的 Agent：${data.agentCatalogError}`;
  } else if (agents.length) {
    agentCatalogStatus.textContent = `已读取 ${agents.length} 个 Agent。专属模型优先于全局默认模型。`;
  } else {
    agentCatalogStatus.textContent = "当前没有可配置的 Agent。";
  }
}

function collectPreferences() {
  const agentModels = {};
  for (const select of agentList.querySelectorAll(".agent-model")) {
    const agentId = select.dataset.agentId;
    const model = select.value.trim();
    if (agentId && model) agentModels[agentId] = model;
  }
  return { defaultModel: defaultInput.value.trim(), agentModels };
}

async function readJson(response) {
  const body = await response.json();
  if (!response.ok || body?.ok === false) throw new Error(body?.error || body?.reason || "请求失败");
  return body;
}

async function loadPreferences() {
  setStatus("正在读取偏好…");
  try {
    const data = await readJson(await api("model-preferences/api"));
    renderDefaultModels(data);
    renderAgentModels(data);
    setStatus("");
  } catch (error) {
    setStatus(error.message || String(error), "error");
  }
}

async function savePreferences() {
  setStatus("正在保存…");
  try {
    const data = await readJson(await api("model-preferences/api", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(collectPreferences()),
    }));
    renderDefaultModels(data);
    renderAgentModels(data);
    setStatus("已保存，下一次子代理派发会立刻使用新规则。", "success");
  } catch (error) {
    setStatus(error.message || String(error), "error");
  }
}

$("#save-preferences").addEventListener("click", savePreferences);
loadPreferences();
