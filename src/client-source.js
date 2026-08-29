/**
 * dsh-plugin-voice client 端：往 dsh 设置界面（settings.section slot）注册"语音"分区。
 *
 * 表单通过 host 的 /voice/api/settings 读写（与 /voice 测试页共用同一配置后端）。
 * 样式使用 dsh 设计系统变量（--dsw-alias-*），自动适配明暗主题。
 *
 * 参照 dsh-plugin-notify 的 client-source.js 结构，扩展 voice 特有配置：
 *   - 引擎选择（auto/volcano/windows-sapi）
 *   - 火山 API Key / 火山音色 / 大模型 / 音量
 *   - 5 场景文案模板（SAPI 兜底固定启用，不可关闭）
 */
const React = require("react");
const { useState, useEffect } = React;

/** dsh 设计系统变量（自动适配主题，不写死颜色） */
const DSW = (v) => `var(--dsw-alias-${v})`;

/** 插件版本号（构建时由 build.mjs 注入，与 package.json 同步） */
const PLUGIN_VERSION = typeof __VOICE_PLUGIN_VERSION__ !== "undefined" ? __VOICE_PLUGIN_VERSION__ : "dev";

/** 场景提示音可选列表：内置 WAV 预设（蜂鸣已移除，只用 WAV 音效） */
const SOUND_OPTIONS = [
  { value: "melodious", label: "WAV·悦耳" },
  { value: "bright", label: "WAV·明亮" },
  { value: "light", label: "WAV·轻快" },
  { value: "ding_ding", label: "WAV·叮叮" },
  { value: "gift", label: "WAV·礼物" },
  { value: "short", label: "WAV·短促" },
  { value: "sudden", label: "WAV·急促" },
  { value: "sudden_2", label: "WAV·急促2" },
  { value: "tactful", label: "WAV·委婉" },
];

/** 场景显示名（与文案模板顺序一致） */
const SCENE_NAMES = [
  { key: "task_start", label: "开始" },
  { key: "milestone", label: "关键点" },
  { key: "task_complete", label: "完成" },
  { key: "need_interaction", label: "呼叫" },
  { key: "task_error", label: "出错" },
];

