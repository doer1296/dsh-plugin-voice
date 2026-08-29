/**
 * dsh-plugin-voice
 * 语音 + 通知出口：agent 主动联系用户——云端 TTS 语音播报 / 桌面通知 / 提示音。
 *
 * 融合自：
 *   - dsh-plugin-notify（DSH 全注入点集成 + 智能确认窗口呼叫 + 事件驱动兜底）
 *   - agent-voice-mcp-minus（云端 seed-tts / Edge TTS + 长文案停顿 + 文本清洗 + 情绪映射 + 蓝牙前导静音）
 *
 * 用法：
 *   - agent 工具 speak（模型自主播报，含 scene/emotion/role）
 *   - agent 工具 user_activity（查用户是否在电脑前）
 *   - agent 工具 stop（停止当前播报）
 *   - agent 工具 get_voices（列可用音色）
 *   - 命令   /voice <内容> [--speak|--sound|--toast|--both] [--scene=...] [--emotion=...]
 *   - 页面   http://<dsh-host>:<dsh-port>/voice（测试 + 设置）
 *
 * 后端：notify.ps1（桌面通知 NotifyIcon + 提示音）+ 云端 TTS 引擎（火山，失败回退 SAPI）
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { createTTSEngine, resetEngineCache, createFallbackEngine } from './tts/factory.js'
import { VoiceQueue, cleanSpeechText, truncateForSpeech } from './voice-queue.js'
import { loadConfig, resolveOptions, resolveRole, resetConfigCache, setSettingsScope } from './config.js'

export const name = 'dsh-plugin-voice'

export const inject = ['commands', 'webServer', 'tools', 'systemPrompt', 'settings']

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PS1 = join(PACKAGE_ROOT, 'notify.ps1')
const IDLE_PS1 = join(PACKAGE_ROOT, 'idle.ps1')
const VALID_MODES = ['toast', 'speak', 'sound', 'both']
const VALID_SCENES = ['task_start', 'task_complete', 'task_error', 'need_interaction', 'milestone']
const VALID_EMOTIONS = ['neutral', 'happy', 'sad', 'angry', 'calm', 'excited']
const SPEAK_MAX_CHARS = 300

/** 待确认的通知：sessionId -> { summary, responded, timer } */
const pendingCalls = new Map()

const homeDir = process.env.USERPROFILE || process.env.HOME || ''
const CONFIG_FILE = join(homeDir, '.dsh', 'voice', 'config.json')

// DSH 原生设置 scope（settings.yaml 的 voice 分区），apply 注册后赋值，POST 保存时使用
let _settingsScope = null

// apply 幂等保护：DSH 的 HMR 在插件文件变化时会自动重载插件，导致 apply() 被多次调用。
// 模块级标志保证同一模块实例只完整注册一次（HMR 重载创建的是新模块实例，故不受影响）。
let _applied = false

const DEFAULT_TEMPLATES = {
  task_start: '开始执行任务了',
  task_complete: '任务已经完成了，快来看看结果了',
  task_error: '任务出错了，需要你处理一下子',
  need_interaction: '我需要你过来看看了',
  milestone: '我已跨过最高的山了，后面都是小打小闹了',
}

/** 异步执行子进程，返回 stdout；不阻塞 Node 事件循环。 */
function runProcess(command, args, { timeout = 15000, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new Error(`${command} 执行超时（${timeout}ms）`))
    }, timeout)
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code === 0) resolve(stdout)
      else {
        const detail = (stderr || stdout).trim().slice(0, 300)
        reject(new Error(detail || `${command} 退出码 ${code}`))
      }
    })
  })
}

/** 查询系统空闲秒数（用户键盘/鼠标无操作时长）。 */
async function queryIdle() {
  try {
    const stdout = await runProcess('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', IDLE_PS1], { timeout: 15000 })
    const d = JSON.parse(stdout.trim())
    return Number(d.idle_seconds) || 0
  } catch { /* 查询失败按 0 处理（视为用户在） */ }
  return 0
}

// ── 引擎与队列（懒初始化，apply 时创建）──
let engine = null
let voiceQueue = null
let engineInitPromise = null

