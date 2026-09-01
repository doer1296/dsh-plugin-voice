/**
 * 配置加载与选项解析（移植自 agent-voice-mcp-minus dist/config.js，简化角色匹配）。
 *
 * 配置优先级（settings.yaml 单源，config.json 补高级参数）：
 *   1. DSH 原生设置（settings.yaml 的 voice 分区）—— 面板设置项最高优先（覆盖 config.json 同键）
 *   2. config.json（~/.dsh/voice/config.json）—— 兜底 + 面板没有的高级参数（roles/scenes/cloud 音质参数）
 *   3. 默认值
 *
 * 支持 ${ENV_VAR} 环境变量引用（API Key 可不落盘；合并后统一解析，默认值里的引用也生效）。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, platform } from 'node:os'

const DEFAULT_CONFIG_PATH = join(homedir(), '.dsh', 'voice', 'config.json')

// DSH 原生设置 scope（settings.yaml 的 voice 分区），由 index.js 注入
let _settingsScope = null

/**
 * 注入 DSH 原生设置 scope（settings.yaml 的 voice: 字段）。
 * 由 index.js 在 ctx.settings.register 成功后调用。
 */
export function setSettingsScope(scope) {
  _settingsScope = scope
}

/**
 * 把 settings scope 的扁平字段（schema 命名，如 cloud_apiKey）映射为
 * 嵌套配置（如 cloud.apiKey）。仅映射已知字段，忽略未知。
 */
function mapSettingsToConfig(v) {
  if (!v || typeof v !== 'object') return null
  const result = {}
  if (v.defaultMode !== undefined) result.defaultMode = v.defaultMode
  if (v.engine !== undefined) result.engine = v.engine
  if (v.callDelaySeconds !== undefined) result.callDelaySeconds = v.callDelaySeconds
  if (v.onTurnEnd !== undefined) result.onTurnEnd = v.onTurnEnd
  if (v.onTaskStart !== undefined) result.onTaskStart = v.onTaskStart
  if (v.onQuestion !== undefined) result.onQuestion = v.onQuestion
  if (v.autoCall !== undefined) result.autoCall = v.autoCall
  if (v.textClean !== undefined) result.textClean = v.textClean
  if (v.maxTextLength !== undefined) result.maxTextLength = v.maxTextLength
  if (v.volume !== undefined) result.volume = v.volume
  if (v.rate !== undefined) result.rate = v.rate
  // 嵌套字段
  const cloud = {}
  if (v.cloud_apiKey !== undefined) cloud.apiKey = v.cloud_apiKey
  if (v.cloud_voice !== undefined) cloud.voice = v.cloud_voice
  if (v.cloud_resourceId !== undefined) cloud.resourceId = v.cloud_resourceId
  if (v.cloud_energyRate !== undefined) cloud.energyRate = v.cloud_energyRate
  if (v.cloud_retries !== undefined) cloud.retries = v.cloud_retries
  if (v.cloud_timeout !== undefined) cloud.timeout = v.cloud_timeout
  if (v.cloud_pauseSentenceMs !== undefined) cloud.pauseSentenceMs = v.cloud_pauseSentenceMs
  if (v.cloud_pauseCommaMs !== undefined) cloud.pauseCommaMs = v.cloud_pauseCommaMs
  if (Object.keys(cloud).length) result.cloud = cloud
  // 小米 MiMo（OpenAI 兼容接口，独立 Key/音色）
  const mimo = {}
  if (v.mimo_apiKey !== undefined) mimo.apiKey = v.mimo_apiKey
  if (v.mimo_voice !== undefined) mimo.voice = v.mimo_voice
  if (Object.keys(mimo).length) result.mimo = mimo
  if (v.templates && typeof v.templates === 'object') result.templates = v.templates
  if (v.sceneSounds && typeof v.sceneSounds === 'object') result.sceneSounds = v.sceneSounds
  return result
}