/** 语音设置表单（嵌入 dsh 设置界面的分区） */
function VoiceSettingsSection() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [openScene, setOpenScene] = useState(false);
  const [openCloud, setOpenCloud] = useState(false);

  const load = async () => {
    try {
      const r = await fetch("/voice/api/settings");
      const d = await r.json();
      if (d.config) setCfg(d.config);
    } catch (e) { setMsg("读取失败: " + e.message); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      // 提交扁平 schema 字段（host 端会映射到 settings scope + config.json）
      const body = {
        defaultMode: cfg.defaultMode || "toast",
        engine: cfg.engine || "auto",
        callDelaySeconds: Number(cfg.callDelaySeconds) || 60,
        onTurnEnd: !!cfg.onTurnEnd,
        onTaskStart: cfg.onTaskStart !== false,
        onQuestion: cfg.onQuestion !== false,
        autoCall: !!cfg.autoCall,
        textClean: cfg.textClean !== false,
        maxTextLength: Number(cfg.maxTextLength) || 200,
        volume: Number(cfg.volume) >= 0 ? Number(cfg.volume) : 1.3,
        rate: Number(cfg.rate) >= 50 ? Number(cfg.rate) : 200,
        cloud: {
          apiKey: cfg.cloud?.apiKey || "",
          voice: cfg.cloud?.voice || "zh_female_daimengchuanmei_moon_bigtts",
          resourceId: cfg.cloud?.resourceId || "seed-tts-1.0",
          energyRate: Number(cfg.cloud?.energyRate) || 0,
          retries: Number(cfg.cloud?.retries) >= 0 ? Number(cfg.cloud?.retries) : 1,
          timeout: Number(cfg.cloud?.timeout) || 30000,
          pauseSentenceMs: Number(cfg.cloud?.pauseSentenceMs) || 400,
          pauseCommaMs: Number(cfg.cloud?.pauseCommaMs) || 200,
        },
        templates: cfg.templates || {},
        sceneSounds: cfg.sceneSounds || {},
      };
      const r = await fetch("/voice/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      setMsg(r.ok ? "已保存，立即生效" : ("保存失败: " + (d.error || r.status)));
    } catch (e) { setMsg("保存失败: " + e.message); }
    setSaving(false);
  };

  if (!cfg) {
    return React.createElement("div", { style: { color: DSW("label-tertiary"), fontSize: "13px", padding: "12px 0" } }, "加载中…");
  }

  /** 试听当前配置：用当前填写的音色/音量/语速播报一句验证 */
  const testCurrent = async () => {
    setMsg("");
    try {
      const voice = cfg.cloud?.voice || "zh_female_daimengchuanmei_moon_bigtts";
      const r = await fetch("/voice/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "这是当前配置的试听，验证音色和参数是否生效。",
          mode: "speak",
          scene: "task_complete",
          emotion: "happy",
          voice,
          rate: Number(cfg.rate) || 200,
          volume: Number(cfg.volume) >= 0 ? Number(cfg.volume) : 1.3,
        }),
      });
      const d = await r.json().catch(() => ({}));
      setMsg(r.ok ? "试听中…（" + voice + "）" : ("试听失败: " + (d.error || r.status)));
    } catch (e) { setMsg("试听失败: " + e.message); }
  };

  const set = (key, value) => setCfg((c) => ({ ...c, [key]: value }));
  const setCloud = (key, value) => setCfg((c) => ({ ...c, cloud: { ...(c.cloud || {}), [key]: value } }));
  const setTpl = (key, value) => setCfg((c) => ({ ...c, templates: { ...(c.templates || {}), [key]: value } }));
  const setSceneSound = (key, value) => setCfg((c) => ({ ...c, sceneSounds: { ...(c.sceneSounds || {}), [key]: value } }));

  const styles = {
    row: { display: "flex", alignItems: "center", gap: "10px", margin: "10px 0", fontSize: "13px" },
    label: { color: DSW("label-secondary"), width: "110px", flex: "none", fontSize: "12.5px" },
    input: { flex: "1", background: DSW("bg-module-platform"), border: "1px solid " + DSW("border-l2"), color: DSW("label-primary"), borderRadius: "8px", padding: "7px 10px", fontSize: "13px", outline: "none", maxWidth: "260px", fontFamily: DSW("font-family") },
    textarea: { width: "100%", background: DSW("bg-module-platform"), border: "1px solid " + DSW("border-l2"), color: DSW("label-primary"), borderRadius: "8px", padding: "8px 10px", fontSize: "12.5px", outline: "none", resize: "vertical", minHeight: "40px", marginTop: "4px", fontFamily: DSW("font-family") },
    tplLabel: { color: DSW("label-tertiary"), fontSize: "12px", marginTop: "14px" },
    switchRow: { display: "flex", alignItems: "center", gap: "10px", margin: "8px 0", fontSize: "13px" },
    switchLabel: { color: DSW("label-primary"), cursor: "pointer", fontSize: "12.5px" },
    sectionTitle: { color: DSW("label-secondary"), fontSize: "13px", fontWeight: 600, marginTop: "16px", marginBottom: "6px" },
    btn: { background: DSW("button-info-fill"), border: "none", color: "#fff", borderRadius: "8px", padding: "8px 22px", fontSize: "13px", cursor: "pointer", marginTop: "14px", fontWeight: 500 },
    msg: { color: DSW("label-secondary"), fontSize: "12px", marginTop: "8px", marginLeft: "10px" },
    hint: { color: DSW("label-tertiary"), fontSize: "11.5px", marginTop: "6px" },
    collapsible: { display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", userSelect: "none", marginTop: "16px", marginBottom: "6px" },
    caret: { color: DSW("label-tertiary"), fontSize: "10px", transition: "transform .15s", display: "inline-block" },
    caretOpen: { color: DSW("label-tertiary"), fontSize: "10px", transition: "transform .15s", display: "inline-block", transform: "rotate(90deg)" },
  };

  /** 可折叠小节标题：点击标题展开/收起子内容 */
  const CollapsibleSection = (props) =>
    React.createElement("div", null,
      React.createElement("div", { style: styles.collapsible, onClick: () => props.onToggle() },
        React.createElement("span", { style: props.open ? styles.caretOpen : styles.caret }, "▶"),
        React.createElement("span", { style: { color: DSW("label-secondary"), fontSize: "13px", fontWeight: 600 } }, props.title)),
      props.open ? React.createElement("div", null, props.children) : null);

  return React.createElement("div", null,

    React.createElement("div", { style: { display: "inline-flex", alignItems: "center", gap: "8px", padding: "4px 12px 4px 14px", borderRadius: "999px", border: "1px solid " + DSW("border-l2"), background: DSW("bg-layer-2"), fontSize: "12px", lineHeight: "18px", marginBottom: "10px" } },
      React.createElement("span", { style: { color: DSW("label-primary"), fontWeight: 600 } }, "DSH-语音助手"),
      React.createElement("span", { style: { padding: "1px 8px", borderRadius: "999px", background: "var(--dsw-alias-accent-soft, var(--dsw-alias-border-l2))", color: DSW("label-secondary"), fontVariantNumeric: "tabular-nums" } }, "v" + PLUGIN_VERSION)),

    React.createElement("div", { style: styles.sectionTitle }, "通知方式"),
    React.createElement("div", { style: styles.row },
      React.createElement("span", { style: styles.label }, "默认通知方式"),
      React.createElement("select", { style: styles.input, value: cfg.defaultMode || "toast", onChange: (e) => set("defaultMode", e.target.value) },
        React.createElement("option", { value: "toast" }, "桌面通知"),
        React.createElement("option", { value: "speak" }, "语音播报"),
        React.createElement("option", { value: "sound" }, "提示音"),
        React.createElement("option", { value: "both" }, "语音 + 桌面"))),

    React.createElement("div", { style: styles.sectionTitle }, "语音引擎"),
    React.createElement("div", { style: styles.row },
      React.createElement("span", { style: styles.label }, "引擎"),
      React.createElement("select", { style: styles.input, value: cfg.engine || "auto", onChange: (e) => set("engine", e.target.value) },
        React.createElement("option", { value: "auto" }, "auto（有火山 Key 用火山，否则 SAPI）"),
        React.createElement("option", { value: "volcano" }, "volcano（火山 seed-tts，高音质）"),
        React.createElement("option", { value: "windows-sapi" }, "windows-sapi（离线，机械音）"))),

    React.createElement("div", { style: styles.row },
      React.createElement("span", { style: styles.label }, "火山 API Key"),
      React.createElement("input", { type: "password", style: styles.input, value: cfg.cloud?.apiKey || "", placeholder: "火山引擎 X-Api-Key", onChange: (e) => setCloud("apiKey", e.target.value) })),
    React.createElement("div", { style: styles.row },
      React.createElement("span", { style: styles.label }, "火山音色"),
      React.createElement("input", { type: "text", style: styles.input, value: cfg.cloud?.voice || "", onChange: (e) => setCloud("voice", e.target.value) })),
    React.createElement("div", { style: styles.hint }, "音色需与所选大模型版本匹配"),
    React.createElement("div", { style: styles.row },
      React.createElement("span", { style: styles.label }, "大模型"),
      React.createElement("select", { style: styles.input, value: cfg.cloud?.resourceId || "seed-tts-1.0", onChange: (e) => setCloud("resourceId", e.target.value) },
        React.createElement("option", { value: "seed-tts-1.0" }, "seed-tts-1.0"),
        React.createElement("option", { value: "seed-tts-2.0" }, "seed-tts-2.0"))),
    React.createElement("div", { style: styles.row },
      React.createElement("span", { style: styles.label }, "音量"),
      React.createElement("input", { type: "number", min: 0.5, max: 2, step: 0.1, style: styles.input, value: cfg.volume ?? 1.3, onChange: (e) => set("volume", Number(e.target.value) || 1.3) })),
    React.createElement("div", { style: styles.hint }, "0.5-2.0，默认 1.3（+30%）"),
    React.createElement("div", { style: styles.row },
      React.createElement("span", { style: styles.label }, "语速"),
      React.createElement("input", { type: "number", min: 50, max: 300, step: 10, style: styles.input, value: cfg.rate ?? 200, onChange: (e) => set("rate", Number(e.target.value) || 200) })),
    React.createElement("div", { style: styles.hint }, "50-300，默认 200"),

    React.createElement("div", { style: styles.sectionTitle }, "文案模板（模型不写 message 时使用；支持 {{summary}}）"),
    React.createElement("div", { style: { color: DSW("label-tertiary"), fontSize: "12px", marginBottom: "4px" } }, "开始"),
    React.createElement("textarea", { style: styles.textarea, value: cfg.templates?.task_start || "", placeholder: "开始执行任务", onChange: (e) => setTpl("task_start", e.target.value) }),
    React.createElement("div", { style: { color: DSW("label-tertiary"), fontSize: "12px", marginTop: "8px", marginBottom: "4px" } }, "关键点"),
    React.createElement("textarea", { style: styles.textarea, value: cfg.templates?.milestone || "", placeholder: "我已跨过最高的山，后面都是小打小闹", onChange: (e) => setTpl("milestone", e.target.value) }),
    React.createElement("div", { style: { color: DSW("label-tertiary"), fontSize: "12px", marginTop: "8px", marginBottom: "4px" } }, "完成"),
    React.createElement("textarea", { style: styles.textarea, value: cfg.templates?.task_complete || "", placeholder: "任务已经完成了，快来看看结果了", onChange: (e) => setTpl("task_complete", e.target.value) }),
    React.createElement("div", { style: { color: DSW("label-tertiary"), fontSize: "12px", marginTop: "8px", marginBottom: "4px" } }, "呼叫"),
    React.createElement("textarea", { style: styles.textarea, value: cfg.templates?.need_interaction || "", placeholder: "我需要你过来看看了", onChange: (e) => setTpl("need_interaction", e.target.value) }),
    React.createElement("div", { style: { color: DSW("label-tertiary"), fontSize: "12px", marginTop: "8px", marginBottom: "4px" } }, "出错"),
    React.createElement("textarea", { style: styles.textarea, value: cfg.templates?.task_error || "", placeholder: "任务出错了，需要你处理一下子", onChange: (e) => setTpl("task_error", e.target.value) }),

    React.createElement("div", { style: styles.row },
      React.createElement("button", { style: styles.btn, onClick: testCurrent }, "试听当前音色"),
      React.createElement("span", { style: styles.msg }, "验证音色/模型/音量/语速")),
    React.createElement("div", { style: styles.hint }, "需先保存火山 Key 且音色已开通对应资源"),

    React.createElement("div", { style: styles.sectionTitle }, "呼叫与蓝牙"),
    React.createElement("div", { style: styles.row },
      React.createElement("span", { style: styles.label }, "确认窗口（秒）"),
      React.createElement("input", { type: "number", min: 5, max: 600, style: styles.input, value: cfg.callDelaySeconds ?? 60, onChange: (e) => set("callDelaySeconds", Number(e.target.value) || 60) })),
    React.createElement("div", { style: styles.switchRow },
      React.createElement("input", { type: "checkbox", id: "vc-turend", checked: !!cfg.onTurnEnd, onChange: (e) => set("onTurnEnd", e.target.checked) }),
      React.createElement("label", { htmlFor: "vc-turend", style: styles.switchLabel }, "回合结束自动通知")),
    React.createElement("div", { style: styles.hint }, "任务答完弹通知 → 等 N 秒：期间你有操作＝人在，不打扰；无操作＝人不在，语音叫你回来"),
    React.createElement("div", { style: styles.switchRow },
      React.createElement("input", { type: "checkbox", id: "vc-taskstart", checked: cfg.onTaskStart !== false, onChange: (e) => set("onTaskStart", e.target.checked) }),
      React.createElement("label", { htmlFor: "vc-taskstart", style: styles.switchLabel }, "新任务自动播报「开始」语音")),
    React.createElement("div", { style: styles.switchRow },
      React.createElement("input", { type: "checkbox", id: "vc-question", checked: cfg.onQuestion !== false, onChange: (e) => set("onQuestion", e.target.checked) }),
      React.createElement("label", { htmlFor: "vc-question", style: styles.switchLabel }, "agent 提问等待过久且你离开时播报「呼叫」")),
    React.createElement("div", { style: styles.hint }, "提问需你确认时：你已离开 → 3 秒后立即呼叫；你在场 → 等 N 秒未答再叫；回答后自动取消"),
    React.createElement("div", { style: styles.switchRow },
      React.createElement("input", { type: "checkbox", id: "vc-autocall", checked: !!cfg.autoCall, onChange: (e) => set("autoCall", e.target.checked) }),
      React.createElement("label", { htmlFor: "vc-autocall", style: styles.switchLabel }, "N秒没人确认就播放「完成」语音叫我回来")),

    CollapsibleSection({ title: "场景提示音（播报前先响一声，音量已 +100%）", open: openScene, onToggle: () => setOpenScene((v) => !v), children: [
      React.createElement("div", { style: styles.hint }, "各场景独立选 WAV 音效，自动放大音量防削波"),
      SCENE_NAMES.map((s) =>
        React.createElement("div", { key: "sound-" + s.key, style: styles.row },
          React.createElement("span", { style: styles.label }, s.label + "提示音"),
          React.createElement("select", { style: styles.input, value: cfg.sceneSounds?.[s.key] || "", onChange: (e) => setSceneSound(s.key, e.target.value) },
            React.createElement("option", { value: "" }, "（跟随默认）"),
            SOUND_OPTIONS.map((o) => React.createElement("option", { key: o.value, value: o.value }, o.label))))) ] }),

    CollapsibleSection({ title: "云端音质（高级）", open: openCloud, onToggle: () => setOpenCloud((v) => !v), children: [
      React.createElement("div", { style: styles.row },
        React.createElement("span", { style: styles.label }, "能量增益"),
        React.createElement("input", { type: "number", min: -50, max: 100, style: styles.input, value: cfg.cloud?.energyRate ?? 0, onChange: (e) => setCloud("energyRate", Number(e.target.value) || 0) })),
      React.createElement("div", { style: styles.hint }, "提升响度感知（0=默认），大音量用户不用改"),
      React.createElement("div", { style: styles.row },
        React.createElement("span", { style: styles.label }, "网络重试"),
        React.createElement("input", { type: "number", min: 0, max: 5, style: styles.input, value: cfg.cloud?.retries ?? 1, onChange: (e) => setCloud("retries", Number(e.target.value) || 0) })),
      React.createElement("div", { style: styles.row },
        React.createElement("span", { style: styles.label }, "句间停顿(ms)"),
        React.createElement("input", { type: "number", min: 0, max: 2000, style: styles.input, value: cfg.cloud?.pauseSentenceMs ?? 400, onChange: (e) => setCloud("pauseSentenceMs", Number(e.target.value) || 0) })),
      React.createElement("div", { style: styles.row },
        React.createElement("span", { style: styles.label }, "逗号停顿(ms)"),
        React.createElement("input", { type: "number", min: 0, max: 2000, style: styles.input, value: cfg.cloud?.pauseCommaMs ?? 200, onChange: (e) => setCloud("pauseCommaMs", Number(e.target.value) || 0) })) ] }),

    React.createElement("div", null,
      React.createElement("button", { style: styles.btn, disabled: saving, onClick: save }, saving ? "保存中…" : "保存设置"),
      React.createElement("span", { style: styles.msg }, msg)),
    React.createElement("div", { style: styles.hint }, "保存写入 settings.yaml 的 voice 分区，立即生效。调用命令： /voice"));
}

const name = "dsh-plugin-voice";
const inject = ["slots"];

function apply(ctx) {
  ctx.effect(() =>
    ctx.slots.inject("settings.section", () =>
      ctx.slots.register(
        { name: "settings.section", id: "voice", order: 110, label: "语音" },
        VoiceSettingsSection,
      )));
}

module.exports = { name, inject, apply };