/**
 * 确保引擎 + 语音队列就绪（懒加载 + 并发安全）。
 * 首次调用才动态加载火山/SAPI 引擎（工厂已用动态 import），
 * 并发调用共享同一个初始化 Promise，避免重复初始化。
 */
function ensureEngine() {
  if (engine && voiceQueue) return Promise.resolve(voiceQueue)
  if (engineInitPromise) return engineInitPromise
  engineInitPromise = (async () => {
    const config = loadConfig()
    engine = await createTTSEngine({
      engine: config.engine,
      cloud: config.cloud,
    })
    // SAPI 兜底固定启用：火山失败（断网/额度/Key 失效）自动回退 SAPI，不可关闭
    const fallbackEngine = await createFallbackEngine()
    voiceQueue = new VoiceQueue(engine, 2, config.notificationSound, fallbackEngine)
    return voiceQueue
  })().finally(() => {
    engineInitPromise = null
  })
  return engineInitPromise
}

/** 重置引擎缓存（设置面板切引擎时调用）。 */
async function refreshEngine() {
  resetEngineCache()
  resetConfigCache()
  engine = null
  voiceQueue = null
  engineInitPromise = null
  await ensureEngine()
}

/** 通知串行队列（toast/sound 走 PowerShell，与语音播报共用队列避免重叠）。 */
let notifyQueue = Promise.resolve()

/**
 * 执行一次通知。
 * - mode=speak：云端 TTS 合成播放（走 VoiceQueue）
 * - mode=toast/sound/both：PowerShell NotifyIcon + 提示音（走 notifyQueue）
 * - speak + toast 组合：两个队列各跑各的
 */
async function notify(mode, title, message, options = {}) {
  if (!VALID_MODES.includes(mode)) mode = 'toast'
  let text = String(message ?? '').trim()
  if (!text) return Promise.reject(new Error('通知内容为空'))

  // onlyIfAway：仅在用户离开电脑时才真正语音播报；用户在场则降级为桌面通知（避免打扰）
  if (options.onlyIfAway && (mode === 'speak' || mode === 'both')) {
    const idle = await queryIdle()
    if (idle <= 120) { // 空闲 ≤ 2 分钟视为用户在场
      console.log(`[voice] onlyIfAway：用户在场（空闲 ${idle}s），语音降级为 toast`)
      mode = 'toast'
    } else {
      console.log(`[voice] onlyIfAway：用户已离开（空闲 ${idle}s），语音播报`)
    }
  }

  // speak / both 中的语音部分：走云端 TTS
  if (mode === 'speak' || mode === 'both') {
    const config = loadConfig()
    let speechText = config.textClean !== false ? cleanSpeechText(text) : text
    speechText = truncateForSpeech(speechText, config.maxTextLength ?? 200)
    if (speechText) {
      const scene = options.scene && VALID_SCENES.includes(options.scene) ? options.scene : undefined
      const role = resolveRole(config.roles, options.role)
      const resolved = resolveOptions(config, scene, {
        voice: options.voice,
        rate: options.rate,
        volume: options.volume,
        emotion: options.emotion,
        emotionIntensity: options.emotionIntensity,
      }, role)
      const sceneSound = (scene && config.sceneSounds?.[scene]) ?? config.notificationSound
      const q = await ensureEngine()
      q.enqueue(speechText, resolved, sceneSound)
    }
    // both 还要继续发桌面通知
    if (mode === 'both') {
      // 不 return，继续走 toast
    } else {
      return mode
    }
    // both 模式下 toast 部分用截断后的文本
    text = text.slice(0, SPEAK_MAX_CHARS)
  }

  // toast / sound / both 的桌面通知 + 提示音部分：走 PowerShell
  if (mode === 'toast' || mode === 'sound' || mode === 'both') {
    const payload = Buffer.from(JSON.stringify({
      mode: mode === 'both' ? 'both' : (mode === 'speak' ? 'toast' : mode),
      title: String(title ?? 'dsh 通知'),
      message: text,
    })).toString('base64')
    if (!existsSync(PS1)) return Promise.reject(new Error(`notify.ps1 不存在: ${PS1}`))

    const task = notifyQueue.then(async () => {
      await runProcess('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1], {
        timeout: 120000,
        env: { DSH_VOICE_PAYLOAD: payload },
      })
    })
    notifyQueue = task.then(() => {}, () => {})
    await task
  }

  return mode
}