const DEFAULT_CONFIG = {
  engine: 'auto', // 默认 auto：有 MiMo Key 用 MiMo → 否则火山 → 否则 SAPI（候选链自动降级）
  cloud: {
    provider: 'volcano',
    apiKey: '${VOLCANO_API_KEY}',
    voice: 'zh_female_daimengchuanmei_moon_bigtts',
    resourceId: 'seed-tts-1.0',
    format: 'pcm',
    sampleRate: 24000,
    silenceDuration: 400,
    pauseControl: true,
    pauseSentenceMs: 400,
    pauseCommaMs: 200,
    timeout: 30000,
    // 音质增强参数（seed-tts-1.0 支持）
    nlpPara: { punctuationBias: 0, inequalityChoose: 0 }, // 标点偏向 / 特殊字符读法
    energyRate: 0,   // 能量增益 -50~100（提升响度感知）
    retries: 1,      // 网络瞬时故障重试次数
  },
  // 小米 MiMo V2.5-TTS（OpenAI 兼容 chat.completions，mimo.mi.com）
  mimo: {
    provider: 'mimo',
    apiKey: '${MIMO_API_KEY}',
    voice: 'mimo_default', // 预置音色：mimo_default/冰糖/茉莉/苏打/白桦/Mia/Chloe/Milo/Dean
    format: 'pcm',
    pauseControl: true,
    pauseSentenceMs: 400,
    pauseCommaMs: 200,
    timeout: 30000,
    retries: 1,
  },
  rate: 200,
  volume: 1,
  onTaskStart: true,
  onQuestion: true, // agent 提问（ask_user_question）等待过久且用户离开 → 播报「呼叫」防卡住
  sceneSounds: {
    task_start: 'light',        // 开始：轻快短音
    task_complete: 'bright',    // 完成：明亮上扬
    task_error: 'melodious',    // 出错：悦耳（柔和提醒，不刺耳）
    need_interaction: 'ding_ding', // 呼叫：叮叮提醒
    milestone: 'gift',          // 关键点：礼物般的欢快
  },
  textClean: true,
  maxTextLength: 200,
  startupWelcome: true, // DSH 启动后播报一句欢迎语（可改用 startupWelcomeText 自定义文案；false 关闭）
  startupWelcomeText: '欢迎使用语音助手，我将一直陪伴您',
  roles: [],
  scenes: {
    task_start: { voice: undefined, rate: 190, volume: 1, emotion: 'calm' },
    task_complete: { voice: undefined, rate: 220, volume: 1, emotion: 'happy' },
    task_error: { voice: undefined, rate: 210, volume: 1, emotion: 'angry' },
    need_interaction: { voice: undefined, rate: 200, volume: 1, emotion: 'calm' },
    milestone: { voice: undefined, rate: 210, volume: 1, emotion: 'happy' },
  },
}

let cachedConfig = null

/** 递归解析 ${ENV_VAR} 引用。 */
function resolveEnvVars(obj) {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] ?? `\${${name}}`)
  }
  if (Array.isArray(obj)) return obj.map(resolveEnvVars)
  if (obj !== null && typeof obj === 'object') {
    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveEnvVars(value)
    }
    return result
  }
  return obj
}

export function loadConfig(configPath) {
  const resolvedPath = configPath || DEFAULT_CONFIG_PATH
  if (!configPath && cachedConfig) return cachedConfig
  let fileConfig = {}

  // 1. config.json（兜底：补 settings 面板没有的高级参数，如 roles/scenes/nlpPara 等）
  //    低优先级——面板能改的键以 settings 为准，config.json 的同键会被覆盖
  if (existsSync(resolvedPath)) {
    try {
      const fileVal = JSON.parse(readFileSync(resolvedPath, 'utf-8'))
      fileConfig = deepMerge(fileConfig, fileVal)
    } catch {
      console.error(`[voice] 配置文件解析失败: ${resolvedPath}，使用默认`)
    }
  }

  // 2. DSH 原生设置（settings.yaml 的 voice 分区）——最高优先级。
  //    scope.get() 返回 resolved（含 schema 默认值），因此面板设置项在此覆盖 config.json；
  //    settings 不认识的键（roles/scenes/cloud.nlpPara/energyRate...）保留 config.json 值。
  if (_settingsScope && !configPath) {
    try {
      const settingsVal = _settingsScope.get()
      const mapped = mapSettingsToConfig(settingsVal)
      if (mapped && Object.keys(mapped).length) {
        fileConfig = deepMerge(fileConfig, mapped)
      }
    } catch (e) {
      console.error('[voice] settings scope 读取失败，回退 config.json:', e.message)
    }
  }

  // 3. 合并默认值后，对完整配置统一解析 ${ENV_VAR}（默认值里的 ${VOLCANO_API_KEY}
  //    也能被解析——否则字面 ${...} 会被误判为「未配 Key」而回退 SAPI）
  cachedConfig = resolveEnvVars(deepMerge(DEFAULT_CONFIG, fileConfig))
  return cachedConfig
}

