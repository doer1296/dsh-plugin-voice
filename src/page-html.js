/**
 * /voice 测试页 HTML（内联，避免额外静态文件）。
 * 沿用 dsh-plugin-notify 的暗色主题 + dsh CSS 变量，扩展音色试听 + 场景/情绪测试。
 */
export const pageHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>dsh 语音 · 测试与设置</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--dsw-alias-bg-base, #0f1115); color: var(--dsw-alias-label-primary, #e6e8eb);
  font: 13px/1.6 var(--dsw-font-family, "Segoe UI", system-ui, sans-serif); }
header { display: flex; align-items: center; gap: 14px; padding: 12px 22px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #2a3038); }
header h1 { font-size: 15px; font-weight: 600; }
header .sub { color: var(--dsw-alias-label-tertiary, #9aa3ad); font-size: 12px; }
.version-badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px 3px 12px; border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2, #2a3038); background: var(--dsw-alias-bg-layer-2, #1a1f27); font-size: 12px; }
.version-badge b { color: var(--dsw-alias-label-primary, #e6e8eb); font-weight: 600; }
.version-badge .tag { padding: 0 8px; border-radius: 999px; background: var(--dsw-alias-accent-soft, #2a3038);
  color: var(--dsw-alias-label-secondary, #9aa3ad); font-variant-numeric: tabular-nums; }
main { max-width: 760px; margin: 0 auto; padding: 18px 22px; }
.panel { background: var(--dsw-alias-bg-module-platform, #161a21); border: 1px solid var(--dsw-alias-border-l2, #2a3038);
  border-radius: 10px; padding: 14px; margin-bottom: 14px; }
.panel h2 { font-size: 13.5px; margin-bottom: 10px; color: var(--dsw-alias-label-secondary, #9aa3ad); font-weight: 600; }
textarea, input[type=text], input[type=number], select { width: 100%; background: var(--dsw-alias-bg-base, #0f1115);
  border: 1px solid var(--dsw-alias-border-l2, #2a3038); color: var(--dsw-alias-label-primary, #e6e8eb);
  border-radius: 6px; padding: 9px 11px; font-size: 13px; outline: none; resize: vertical; }
textarea { min-height: 64px; }
textarea:focus, input:focus, select:focus { border-color: var(--dsw-alias-brand-primary, #4d8cff); }
.row { display: flex; gap: 10px; margin-top: 10px; align-items: center; flex-wrap: wrap; }
.row > * { flex: 1; min-width: 0; }
.row label { flex: none; color: var(--dsw-alias-label-secondary, #9aa3ad); font-size: 12px; min-width: 70px; }
button { background: var(--dsw-alias-button-info-fill, #4d8cff); border: none; color: var(--dsw-alias-label-inverse, #fff);
  border-radius: 6px; padding: 8px 16px; font-size: 12.5px; cursor: pointer; flex: none; }
button:hover { opacity: .9; }
button.ghost { background: transparent; border: 1px solid var(--dsw-alias-border-l2, #2a3038); color: var(--dsw-alias-label-secondary, #9aa3ad); }
#msg, #setmsg { color: var(--dsw-alias-label-tertiary, #9aa3ad); font-size: 12px; margin-top: 8px; }
.hint { color: var(--dsw-alias-label-tertiary, #9aa3ad); font-size: 12px; margin-top: 6px; }
.voices { max-height: 180px; overflow-y: auto; border: 1px solid var(--dsw-alias-border-l2, #2a3038);
  border-radius: 6px; padding: 6px; margin-top: 6px; }
.voice-item { padding: 4px 8px; cursor: pointer; border-radius: 4px; font-size: 12px; }
.voice-item:hover { background: var(--dsw-alias-interactive-bg-hover, #1c2129); }
.voice-item.active { color: var(--dsw-alias-brand-primary, #4d8cff); }
</style>
</head>
<body>
<header>
  <h1>dsh 语音</h1>
  <span class="version-badge"><b>DSH语音助手</b><span class="tag">v${__VOICE_PLUGIN_VERSION__}</span></span>
  <span class="sub">speak 工具 / /voice 命令 / 自动通知共用此后端 · 火山 TTS（失败回退 SAPI）</span>
</header>
<main>
  <div class="panel">
    <h2>发一条语音 / 通知</h2>
    <textarea id="text" placeholder="要播报 / 通知的内容…">你好，我是 dsh 语音助手，这是播报测试。</textarea>
    <div class="row">
      <label>方式</label>
      <select id="mode">
        <option value="speak">语音播报</option>
        <option value="toast">桌面通知</option>
        <option value="sound">提示音</option>
        <option value="both">语音 + 桌面</option>
      </select>
    </div>
    <div class="row">
      <label>场景</label>
      <select id="scene">
        <option value="">（不指定）</option>
        <option value="task_start">开始</option>
        <option value="milestone">关键点</option>
        <option value="task_complete">完成</option>
        <option value="need_interaction">呼叫</option>
        <option value="task_error">出错</option>
      </select>
      <label>情绪</label>
      <select id="emotion">
        <option value="">（按场景）</option>
        <option value="neutral">neutral</option>
        <option value="happy">happy</option>
        <option value="sad">sad</option>
        <option value="angry">angry</option>
        <option value="calm">calm</option>
        <option value="excited">excited</option>
      </select>
    </div>
    <div class="row">
      <button onclick="send()">发送</button>
      <button class="ghost" onclick="demo()">演示：任务完成</button>
      <button class="ghost" onclick="stopVoice()">停止播报</button>
    </div>
    <div id="msg"></div>
  </div>

  <div class="panel">
    <h2>可用音色（点击试听）</h2>
    <button class="ghost" onclick="loadVoices()" style="margin-bottom:8px">刷新音色列表</button>
    <div class="voices" id="voices"><div style="color:var(--dsw-alias-label-tertiary,#9aa3ad);font-size:12px;padding:8px">点击「刷新音色列表」加载</div></div>
  </div>

  <div class="panel">
    <h2>提示音试听（音量已 +100%）</h2>
    <div class="row" style="flex-wrap:wrap">
      <label>提示音</label>
      <select id="sound-preview">
        <option value="melodious">WAV·悦耳</option>
        <option value="bright">WAV·明亮</option>
        <option value="light">WAV·轻快</option>
        <option value="ding_ding">WAV·叮叮</option>
        <option value="gift">WAV·礼物</option>
        <option value="short">WAV·短促</option>
        <option value="sudden">WAV·急促</option>
        <option value="sudden_2">WAV·急促2</option>
        <option value="tactful">WAV·委婉</option>
      </select>
      <button onclick="previewSound()">试听</button>
    </div>
    <div id="sound-msg" class="hint"></div>
    <div class="hint">场景提示音在设置面板里可分别配置（开始/关键点/完成/呼叫/出错）。</div>
  </div>

  <div class="panel">
    <h2>行为偏好</h2>
    <div class="row">
      <label>默认方式</label>
      <select id="set-mode">
        <option value="toast">桌面通知</option>
        <option value="speak">语音播报</option>
        <option value="sound">提示音</option>
        <option value="both">语音 + 桌面</option>
      </select>
    </div>
    <div class="row">
      <label>引擎</label>
      <select id="set-engine">
        <option value="auto">auto（有火山 Key 用火山，否则 SAPI）</option>
        <option value="volcano">volcano（火山 seed-tts，高音质）</option>
        <option value="windows-sapi">windows-sapi（离线，机械音）</option>
      </select>
    </div>
    <div class="row">
      <label>无人回应等待(秒)</label>
      <input type="number" id="set-delay" min="5" max="600" style="width:90px">
    </div>
    <div class="hint">任务答完先弹桌面通知 → 等这么多秒 → 期间你有任何操作（发消息/点会话/滚动/拖动）＝人回来了，就不打扰；完全没操作＝人不在，播放「完成」语音叫你回来</div>
    <div class="row" style="min-height:38px">
      <label style="flex:none;color:var(--dsw-alias-label-secondary,#9aa3ad);font-size:12px;min-width:70px">开始自动播报</label>
      <div style="display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-primary,#e6e8eb)">
        <input type="checkbox" id="set-taskstart" style="width:auto;accent-color:var(--dsw-alias-brand-primary,#4d8cff)">
        <span>发新消息（agent 空闲）＝新任务开始，自动播报「开始」模板</span>
      </div>
    </div>
    <div class="row">
      <label>蓝牙前导静音(ms)</label>
      <input type="number" id="set-silence" min="0" max="3000" style="width:90px">
    </div>
    <div class="row">
      <button onclick="saveSettings()">保存设置</button>
      <span id="setmsg"></span>
    </div>
    <div class="hint">设置保存到 settings.yaml 的 voice 分区，立即生效（引擎切换重置缓存），无需重启 dsh。SAPI 兜底固定启用：火山失败自动回退离线语音。</div>
  </div>
</main>
<script>
const $ = s => document.querySelector(s);
async function send(extraVoice) {
  const text = $('#text').value.trim();
  if (!text) { $('#msg').textContent = '内容为空'; return; }
  $('#msg').textContent = '播报中…';
  const body = { text, mode: $('#mode').value };
  if ($('#scene').value) body.scene = $('#scene').value;
  if ($('#emotion').value) body.emotion = $('#emotion').value;
  if (extraVoice) body.voice = extraVoice;
  const r = await fetch('/voice/api', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  $('#msg').textContent = r.ok ? ('已发送（' + d.mode + '）' + (extraVoice ? '，音色: ' + extraVoice : '')) : ('失败: ' + (d.error || r.status));
}
function demo() {
  $('#text').value = '任务已经全部完成了，快来看看结果了。';
  $('#mode').value = 'both';
  $('#scene').value = 'task_complete';
  $('#emotion').value = 'happy';
  send();
}
async function stopVoice() {
  await fetch('/voice/api', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ text:'stop', mode:'toast' }) });
  $('#msg').textContent = '已发送停止';
}
async function loadVoices() {
  try {
    const r = await fetch('/voice/api/voices');
    const d = await r.json();
    const list = d.voices || [];
    const html = list.map(v => '<div class="voice-item" onclick="testVoice(\\''+v+'\\')">' + v + '</div>').join('');
    $('#voices').innerHTML = html || '<div style="color:#9aa3ad;padding:8px">无可用音色</div>';
  } catch(e) { $('#voices').innerHTML = '<div style="color:#f87171;padding:8px">加载失败: ' + e.message + '</div>'; }
}
function testVoice(voice) {
  $$('.voice-item').forEach(el => el.classList.remove('active'));
  event.target.classList.add('active');
  $('#text').value = '这是 ' + voice + ' 音色的试听。';
  $('#mode').value = 'speak';
  send(voice);
}
function $$(s) { return document.querySelectorAll(s); }
async function previewSound() {
  const sound = $('#sound-preview').value;
  const r = await fetch('/voice/api/sound', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ sound }) });
  const d = await r.json().catch(() => ({}));
  $('#sound-msg').textContent = r.ok ? ('已播放：' + sound) : ('失败: ' + (d.error || r.status));
}
async function loadSettings() {
  try {
    const r = await fetch('/voice/api/settings');
    const d = await r.json();
    if (!d.config) return;
    const c = d.config;
    $('#set-mode').value = c.defaultMode || 'toast';
    $('#set-engine').value = c.engine || 'auto';
    $('#set-delay').value = c.callDelaySeconds || 60;
    $('#set-silence').value = c.cloud?.leadingSilence ?? 1500;
    $('#set-taskstart').checked = c.onTaskStart !== false;
  } catch(e) { $('#setmsg').textContent = '设置读取失败: ' + e.message; }
}
async function saveSettings() {
  const body = {
    defaultMode: $('#set-mode').value,
    engine: $('#set-engine').value,
    callDelaySeconds: Number($('#set-delay').value) || 60,
    onTaskStart: $('#set-taskstart').checked,
    cloud: { leadingSilence: Number($('#set-silence').value) ?? 1500 },
  };
  const r = await fetch('/voice/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  $('#setmsg').textContent = r.ok ? '已保存，立即生效（引擎缓存已重置）' : ('保存失败: ' + (d.error || r.status));
}
loadSettings();
</script>
</body>
</html>`