/** 渲染模板：{{summary}} 自动加"："前缀；{{session}} 会话 id。 */
function renderTemplate(tpl, vars = {}) {
  return String(tpl).replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (k === 'summary') {
      const s = String(vars.summary ?? '').trim()
      return s ? `：${s}` : ''
    }
    if (k === 'session') return String(vars.session ?? '')
    return m
  })
}

/** 从原始输入解析 flag 与内容。 */
function parseFlags(raw) {
  let mode = loadConfig().defaultMode || 'toast'
  let rest = String(raw ?? '').trim()
  for (const flag of ['--speak', '--sound', '--toast', '--both']) {
    if (rest.includes(flag)) {
      mode = flag.slice(2)
      rest = rest.replace(flag, '').trim()
      break
    }
  }
  // 解析 --scene= / --emotion= / --role=
  let scene, emotion, role
  const sceneMatch = rest.match(/--scene=(\w+)/)
  if (sceneMatch) { scene = sceneMatch[1]; rest = rest.replace(sceneMatch[0], '').trim() }
  const emotionMatch = rest.match(/--emotion=(\w+)/)
  if (emotionMatch) { emotion = emotionMatch[1]; rest = rest.replace(emotionMatch[0], '').trim() }
  const roleMatch = rest.match(/--role=(\S+)/)
  if (roleMatch) { role = roleMatch[1]; rest = rest.replace(roleMatch[0], '').trim() }
  return { mode, text: rest, scene, emotion, role }
}

// ── HTTP 辅助 ──
function sendHtml(res, text) {
  const data = Buffer.from(text, 'utf8')
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': data.length })
  res.end(data)
}
function sendJson(res, code, obj) {
  const data = Buffer.from(JSON.stringify(obj), 'utf8')
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': data.length })
  res.end(data)
}
async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
}

// ── 测试页 HTML（内联，避免额外文件）──
import { pageHtml } from './page-html.js'