/** 深度合并（fileConfig 覆盖 DEFAULT_CONFIG）。 */
function deepMerge(base, override) {
  if (typeof base !== 'object' || base === null) return override
  if (typeof override !== 'object' || override === null) return override
  const result = Array.isArray(base) ? [...base] : { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = deepMerge(base[key] ?? {}, value)
    } else {
      result[key] = value
    }
  }
  return result
}

/** 重置配置缓存（设置变更时调用）。 */
export function resetConfigCache() {
  cachedConfig = null
}

/**
 * 角色匹配（简化版）：仅 name 精确匹配，未匹配回退第一个角色，无角色返回 undefined。
 * 去掉 B 的 target 双向包含模糊匹配（易误匹配，更不可预测）。
 */
export function resolveRole(roles, roleParam) {
  if (!roles || roles.length === 0) return undefined
  if (!roleParam) return roles[0]
  const nameMatch = roles.find((r) => r.name === roleParam)
  if (nameMatch) return nameMatch
  return roles[0] // 未匹配回退第一个
}

/** 按引擎返回默认音色（volcano ↔ mimo 各自独立，避免跨引擎串用导致 API 400）。 */
function defaultVoiceByEngine(config) {
  const hasKey = (cfg) => cfg && cfg.apiKey && cfg.apiKey.trim() && !cfg.apiKey.startsWith('${')
  // auto 选型与 factory 一致：有 MiMo Key → MiMo 音色；否则火山音色
  const useMimo = config.engine === 'mimo' ||
    (config.engine === 'auto' && hasKey(config.mimo))
  return useMimo && config.mimo?.voice ? config.mimo.voice : config.cloud?.voice
}

/** 解析最终选项：角色配置 > 全局配置 > 场景配置 > 调用参数覆盖。 */
export function resolveOptions(config, scene, override, role) {
  const result = {
    voice: role?.voice ?? config.voice ?? defaultVoiceByEngine(config),
    rate: role?.rate ?? config.rate ?? 200,
    volume: role?.volume ?? config.volume ?? 1.3,
    emotion: role?.emotion,
    emotionIntensity: role?.emotionIntensity,
  }
  // 场景配置：角色场景 > 全局场景
  if (scene) {
    if (config.scenes) {
      const globalScene = config.scenes[scene]
      if (globalScene) {
        if (globalScene.voice !== undefined) result.voice = globalScene.voice || result.voice
        if (globalScene.rate !== undefined) result.rate = globalScene.rate
        if (globalScene.volume !== undefined) result.volume = globalScene.volume
        if (globalScene.emotion !== undefined) result.emotion = globalScene.emotion
        if (globalScene.emotionIntensity !== undefined) result.emotionIntensity = globalScene.emotionIntensity
      }
    }
    if (role?.scenes) {
      const roleScene = role.scenes[scene]
      if (roleScene) {
        if (roleScene.voice !== undefined) result.voice = roleScene.voice || result.voice
        if (roleScene.rate !== undefined) result.rate = roleScene.rate
        if (roleScene.volume !== undefined) result.volume = roleScene.volume
        if (roleScene.emotion !== undefined) result.emotion = roleScene.emotion
        if (roleScene.emotionIntensity !== undefined) result.emotionIntensity = roleScene.emotionIntensity
      }
    }
  }
  // 调用参数覆盖（最高优先级）
  if (override?.voice !== undefined) result.voice = override.voice
  if (override?.rate !== undefined) result.rate = override.rate
  if (override?.volume !== undefined) result.volume = override.volume
  if (override?.emotion !== undefined) result.emotion = override.emotion
  if (override?.emotionIntensity !== undefined) result.emotionIntensity = override.emotionIntensity
  return result
}
