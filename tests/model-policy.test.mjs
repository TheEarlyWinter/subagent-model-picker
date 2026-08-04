import assert from "node:assert/strict";
import { execute as modelOptions } from "../tools/model-options.js";
import registerPreferencesRoutes from "../routes/preferences.js";
import { listConfiguredAgents } from "../lib/agent-catalog.js";
import { listConfiguredChatModels } from "../lib/model-catalog.js";
import { resolveModelChoice, validatePreferences } from "../lib/model-policy.js";
import requireExplicitSubagentModel from "../extensions/require-explicit-model.js";

const DEFAULT = "opencode-go/deepseek-v4-flash";
const ALTERNATIVE = "opencode-go/gpt-5.6-luna";
const TERTIARY = "sub/gpt-5.6-terra";
const config = {
  defaultModel: DEFAULT,
  agentModels: {
    hanako: ALTERNATIVE,
    cixiaogui: TERTIARY,
  },
};

const ctx = {
  agentId: "hanako",
  config: {
    get(key) { return config[key]; },
    setMany(values) { Object.assign(config, values); },
  },
  bus: {
    async request(type, payload) {
      if (type === "agent:list") {
        assert.deepEqual(payload, {});
        return {
          agents: [
            { id: "hanako", name: "小鲸鱼", identity: "温柔大姐姐" },
            { id: "cixiaogui", name: "星见凛", identity: "科学部副部长" },
            { id: "kefuxiaoxiang", name: "客服小祥", identity: "分析型助手" },
          ],
        };
      }
      if (type === "provider:models-by-type") {
        assert.deepEqual(payload, { type: "chat" });
        return {
          models: [
            { provider: "opencode-go", id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
            { provider: "opencode-go", id: "gpt-5.6-luna", name: "GPT 5.6 Luna" },
            { provider: "sub", id: "gpt-5.6-terra", name: "GPT 5.6 Terra" },
          ],
        };
      }
      throw new Error(`Unexpected bus request: ${type}`);
    },
  },
};

const agentPreference = await modelOptions({ agentId: "hanako" }, ctx);
assert.equal(agentPreference.details.action, "use_agent_preference");
assert.equal(agentPreference.details.model, ALTERNATIVE);
assert.equal(agentPreference.details.agentId, "hanako");

const otherAgentPreference = await modelOptions({ agentId: "cixiaogui" }, ctx);
assert.equal(otherAgentPreference.details.action, "use_agent_preference");
assert.equal(otherAgentPreference.details.model, TERTIARY);

const globalFallback = await modelOptions({ agentId: "kefuxiaoxiang" }, ctx);
assert.equal(globalFallback.details.action, "use_configured_default");
assert.equal(globalFallback.details.model, DEFAULT);

const explicit = await modelOptions({ requestedModelName: ALTERNATIVE, agentId: "cixiaogui" }, ctx);
assert.equal(explicit.details.action, "use_requested_model");
assert.equal(explicit.details.model, ALTERNATIVE);
assert.match(explicit.content[0].text, /use_requested_model/);

const defaultChoice = await resolveModelChoice(ctx, { modelName: "默认", agentId: "cixiaogui" });
assert.equal(defaultChoice.ok, true);
assert.equal(defaultChoice.model, TERTIARY);
assert.equal(defaultChoice.source, "agent_preference");

const configuredModels = await listConfiguredChatModels(ctx);
assert.equal(configuredModels.ok, true);
assert.deepEqual(configuredModels.models.map((entry) => entry.ref), [DEFAULT, ALTERNATIVE, TERTIARY]);

const configuredAgents = await listConfiguredAgents(ctx);
assert.equal(configuredAgents.ok, true);
assert.deepEqual(configuredAgents.agents.map((entry) => entry.id).sort(), ["cixiaogui", "hanako", "kefuxiaoxiang"]);

const directConfigured = await resolveModelChoice(ctx, { modelName: ALTERNATIVE, agentId: "hanako" });
assert.equal(directConfigured.ok, true);
assert.equal(directConfigured.source, "configured_chat_model");
assert.equal(directConfigured.availability, "configured");

const unknown = await resolveModelChoice(ctx, { modelName: "other/model", agentId: "hanako" });
assert.equal(unknown.ok, false);
assert.match(unknown.reason, /不在已配置聊天模型/);

assert.equal(validatePreferences({ defaultModel: "bad-ref", agentModels: {} }).ok, false);
assert.equal(validatePreferences({ defaultModel: DEFAULT, agentModels: { hanako: "bad-ref" } }).ok, false);
assert.deepEqual(
  validatePreferences({ defaultModel: DEFAULT, agentModels: { hanako: ALTERNATIVE } }).value,
  { defaultModel: DEFAULT, agentModels: { hanako: ALTERNATIVE } },
);

const routes = new Map();
const app = {
  get(path, handler) { routes.set(`GET ${path}`, handler); },
  put(path, handler) { routes.set(`PUT ${path}`, handler); },
  post(path, handler) { routes.set(`POST ${path}`, handler); },
};
registerPreferencesRoutes(app, { ...ctx, pluginId: "subagent-model-picker" });
const page = routes.get("GET /model-preferences")({
  req: { url: "http://plugin/model-preferences" },
  html: (body) => body,
});
assert.match(page, /<style>/);
assert.match(page, /source:"hana-plugin",type:"ready"/);
assert.match(page, /X-Hana-Plugin-Surface-Session/);
assert.match(page, /Agent 专属模型/);
assert.doesNotMatch(page, /模型别名/);
assert.doesNotMatch(page, /测试解析/);
assert.doesNotMatch(page, /assets\/preferences\.js/);
assert.equal(routes.has("POST /model-preferences/resolve"), false);

const catalogResponse = await routes.get("GET /model-preferences/api")({ json: (body) => body });
assert.equal(catalogResponse.ok, true);
assert.deepEqual(catalogResponse.configuredModels.map((entry) => entry.ref), [DEFAULT, ALTERNATIVE, TERTIARY]);
assert.deepEqual(catalogResponse.agents.map((entry) => entry.id).sort(), ["cixiaogui", "hanako", "kefuxiaoxiang"]);

const rejectedPreference = await routes.get("PUT /model-preferences/api")({
  req: { json: async () => ({ defaultModel: DEFAULT, agentModels: { hanako: "other/model" } }) },
  json: (body) => body,
});
assert.match(rejectedPreference.error, /不在当前已配置的聊天模型/);

const savedPreference = await routes.get("PUT /model-preferences/api")({
  req: { json: async () => ({ defaultModel: "", agentModels: { kefuxiaoxiang: TERTIARY } }) },
  json: (body) => body,
});
assert.equal(savedPreference.ok, true);
assert.deepEqual(config.agentModels, { kefuxiaoxiang: TERTIARY });

let handler;
requireExplicitSubagentModel({ on(type, callback) { if (type === "tool_call") handler = callback; } });
assert.equal((await handler({ toolName: "subagent", input: {} })).block, true);
assert.equal(await handler({ toolName: "subagent", input: { model: DEFAULT } }), undefined);
assert.equal((await handler({ toolName: "subagent", input: { model: "invalid" } })).block, true);
assert.equal(await handler({ toolName: "subagent", input: { agent: "?" } }), undefined);
assert.equal(await handler({ toolName: "subagent", input: { agent: "list" } }), undefined);

console.log("subagent-model-picker policy tests passed");
