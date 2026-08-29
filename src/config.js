/**
 * 配置加载与选项解析（移植自 agent-voice-mcp-minus dist/config.js，简化角色匹配）。
 *
 * 配置优先级（settings.yaml 单源，config.json 补高级参数）：
 *   1. DSH 原生设置（settings.yaml 的 voice 分区）—— 面板 16 键最高优先（覆盖 config.json 同键）
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
  if (v.leadingSilence !== undefined) result.leadingSilence = v.leadingSilence
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
  if (v.leadingSilence !== undefined) cloud.leadingSilence = v.leadingSilence
  if (Object.keys(cloud).length) result.cloud = cloud
  if (v.templates && typeof v.templates === 'object') result.templates = v.templates
  if (v.sceneSounds && typeof v.sceneSounds === 'object') result.sceneSounds = v.sceneSounds
  return result
}

const DEFAULT_CONFIG = {
  engine: 'auto',
  cloud: {
    provider: 'volcano',
    apiKey: '${VOLCANO_API_KEY}',
    voice: 'zh_female_daimengchuanmei_moon_bigtts',
    resourceId: 'seed-tts-1.0',
    format: 'pcm',
    sampleRate: 24000,
    silenceDuration: 400,
    leadingSilence: 1500,
    pauseControl: true,
    pauseSentenceMs: 400,
    pauseCommaMs: 200,
    timeout: 30000,
    // 音质增强参数（seed-tts-1.0 支持）
    nlpPara: { punctuationBias: 0, inequalityChoose: 0 }, // 标点偏向 / 特殊字符读法
    energyRate: 0,   // 能量增益 -50~100（提升响度感知）
    retries: 1,      // 网络瞬时故障重试次数
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
  //    低优先级——面板能改的 16 个键以 settings 为准，config.json 的同键会被覆盖
  if (existsSync(resolvedPath)) {
    try {
      const fileVal = JSON.parse(readFileSync(resolvedPath, 'utf-8'))
      fileConfig = deepMerge(fileConfig, fileVal)
    } catch {
      console.error(`[voice] 配置文件解析失败: ${resolvedPath}，使用默认`)
    }
  }

  // 2. DSH 原生设置（settings.yaml 的 voice 分区）——最高优先级。
  //    scope.get() 返回 resolved（含 schema 默认值），因此面板 16 键在此覆盖 config.json；
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

/** 解析最终选项：角色配置 > 全局配置 > 场景配置 > 调用参数覆盖。 */
export function resolveOptions(config, scene, override, role) {
  const result = {
    voice: role?.voice ?? config.voice ?? config.cloud?.voice,
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
  // 蓝牙前导静音：提示音带头静音（唤醒蓝牙链路）用；语音侧在同一提示音后播放时跳过自身前导静音
  result.leadingSilence = config.leadingSilence ?? config.cloud?.leadingSilence ?? 0
  return result
}