export function apply(ctx) {
  // 幂等保护：HMR 重载会再次调用 apply，跳过重复注册
  if (_applied) {
    console.log('[voice] apply 重复调用，跳过（HMR 重载）')
    return
  }
  _applied = true

  // ── DSH 原生设置（settings.yaml 的 voice 分区）──
  // 设置面板（client bundle VoiceSettingsSection + /voice 测试页）通过 GET/POST
  // /voice/api/settings 读写 settings scope，DSH 持久化到 settings.yaml 的 voice 分区。
  try {
    const voiceSchema = z.object({
      defaultMode: z.string().default('both'),
      engine: z.string().default('auto'),
      callDelaySeconds: z.number().default(60),
      onTurnEnd: z.boolean().default(true),
      onTaskStart: z.boolean().default(true),
      autoCall: z.boolean().default(true),
      leadingSilence: z.number().default(1500),
      textClean: z.boolean().default(true),
      maxTextLength: z.number().default(200),
      volume: z.number().default(1.3),
      rate: z.number().default(200),
      cloud_apiKey: z.string().default(''),
      cloud_voice: z.string().default('zh_female_daimengchuanmei_moon_bigtts'),
      cloud_resourceId: z.string().default('seed-tts-1.0'),
      templates: z.object({
        task_start: z.string().default(DEFAULT_TEMPLATES.task_start),
        task_complete: z.string().default(DEFAULT_TEMPLATES.task_complete),
        task_error: z.string().default(DEFAULT_TEMPLATES.task_error),
        need_interaction: z.string().default(DEFAULT_TEMPLATES.need_interaction),
        milestone: z.string().default(DEFAULT_TEMPLATES.milestone),
      }).default({}),
      sceneSounds: z.object({
        task_start: z.string().default('light'),
        task_complete: z.string().default('bright'),
        task_error: z.string().default('melodious'),
        need_interaction: z.string().default('ding_ding'),
        milestone: z.string().default('gift'),
      }).default({}),
    })
    _settingsScope = ctx.settings?.register(settingsNamespace('voice'), voiceSchema, { applies: 'live' })
    if (_settingsScope) {
      console.log('[voice] 已注册原生设置（settings.yaml 的 voice 分区）')
      setSettingsScope(_settingsScope)
    }
  } catch (e) {
    console.error('[voice] settings 注册失败，回退 config.json:', e.message)
  }

  // ── 系统提示词注入：让 agent 默认有"主动通知+语音播报"习惯 ──
  if (process.env.DSH_VOICE_INJECT_PROMPT !== '0') {
    ctx.systemPrompt?.section?.({
      name: 'voice-user-guidance',
      order: 100,
      text: '你有 speak / notify_user / user_activity / stop 工具，用于语音播报和主动联系用户。规则：\n' +
        '1. 必须：任务出错、或需要用户注意与确认时，立即用 speak 语音播报（scene 传 task_error，emotion 传 angry）\n' +
        '2. 必须：完成多步或较长时间的任务后，用 speak 语音播报（scene 传 task_complete，emotion 传 happy）；若用户不在电脑前（user_activity 空闲超过 2 分钟），用语音呼叫用户回来\n' +
        '3. 必须：多步任务遇到关键进展节点（如子步骤完成、关键文件生成、验证通过）时，用 speak 播报进度（scene 传 milestone，emotion 传 happy），文案说清楚到了哪一步（如"第一步搞定了""报告已生成，正在检查"）；任务开始播报由插件自动完成，无需重复调用\n' +
        '4. 播报内容自己写进 message，想说啥说啥，像跟朋友说话一样自然（如"搞定了，报告放桌面了"）；不写则用场景默认文案\n' +
        '5. 情绪：happy=完成 / calm=开始 / angry=出错 / excited=关键点；emotionIntensity 0-1 控制强度\n' +
        '6. 例外：几秒就能完成的简单任务无需播报，避免打扰',
    })
  }

  // ── 事件驱动兜底：会话出错 ──
  ctx.on?.('agent/error', (payload) => {
    try {
      // 只播报默认文案（用户可自定义 task_error 模板），绝不拼接/透出错误详情
      const cfg = loadConfig()
      const text = renderTemplate(cfg.templates?.task_error ?? DEFAULT_TEMPLATES.task_error, {
        session: payload?.agent?.id ?? '',
      })
      notify('both', 'dsh 任务出错', text, { scene: 'task_error', emotion: 'angry' })
        .catch((e) => console.error('[voice] 出错自动通知失败:', e.message))
    } catch (e) {
      console.error('[voice] 出错自动通知失败:', e.message)
    }
  })

  // ── 事件驱动兜底：回合结束 → toast → 确认窗口 → 超时语音呼叫 ──
  // 注意：不在 apply() 时同步 loadConfig()（避免阻塞 DSH 启动），配置在事件触发时懒加载（loadConfig 有缓存，仅首次读文件）
  ctx.on?.('agent/turn-stopping', (payload) => {
    try {
      const agent = payload?.agent
      if (!agent?.session) return
      // 懒加载配置（仅首次触发读文件，之后命中缓存）
      const config = loadConfig()
      if (config.onTurnEnd === false) return
      let text = ''
      for (const ev of agent.session.events) {
        if (ev.type === 'assistant/message') {
          const parts = (ev.data?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '')
          if (parts.length) text = parts.join('\n')
        }
      }
      const summary = text.trim().slice(0, 200) || `会话 ${agent.id} 的回合已结束`

      // 立即桌面通知
      notify('toast', '任务完成', summary)
        .catch((e) => console.error('[voice] 完成自动通知失败:', e.message))

      // 确认窗口：等 callDelaySeconds 秒，期间用户有操作（发消息/点会话/滚动/拖动等）→ 视为已看到，不语音呼叫
      const cfg = config
      if (cfg.autoCall !== false) {
        const sessionId = agent.id
        const prev = pendingCalls.get(sessionId)
        if (prev?.timer) clearTimeout(prev.timer)
        const entry = { summary, responded: false, timer: null }
        entry.timer = setTimeout(async () => {
          try {
            if (!entry.responded) {
              // 改进：到期先查系统空闲——用户近期有键盘/鼠标操作（点击会话/滚动/拖动都算）→ 视为已回来，不语音呼叫
              const idle = await queryIdle()
              if (idle <= 60) {
                console.log(`[voice] ${cfg.callDelaySeconds}秒到，但用户近期有操作（空闲 ${idle}s），不语音呼叫（${sessionId}）`)
              } else {
                notify('speak', '任务完成', renderTemplate(cfg.templates?.task_complete ?? DEFAULT_TEMPLATES.task_complete), {
                  scene: 'task_complete', emotion: 'happy',
                })
                  .catch((e) => console.error('[voice] 语音呼叫失败:', e.message))
                console.log(`[voice] ${cfg.callDelaySeconds}秒未确认且无操作，语音呼叫（${sessionId}）`)
              }
            }
          } catch (e) {
            console.error('[voice] 确认窗口处理失败:', e.message)
          }
          pendingCalls.delete(sessionId)
        }, (cfg.callDelaySeconds || 60) * 1000)
        pendingCalls.set(sessionId, entry)
      }
    } catch (e) {
      console.error('[voice] 完成自动通知失败:', e.message)
    }
  })

    // 用户新消息进场：一是取消待确认呼叫；二是 agent 空闲时视为「开始新任务」→ 自动播报开始模板
    ctx.on?.('agent/inbox/inserted', async (payload) => {
      if (payload?.message?.source?.kind !== 'user') return
      // 取消待确认呼叫
      for (const [sessionId, entry] of pendingCalls) {
        if (!entry.responded) {
          entry.responded = true
          if (entry.timer) clearTimeout(entry.timer)
          pendingCalls.delete(sessionId)
          console.log(`[voice] 用户已互动，取消呼叫（${sessionId}）`)
        }
      }
      // 自动播报「开始」：仅当 agent 当前空闲（新任务/新回合开始）且未关闭该功能
      try {
        const config = loadConfig()
        if (config.onTaskStart === false) return
        // payload.agent.status：idle=空闲（消息刚进来，回合还没跑起来），running=正在执行
        if (payload.agent?.status !== 'idle') return
        const text = renderTemplate(config.templates?.task_start ?? DEFAULT_TEMPLATES.task_start, {
          session: payload.agent?.id ?? '',
        })
        notify('speak', '任务开始', text, {
          scene: 'task_start', emotion: 'calm',
        }).catch((e) => console.error('[voice] 开始自动播报失败:', e.message))
        console.log(`[voice] 新任务开始，自动播报「开始」（${payload.agent?.id}）`)
      } catch (e) {
        console.error('[voice] 开始自动播报失败:', e.message)
      }
    })

  // ── agent 工具：speak（模型主动播报，融合 A 的 notify_user 语义 + B 的 speak 参数）──
  ctx.tools?.register?.({
    name: 'speak',
    description: '通过云端 TTS（火山 seed-tts 高音质，失败自动回退 SAPI）语音播报文本，或发桌面通知 / 提示音主动联系用户。任务完成、出错、需要用户注意、呼叫用户回来时使用。想说的话写进 message（自由发挥，语气自然即可）；不写则按 scene 用默认文案。',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: '你想对用户说的话（自由发挥，不用模板；语音播报会念出来，50 字内最佳）' },
        scene: { type: 'string', enum: VALID_SCENES, description: '播报场景（决定默认文案 + 音色/语速/情绪）：task_start=开始 / task_complete=完成（默认）/ task_error=出错 / need_interaction=呼叫 / milestone=关键点' },
        emotion: { type: 'string', enum: VALID_EMOTIONS, description: '情绪：neutral/happy/sad/angry/calm/excited。默认按场景：完成=happy / 出错=angry / 开始=calm' },
        emotionIntensity: { type: 'number', description: '情绪强度 0-1，默认 0.7' },
        mode: { type: 'string', enum: ['speak', 'toast', 'sound', 'both'], description: 'speak=语音播报（默认）；toast=桌面通知；sound=提示音；both=语音+桌面通知' },
        role: { type: 'string', description: '指定播报角色名（多 agent 不同音色）。未指定用配置的第一个角色' },
        voice: { type: 'string', description: '覆盖音色（优先级高于场景/角色配置）' },
        rate: { type: 'number', description: '语速 50-300，默认 200' },
        volume: { type: 'number', description: '音量 0-2，默认 1.3（+30%）' },
        onlyIfAway: { type: 'boolean', description: '仅当用户离开电脑时才语音播报（空闲超 2 分钟）；用户在场时自动降级为桌面通知，避免打扰' },
        title: { type: 'string', description: '桌面通知标题（默认 dsh 通知）' },
      },
      required: ['message'],
    },
    output: {
      schema: { type: 'object', additionalProperties: true, properties: {} },
      render: (args, value) => [{ type: 'text', text: `已播报（${value.mode}）` }],
    },
    execute: async (args, exec) => {
      const scene = args.scene ?? 'task_complete'
      const custom = String(args.message ?? '').trim()
      const cfg = loadConfig()
      const text = custom || renderTemplate(cfg.templates?.[scene] ?? DEFAULT_TEMPLATES[scene] ?? DEFAULT_TEMPLATES.task_complete, {
        summary: String(args.summary ?? '').trim(),
        session: '',
      })
      const mode = await notify(
        args.mode ?? 'speak',
        args.title,
        text,
        {
          scene, emotion: args.emotion, emotionIntensity: args.emotionIntensity,
          role: args.role, voice: args.voice, rate: args.rate, volume: args.volume,
          onlyIfAway: args.onlyIfAway,
        }
      )
      // 模型已主动通知 → 取消该系统兜底的待确认呼叫
      if (exec?.agent?.id) {
        const p = pendingCalls.get(exec.agent.id)
        if (p && !p.responded) {
          p.responded = true
          if (p.timer) clearTimeout(p.timer)
          pendingCalls.delete(exec.agent.id)
          console.log(`[voice] 模型已主动播报，取消兜底呼叫（${exec.agent.id}）`)
        }
      }
      return { mode, text: text.slice(0, 80) }
    },
    isConcurrencySafe: () => false, // 语音播报必须串行
    timeoutMs: 120000,
  })

  // ── agent 工具：notify_user（兼容 A 的工具名，内部转发到 speak）──
  ctx.tools?.register?.({
    name: 'notify_user',
    description: '通过桌面通知 / 语音播报 / 提示音主动联系用户（speak 工具的别名，参数兼容）。任务完成、出错、需要用户注意或确认、呼叫用户回来时使用。',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: '你想对用户说的话' },
        scene: { type: 'string', enum: VALID_SCENES, description: '通知场景' },
        mode: { type: 'string', enum: ['speak', 'toast', 'sound', 'both'], description: '通知方式，默认 toast' },
        title: { type: 'string', description: '通知标题' },
      },
      required: ['message'],
    },
    output: {
      schema: { type: 'object', additionalProperties: true, properties: {} },
      render: (args, value) => [{ type: 'text', text: `已通知用户（${value.mode}）` }],
    },
    execute: async (args, exec) => {
      const scene = args.scene ?? 'task_complete'
      const custom = String(args.message ?? '').trim()
      const cfg = loadConfig()
      const text = custom || renderTemplate(cfg.templates?.[scene] ?? DEFAULT_TEMPLATES[scene] ?? DEFAULT_TEMPLATES.task_complete, {})
      const mode = await notify(args.mode ?? 'toast', args.title, text, { scene })
      if (exec?.agent?.id) {
        const p = pendingCalls.get(exec.agent.id)
        if (p && !p.responded) {
          p.responded = true
          if (p.timer) clearTimeout(p.timer)
          pendingCalls.delete(exec.agent.id)
        }
      }
      return { mode, text: text.slice(0, 80) }
    },
    isConcurrencySafe: () => false,
    timeoutMs: 120000,
  })

  // ── agent 工具：user_activity（查用户是否在电脑前）──
  ctx.tools?.register?.({
    name: 'user_activity',
    description: '查询用户当前是否在电脑前：返回系统键盘/鼠标空闲秒数（0 表示用户正在操作，数值越大表示离开越久）。长任务完成或不确定用户是否在线时使用，判断是否需要主动呼叫用户。',
    parameters: { type: 'object', properties: {} },
    output: {
      schema: { type: 'object', additionalProperties: true, properties: {} },
      render: (args, value) => {
        const idle = value?.idle_seconds ?? 0
        const desc = idle <= 30 ? '用户正在电脑前' : idle <= 180 ? '用户可能短暂离开' : '用户不在电脑前'
        return [{ type: 'text', text: `系统空闲 ${idle} 秒（${desc}）` }]
      },
    },
    execute: async () => ({ idle_seconds: await queryIdle() }),
    isConcurrencySafe: () => true,
  })

  // ── agent 工具：stop（停止当前播报并清空队列）──
  ctx.tools?.register?.({
    name: 'stop_voice',
    description: '停止当前正在播放的语音并清空播报队列。用户想打断播报时使用。',
    parameters: { type: 'object', properties: {} },
    output: {
      schema: { type: 'object', additionalProperties: true, properties: {} },
      render: () => [{ type: 'text', text: '已停止播报' }],
    },
    execute: async () => {
      if (voiceQueue) voiceQueue.stop()
      return { stopped: true }
    },
    isConcurrencySafe: () => true,
  })

  // ── agent 工具：get_voices（列可用音色）──
  ctx.tools?.register?.({
    name: 'get_voices',
    description: '获取当前 TTS 引擎可用的所有音色列表（用于选择 speak 时的 voice 参数）。',
    parameters: { type: 'object', properties: {} },
    output: {
      schema: { type: 'object', additionalProperties: true, properties: {} },
      render: (args, value) => [{ type: 'text', text: `可用音色：${(value?.voices ?? []).join(', ')}` }],
    },
    execute: async () => {
      const q = await ensureEngine()
      const voices = await q.engine.getVoices()
      return { voices }
    },
    isConcurrencySafe: () => true,
  })

  // ── 命令：/voice ──
  ctx.commands.register({
    name: 'voice',
    description: '语音播报 / 通知用户。/voice <内容> [--speak|--sound|--toast|--both] [--scene=...] [--emotion=...] [--role=...]',
    input: { hint: '<内容> [--speak|--toast|--scene=...]' },
    handler: async (invocation) => {
      const { mode, text, scene, emotion, role } = parseFlags(invocation?.rawInput)
      // 无内容时用场景模板兜底（跟随文本框，与 speak/notify_user 工具一致）
      const safeScene = scene && VALID_SCENES.includes(scene) ? scene : undefined
      const cfg = loadConfig()
      const content = text || renderTemplate(cfg.templates?.[safeScene] ?? DEFAULT_TEMPLATES[safeScene] ?? DEFAULT_TEMPLATES.task_complete, {})
      try {
        const used = await notify(mode, 'dsh 语音', content, { scene: safeScene, emotion, role })
        return { kind: 'success', text: `已播报（${used}）：${content.slice(0, 60)}${content.length > 60 ? '…' : ''}` }
      } catch (e) {
        return { kind: 'error', text: `[voice] ${e.message}` }
      }
    },
  })

  // ── 测试页 ──
  ctx.webServer.register({
    kind: 'exact',
    path: '/voice',
    handler: (req, res) => sendHtml(res, pageHtml),
  })

  // ── 测试 / 设置 API ──
  ctx.webServer.register({
    kind: 'exact',
    path: '/voice/api',
    handler: async (req, res) => {
      try {
        const body = await readBody(req).catch(() => ({}))
        const mode = String(body.mode ?? 'toast')
        const scene = body.scene && VALID_SCENES.includes(body.scene) ? body.scene : undefined
        // 无内容时用场景模板兜底（跟随文本框，与 speak/notify_user 工具一致）
        const raw = String(body.text ?? '').trim()
        const cfg = loadConfig()
        const text = raw || renderTemplate(cfg.templates?.[scene] ?? DEFAULT_TEMPLATES[scene] ?? DEFAULT_TEMPLATES.task_complete, {})
        const used = await notify(mode, 'dsh 语音', text, {
          scene, emotion: body.emotion, role: body.role,
        })
        sendJson(res, 200, { ok: true, mode: used, text: text.slice(0, 80) })
      } catch (e) {
        sendJson(res, 500, { error: e.message })
      }
    },
  })

  ctx.webServer.register({
    kind: 'exact',
    path: '/voice/api/settings',
    handler: async (req, res) => {
      try {
        if (req.method === 'GET') {
          sendJson(res, 200, { config: loadConfig(), version: __VOICE_PLUGIN_VERSION__ })
          return
        }
        if (req.method === 'POST') {
          const body = await readBody(req).catch(() => ({}))
          // 优先写 DSH 原生设置（settings scope → settings.yaml 的 voice 分区），回退 config.json
          if (_settingsScope) {
            // 嵌套 body → 扁平 schema 字段
            const patch = {}
            if (body.defaultMode !== undefined) patch.defaultMode = body.defaultMode
            if (body.engine !== undefined) patch.engine = body.engine
            if (body.callDelaySeconds !== undefined) patch.callDelaySeconds = body.callDelaySeconds
            if (body.onTurnEnd !== undefined) patch.onTurnEnd = body.onTurnEnd
            if (body.onTaskStart !== undefined) patch.onTaskStart = body.onTaskStart
            if (body.autoCall !== undefined) patch.autoCall = body.autoCall
            if (body.leadingSilence !== undefined) patch.leadingSilence = body.leadingSilence
            if (body.textClean !== undefined) patch.textClean = body.textClean
            if (body.maxTextLength !== undefined) patch.maxTextLength = body.maxTextLength
            if (body.volume !== undefined) patch.volume = body.volume
            if (body.rate !== undefined) patch.rate = body.rate
            if (body.cloud?.apiKey !== undefined) patch.cloud_apiKey = body.cloud.apiKey
            if (body.cloud?.voice !== undefined) patch.cloud_voice = body.cloud.voice
            if (body.cloud?.resourceId !== undefined) patch.cloud_resourceId = body.cloud.resourceId
            if (body.templates && typeof body.templates === 'object') patch.templates = body.templates
            if (body.sceneSounds && typeof body.sceneSounds === 'object') patch.sceneSounds = body.sceneSounds
            try {
              await _settingsScope.update(patch)
              resetConfigCache()
              await refreshEngine()
              sendJson(res, 200, { ok: true, config: loadConfig() })
              return
            } catch (e) {
              console.error('[voice] settings scope 保存失败，回退 config.json:', e.message)
            }
          }
          // 回退：写 config.json
          const { writeFileSync, mkdirSync } = await import('node:fs')
          const current = loadConfig()
          const next = { ...current, ...body }
          if (body.cloud) next.cloud = { ...current.cloud, ...body.cloud }
          if (body.edgeTTS) next.edgeTTS = { ...current.edgeTTS, ...body.edgeTTS }
          if (body.templates) next.templates = { ...current.templates, ...body.templates }
          if (body.sceneSounds) next.sceneSounds = { ...current.sceneSounds, ...body.sceneSounds }
          mkdirSync(join(CONFIG_FILE, '..'), { recursive: true })
          writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2) + '\n', 'utf8')
          resetConfigCache()
          await refreshEngine()
          sendJson(res, 200, { ok: true, config: loadConfig() })
          return
        }
        sendJson(res, 405, { error: 'method not allowed' })
      } catch (e) {
        sendJson(res, 500, { error: e.message })
      }
    },
  })

  // ── 提示音试听 API（测试页 / 设置面板用）──
  ctx.webServer.register({
    kind: 'exact',
    path: '/voice/api/sound',
    handler: async (req, res) => {
      try {
        const body = await readBody(req).catch(() => ({}))
        const sound = String(body.sound ?? 'melodious')
        const { playNotificationSound } = await import('./tts/notification-sound.js')
        await playNotificationSound(sound)
        sendJson(res, 200, { ok: true, sound })
      } catch (e) {
        sendJson(res, 500, { error: e.message })
      }
    },
  })

  // ── 音色查询 API（测试页用）──
  ctx.webServer.register({
    kind: 'exact',
    path: '/voice/api/voices',
    handler: async (req, res) => {
      try {
        const q = await ensureEngine()
        const voices = await q.engine.getVoices()
        sendJson(res, 200, { voices })
      } catch (e) {
        sendJson(res, 500, { error: e.message })
      }
    },
  })
}
