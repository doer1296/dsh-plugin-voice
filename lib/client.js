window.__ModuleLoader__.load({ id: "dsh-plugin-voice", factory: (require) => { var module = { exports: {} }; var exports = module.exports; Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

// src/client-source.js
var React = require("react");
var { useState, useEffect } = React;
var DSW = (v) => `var(--dsw-alias-${v})`;
var PLUGIN_VERSION = true ? "0.2.4" : "dev";
var SOUND_OPTIONS = [
  { value: "melodious", label: "WAV\xB7\u60A6\u8033" },
  { value: "bright", label: "WAV\xB7\u660E\u4EAE" },
  { value: "light", label: "WAV\xB7\u8F7B\u5FEB" },
  { value: "ding_ding", label: "WAV\xB7\u53EE\u53EE" },
  { value: "gift", label: "WAV\xB7\u793C\u7269" },
  { value: "short", label: "WAV\xB7\u77ED\u4FC3" },
  { value: "sudden", label: "WAV\xB7\u6025\u4FC3" },
  { value: "sudden_2", label: "WAV\xB7\u6025\u4FC32" },
  { value: "tactful", label: "WAV\xB7\u59D4\u5A49" }
];
var SCENE_NAMES = [
  { key: "task_start", label: "\u5F00\u59CB" },
  { key: "milestone", label: "\u5173\u952E\u70B9" },
  { key: "task_complete", label: "\u5B8C\u6210" },
  { key: "need_interaction", label: "\u547C\u53EB" },
  { key: "task_error", label: "\u51FA\u9519" }
];
function VoiceSettingsSection() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [openScene, setOpenScene] = useState(false);
  const [openCloud, setOpenCloud] = useState(false);
  const [openMimo, setOpenMimo] = useState(true);
  const [openVolcano, setOpenVolcano] = useState(false);
  const load = async () => {
    try {
      const r = await fetch("/voice/api/settings");
      const d = await r.json();
      if (d.config) setCfg(d.config);
    } catch (e) {
      setMsg("\u8BFB\u53D6\u5931\u8D25: " + e.message);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
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
          timeout: Number(cfg.cloud?.timeout) || 3e4,
          pauseSentenceMs: Number(cfg.cloud?.pauseSentenceMs) || 400,
          pauseCommaMs: Number(cfg.cloud?.pauseCommaMs) || 200
        },
        mimo: {
          apiKey: cfg.mimo?.apiKey || "",
          voice: cfg.mimo?.voice || "mimo_default"
        },
        templates: cfg.templates || {},
        sceneSounds: cfg.sceneSounds || {}
      };
      const r = await fetch("/voice/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const d = await r.json().catch(() => ({}));
      setMsg(r.ok ? "\u5DF2\u4FDD\u5B58\uFF0C\u7ACB\u5373\u751F\u6548" : "\u4FDD\u5B58\u5931\u8D25: " + (d.error || r.status));
    } catch (e) {
      setMsg("\u4FDD\u5B58\u5931\u8D25: " + e.message);
    }
    setSaving(false);
  };
  if (!cfg) {
    return React.createElement("div", { style: { color: DSW("label-tertiary"), fontSize: "13px", padding: "12px 0" } }, "\u52A0\u8F7D\u4E2D\u2026");
  }
  const testCurrent = async () => {
    setMsg("");
    try {
      const useMimo = cfg.engine === "mimo" || cfg.engine === "auto" && cfg.mimo?.apiKey;
      const voice = useMimo ? cfg.mimo?.voice || "mimo_default" : cfg.cloud?.voice || "zh_female_daimengchuanmei_moon_bigtts";
      const r = await fetch("/voice/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "\u8FD9\u662F\u5F53\u524D\u914D\u7F6E\u7684\u8BD5\u542C\uFF0C\u9A8C\u8BC1\u97F3\u8272\u548C\u53C2\u6570\u662F\u5426\u751F\u6548\u3002",
          mode: "speak",
          scene: "task_complete",
          emotion: "happy",
          voice,
          rate: Number(cfg.rate) || 200,
          volume: Number(cfg.volume) >= 0 ? Number(cfg.volume) : 1.3
        })
      });
      const d = await r.json().catch(() => ({}));
      setMsg(r.ok ? "\u8BD5\u542C\u4E2D\u2026\uFF08" + voice + "\uFF09" : "\u8BD5\u542C\u5931\u8D25: " + (d.error || r.status));
    } catch (e) {
      setMsg("\u8BD5\u542C\u5931\u8D25: " + e.message);
    }
  };
  const set = (key, value) => setCfg((c) => ({ ...c, [key]: value }));
  const setCloud = (key, value) => setCfg((c) => ({ ...c, cloud: { ...c.cloud || {}, [key]: value } }));
  const setMimo = (key, value) => setCfg((c) => ({ ...c, mimo: { ...c.mimo || {}, [key]: value } }));
  const setTpl = (key, value) => setCfg((c) => ({ ...c, templates: { ...c.templates || {}, [key]: value } }));
  const setSceneSound = (key, value) => setCfg((c) => ({ ...c, sceneSounds: { ...c.sceneSounds || {}, [key]: value } }));
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
    caretOpen: { color: DSW("label-tertiary"), fontSize: "10px", transition: "transform .15s", display: "inline-block", transform: "rotate(90deg)" }
  };
  const CollapsibleSection = (props) => React.createElement(
    "div",
    null,
    React.createElement(
      "div",
      { style: styles.collapsible, onClick: () => props.onToggle() },
      React.createElement("span", { style: props.open ? styles.caretOpen : styles.caret }, "\u25B6"),
      React.createElement("span", { style: { color: DSW("label-secondary"), fontSize: "13px", fontWeight: 600 } }, props.title)
    ),
    props.open ? React.createElement("div", null, props.children) : null
  );
  return React.createElement(
    "div",
    null,
    React.createElement(
      "div",
      { style: { display: "inline-flex", alignItems: "center", gap: "8px", padding: "4px 12px 4px 14px", borderRadius: "999px", border: "1px solid " + DSW("border-l2"), background: DSW("bg-layer-2"), fontSize: "12px", lineHeight: "18px", marginBottom: "10px" } },
      React.createElement("span", { style: { color: DSW("label-primary"), fontWeight: 600 } }, "DSH-\u8BED\u97F3\u52A9\u624B"),
      React.createElement("span", { style: { padding: "1px 8px", borderRadius: "999px", background: "var(--dsw-alias-accent-soft, var(--dsw-alias-border-l2))", color: DSW("label-secondary"), fontVariantNumeric: "tabular-nums" } }, "v" + PLUGIN_VERSION)
    ),
    React.createElement("div", { style: styles.sectionTitle }, "\u901A\u77E5\u65B9\u5F0F"),
    React.createElement(
      "div",
      { style: styles.row },
      React.createElement("span", { style: styles.label }, "\u9ED8\u8BA4\u901A\u77E5\u65B9\u5F0F"),
      React.createElement(
        "select",
        { style: styles.input, value: cfg.defaultMode || "toast", onChange: (e) => set("defaultMode", e.target.value) },
        React.createElement("option", { value: "toast" }, "\u684C\u9762\u901A\u77E5"),
        React.createElement("option", { value: "speak" }, "\u8BED\u97F3\u64AD\u62A5"),
        React.createElement("option", { value: "sound" }, "\u63D0\u793A\u97F3"),
        React.createElement("option", { value: "both" }, "\u8BED\u97F3 + \u684C\u9762")
      )
    ),
    React.createElement("div", { style: styles.sectionTitle }, "\u8BED\u97F3\u5F15\u64CE"),
    React.createElement(
      "div",
      { style: styles.row },
      React.createElement("span", { style: styles.label }, "\u5F15\u64CE"),
      React.createElement(
        "select",
        { style: styles.input, value: cfg.engine || "auto", onChange: (e) => set("engine", e.target.value) },
        React.createElement("option", { value: "auto" }, "auto\uFF08\u6709 MiMo Key \u7528 MiMo\uFF0C\u5426\u5219\u706B\u5C71\uFF0C\u5426\u5219 SAPI\uFF09"),
        React.createElement("option", { value: "mimo" }, "mimo\uFF08\u5C0F\u7C73 MiMo V2.5-TTS\uFF09"),
        React.createElement("option", { value: "volcano" }, "volcano\uFF08\u706B\u5C71 seed-tts\uFF0C\u9AD8\u97F3\u8D28\uFF09"),
        React.createElement("option", { value: "windows-sapi" }, "windows-sapi\uFF08\u79BB\u7EBF\uFF0C\u673A\u68B0\u97F3\uFF09")
      )
    ),
    // ── MiMo 区块（默认展开，在火山上方）──
    React.createElement(
      CollapsibleSection,
      { title: "MiMo \u5C0F\u7C73\u4E91 TTS\uFF08mimo.mi.com\uFF09", open: openMimo, onToggle: () => setOpenMimo(!openMimo) },
      React.createElement(
        "div",
        { style: styles.row },
        React.createElement("span", { style: styles.label }, "MiMo API Key"),
        React.createElement("input", { type: "password", style: styles.input, value: cfg.mimo?.apiKey || "", placeholder: "\u5C0F\u7C73 MiMo X-Api-Key", onChange: (e) => setMimo("apiKey", e.target.value) })
      ),
      React.createElement(
        "div",
        { style: styles.row },
        React.createElement("span", { style: styles.label }, "MiMo \u97F3\u8272"),
        React.createElement(
          "select",
          { style: styles.input, value: cfg.mimo?.voice || "mimo_default", onChange: (e) => setMimo("voice", e.target.value) },
          React.createElement("option", { value: "mimo_default" }, "mimo_default\uFF08\u9ED8\u8BA4\uFF09"),
          React.createElement("option", { value: "\u51B0\u7CD6" }, "\u51B0\u7CD6\uFF08\u4E2D\u6587\xB7\u5973\uFF09"),
          React.createElement("option", { value: "\u8309\u8389" }, "\u8309\u8389\uFF08\u4E2D\u6587\xB7\u5973\uFF09"),
          React.createElement("option", { value: "\u82CF\u6253" }, "\u82CF\u6253\uFF08\u4E2D\u6587\xB7\u7537\uFF09"),
          React.createElement("option", { value: "\u767D\u6866" }, "\u767D\u6866\uFF08\u4E2D\u6587\xB7\u7537\uFF09"),
          React.createElement("option", { value: "Mia" }, "Mia\uFF08\u82F1\u6587\xB7\u5973\uFF09"),
          React.createElement("option", { value: "Chloe" }, "Chloe\uFF08\u82F1\u6587\xB7\u5973\uFF09"),
          React.createElement("option", { value: "Milo" }, "Milo\uFF08\u82F1\u6587\xB7\u7537\uFF09"),
          React.createElement("option", { value: "Dean" }, "Dean\uFF08\u82F1\u6587\xB7\u7537\uFF09")
        )
      ),
      React.createElement("div", { style: styles.hint }, "mimo.mi.com \u63A7\u5236\u53F0\u83B7\u53D6 Key\uFF1B\u9884\u7F6E\u97F3\u8272\u5F00\u7BB1\u5373\u7528\uFF0C\u65E0\u9700\u989D\u5916\u914D\u7F6E")
    ),
    // ── 火山区块（默认折叠，在 MiMo 下方）──
    React.createElement(
      CollapsibleSection,
      { title: "\u706B\u5C71\u5F15\u64CE\uFF08volcano \xB7 seed-tts\uFF09", open: openVolcano, onToggle: () => setOpenVolcano(!openVolcano) },
      React.createElement(
        "div",
        { style: styles.row },
        React.createElement("span", { style: styles.label }, "\u706B\u5C71 API Key"),
        React.createElement("input", { type: "password", style: styles.input, value: cfg.cloud?.apiKey || "", placeholder: "\u706B\u5C71\u5F15\u64CE X-Api-Key", onChange: (e) => setCloud("apiKey", e.target.value) })
      ),
      React.createElement(
        "div",
        { style: styles.row },
        React.createElement("span", { style: styles.label }, "\u706B\u5C71\u97F3\u8272"),
        React.createElement("input", { type: "text", style: styles.input, value: cfg.cloud?.voice || "", onChange: (e) => setCloud("voice", e.target.value) })
      ),
      React.createElement("div", { style: styles.hint }, "\u97F3\u8272\u9700\u4E0E\u6240\u9009\u5927\u6A21\u578B\u7248\u672C\u5339\u914D"),
      React.createElement(
        "div",
        { style: styles.row },
        React.createElement("span", { style: styles.label }, "\u5927\u6A21\u578B"),
        React.createElement(
          "select",
          { style: styles.input, value: cfg.cloud?.resourceId || "seed-tts-1.0", onChange: (e) => setCloud("resourceId", e.target.value) },
          React.createElement("option", { value: "seed-tts-1.0" }, "seed-tts-1.0"),
          React.createElement("option", { value: "seed-tts-2.0" }, "seed-tts-2.0")
        )
      )
    ),
    React.createElement(
      "div",
      { style: styles.row },
      React.createElement("span", { style: styles.label }, "\u97F3\u91CF"),
      React.createElement("input", { type: "number", min: 0.5, max: 2, step: 0.1, style: styles.input, value: cfg.volume ?? 1.3, onChange: (e) => set("volume", Number(e.target.value) || 1.3) })
    ),
    React.createElement("div", { style: styles.hint }, "0.5-2.0\uFF0C\u9ED8\u8BA4 1.3\uFF08+30%\uFF09"),
    React.createElement(
      "div",
      { style: styles.row },
      React.createElement("span", { style: styles.label }, "\u8BED\u901F"),
      React.createElement("input", { type: "number", min: 50, max: 300, step: 10, style: styles.input, value: cfg.rate ?? 200, onChange: (e) => set("rate", Number(e.target.value) || 200) })
    ),
    React.createElement("div", { style: styles.hint }, "50-300\uFF0C\u9ED8\u8BA4 200"),
    React.createElement("div", { style: styles.sectionTitle }, "\u6587\u6848\u6A21\u677F\uFF08\u6A21\u578B\u4E0D\u5199 message \u65F6\u4F7F\u7528\uFF1B\u652F\u6301 {{summary}}\uFF09"),
    React.createElement("div", { style: { color: DSW("label-tertiary"), fontSize: "12px", marginBottom: "4px" } }, "\u5F00\u59CB"),
    React.createElement("textarea", { style: styles.textarea, value: cfg.templates?.task_start || "", placeholder: "\u5F00\u59CB\u6267\u884C\u4EFB\u52A1", onChange: (e) => setTpl("task_start", e.target.value) }),
    React.createElement("div", { style: { color: DSW("label-tertiary"), fontSize: "12px", marginTop: "8px", marginBottom: "4px" } }, "\u5173\u952E\u70B9"),
    React.createElement("textarea", { style: styles.textarea, value: cfg.templates?.milestone || "", placeholder: "\u6211\u5DF2\u8DE8\u8FC7\u6700\u9AD8\u7684\u5C71\uFF0C\u540E\u9762\u90FD\u662F\u5C0F\u6253\u5C0F\u95F9", onChange: (e) => setTpl("milestone", e.target.value) }),
    React.createElement("div", { style: { color: DSW("label-tertiary"), fontSize: "12px", marginTop: "8px", marginBottom: "4px" } }, "\u5B8C\u6210"),
    React.createElement("textarea", { style: styles.textarea, value: cfg.templates?.task_complete || "", placeholder: "\u4EFB\u52A1\u5DF2\u7ECF\u5B8C\u6210\u4E86\uFF0C\u5FEB\u6765\u770B\u770B\u7ED3\u679C\u4E86", onChange: (e) => setTpl("task_complete", e.target.value) }),
    React.createElement("div", { style: { color: DSW("label-tertiary"), fontSize: "12px", marginTop: "8px", marginBottom: "4px" } }, "\u547C\u53EB"),
    React.createElement("textarea", { style: styles.textarea, value: cfg.templates?.need_interaction || "", placeholder: "\u6211\u9700\u8981\u4F60\u8FC7\u6765\u770B\u770B\u4E86", onChange: (e) => setTpl("need_interaction", e.target.value) }),
    React.createElement("div", { style: { color: DSW("label-tertiary"), fontSize: "12px", marginTop: "8px", marginBottom: "4px" } }, "\u51FA\u9519"),
    React.createElement("textarea", { style: styles.textarea, value: cfg.templates?.task_error || "", placeholder: "\u4EFB\u52A1\u51FA\u9519\u4E86\uFF0C\u9700\u8981\u4F60\u5904\u7406\u4E00\u4E0B\u5B50", onChange: (e) => setTpl("task_error", e.target.value) }),
    React.createElement(
      "div",
      { style: styles.row },
      React.createElement("button", { style: styles.btn, onClick: testCurrent }, "\u8BD5\u542C\u5F53\u524D\u97F3\u8272"),
      React.createElement("span", { style: styles.msg }, "\u9A8C\u8BC1\u97F3\u8272/\u6A21\u578B/\u97F3\u91CF/\u8BED\u901F")
    ),
    React.createElement("div", { style: styles.hint }, "\u9700\u5148\u4FDD\u5B58\u706B\u5C71 Key \u4E14\u97F3\u8272\u5DF2\u5F00\u901A\u5BF9\u5E94\u8D44\u6E90"),
    React.createElement("div", { style: styles.sectionTitle }, "\u547C\u53EB\u4E0E\u84DD\u7259"),
    React.createElement(
      "div",
      { style: styles.row },
      React.createElement("span", { style: styles.label }, "\u786E\u8BA4\u7A97\u53E3\uFF08\u79D2\uFF09"),
      React.createElement("input", { type: "number", min: 5, max: 600, style: styles.input, value: cfg.callDelaySeconds ?? 60, onChange: (e) => set("callDelaySeconds", Number(e.target.value) || 60) })
    ),
    React.createElement(
      "div",
      { style: styles.switchRow },
      React.createElement("input", { type: "checkbox", id: "vc-turend", checked: !!cfg.onTurnEnd, onChange: (e) => set("onTurnEnd", e.target.checked) }),
      React.createElement("label", { htmlFor: "vc-turend", style: styles.switchLabel }, "\u56DE\u5408\u7ED3\u675F\u81EA\u52A8\u901A\u77E5")
    ),
    React.createElement("div", { style: styles.hint }, "\u4EFB\u52A1\u7B54\u5B8C\u5F39\u901A\u77E5 \u2192 \u7B49 N \u79D2\uFF1A\u671F\u95F4\u4F60\u6709\u64CD\u4F5C\uFF1D\u4EBA\u5728\uFF0C\u4E0D\u6253\u6270\uFF1B\u65E0\u64CD\u4F5C\uFF1D\u4EBA\u4E0D\u5728\uFF0C\u8BED\u97F3\u53EB\u4F60\u56DE\u6765"),
    React.createElement(
      "div",
      { style: styles.switchRow },
      React.createElement("input", { type: "checkbox", id: "vc-taskstart", checked: cfg.onTaskStart !== false, onChange: (e) => set("onTaskStart", e.target.checked) }),
      React.createElement("label", { htmlFor: "vc-taskstart", style: styles.switchLabel }, "\u65B0\u4EFB\u52A1\u81EA\u52A8\u64AD\u62A5\u300C\u5F00\u59CB\u300D\u8BED\u97F3")
    ),
    React.createElement(
      "div",
      { style: styles.switchRow },
      React.createElement("input", { type: "checkbox", id: "vc-question", checked: cfg.onQuestion !== false, onChange: (e) => set("onQuestion", e.target.checked) }),
      React.createElement("label", { htmlFor: "vc-question", style: styles.switchLabel }, "agent \u63D0\u95EE\u7B49\u5F85\u8FC7\u4E45\u4E14\u4F60\u79BB\u5F00\u65F6\u64AD\u62A5\u300C\u547C\u53EB\u300D")
    ),
    React.createElement("div", { style: styles.hint }, "\u63D0\u95EE\u9700\u4F60\u786E\u8BA4\u65F6\uFF1A\u4F60\u5DF2\u79BB\u5F00 \u2192 3 \u79D2\u540E\u7ACB\u5373\u547C\u53EB\uFF1B\u4F60\u5728\u573A \u2192 \u7B49 N \u79D2\u672A\u7B54\u518D\u53EB\uFF1B\u56DE\u7B54\u540E\u81EA\u52A8\u53D6\u6D88"),
    React.createElement(
      "div",
      { style: styles.switchRow },
      React.createElement("input", { type: "checkbox", id: "vc-autocall", checked: !!cfg.autoCall, onChange: (e) => set("autoCall", e.target.checked) }),
      React.createElement("label", { htmlFor: "vc-autocall", style: styles.switchLabel }, "N\u79D2\u6CA1\u4EBA\u786E\u8BA4\u5C31\u64AD\u653E\u300C\u5B8C\u6210\u300D\u8BED\u97F3\u53EB\u6211\u56DE\u6765")
    ),
    CollapsibleSection({ title: "\u573A\u666F\u63D0\u793A\u97F3\uFF08\u64AD\u62A5\u524D\u5148\u54CD\u4E00\u58F0\uFF0C\u97F3\u91CF\u5DF2 +100%\uFF09", open: openScene, onToggle: () => setOpenScene((v) => !v), children: [
      React.createElement("div", { style: styles.hint }, "\u5404\u573A\u666F\u72EC\u7ACB\u9009 WAV \u97F3\u6548\uFF0C\u81EA\u52A8\u653E\u5927\u97F3\u91CF\u9632\u524A\u6CE2"),
      SCENE_NAMES.map((s) => React.createElement(
        "div",
        { key: "sound-" + s.key, style: styles.row },
        React.createElement("span", { style: styles.label }, s.label + "\u63D0\u793A\u97F3"),
        React.createElement(
          "select",
          { style: styles.input, value: cfg.sceneSounds?.[s.key] || "", onChange: (e) => setSceneSound(s.key, e.target.value) },
          React.createElement("option", { value: "" }, "\uFF08\u8DDF\u968F\u9ED8\u8BA4\uFF09"),
          SOUND_OPTIONS.map((o) => React.createElement("option", { key: o.value, value: o.value }, o.label))
        )
      ))
    ] }),
    CollapsibleSection({ title: "\u4E91\u7AEF\u97F3\u8D28\uFF08\u9AD8\u7EA7\uFF09", open: openCloud, onToggle: () => setOpenCloud((v) => !v), children: [
      React.createElement(
        "div",
        { style: styles.row },
        React.createElement("span", { style: styles.label }, "\u80FD\u91CF\u589E\u76CA"),
        React.createElement("input", { type: "number", min: -50, max: 100, style: styles.input, value: cfg.cloud?.energyRate ?? 0, onChange: (e) => setCloud("energyRate", Number(e.target.value) || 0) })
      ),
      React.createElement("div", { style: styles.hint }, "\u63D0\u5347\u54CD\u5EA6\u611F\u77E5\uFF080=\u9ED8\u8BA4\uFF09\uFF0C\u5927\u97F3\u91CF\u7528\u6237\u4E0D\u7528\u6539"),
      React.createElement(
        "div",
        { style: styles.row },
        React.createElement("span", { style: styles.label }, "\u7F51\u7EDC\u91CD\u8BD5"),
        React.createElement("input", { type: "number", min: 0, max: 5, style: styles.input, value: cfg.cloud?.retries ?? 1, onChange: (e) => setCloud("retries", Number(e.target.value) || 0) })
      ),
      React.createElement(
        "div",
        { style: styles.row },
        React.createElement("span", { style: styles.label }, "\u53E5\u95F4\u505C\u987F(ms)"),
        React.createElement("input", { type: "number", min: 0, max: 2e3, style: styles.input, value: cfg.cloud?.pauseSentenceMs ?? 400, onChange: (e) => setCloud("pauseSentenceMs", Number(e.target.value) || 0) })
      ),
      React.createElement(
        "div",
        { style: styles.row },
        React.createElement("span", { style: styles.label }, "\u9017\u53F7\u505C\u987F(ms)"),
        React.createElement("input", { type: "number", min: 0, max: 2e3, style: styles.input, value: cfg.cloud?.pauseCommaMs ?? 200, onChange: (e) => setCloud("pauseCommaMs", Number(e.target.value) || 0) })
      )
    ] }),
    React.createElement(
      "div",
      null,
      React.createElement("button", { style: styles.btn, disabled: saving, onClick: save }, saving ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u8BBE\u7F6E"),
      React.createElement("span", { style: styles.msg }, msg)
    ),
    React.createElement("div", { style: styles.hint }, "\u4FDD\u5B58\u5199\u5165 settings.yaml \u7684 voice \u5206\u533A\uFF0C\u7ACB\u5373\u751F\u6548\u3002\u8C03\u7528\u547D\u4EE4\uFF1A /voice")
  );
}
var name = "dsh-plugin-voice";
var inject = ["slots"];
function apply(ctx) {
  ctx.effect(() => ctx.slots.inject("settings.section", () => ctx.slots.register(
    { name: "settings.section", id: "voice", order: 110, label: "\u8BED\u97F3" },
    VoiceSettingsSection
  )));
}
module.exports = { name, inject, apply };
return module.exports; } });
