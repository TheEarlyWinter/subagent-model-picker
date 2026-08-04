export default class SubagentModelPickerPlugin {
  async onload() {
    this.ctx.log.info("[subagent-model-picker] active: subagent launches require an explicit model");
  }
}
