/**
 * TTS 引擎工厂（火山 + MiMo + SAPI，无 Edge TTS）。
 *
 * 选型逻辑（候选链）：
 *   engine === 'auto'  → MiMo（默认，有 Key 用）→ 火山 → SAPI
 *   engine === 'mimo'  → MiMo → 火山 → SAPI（Key 缺失自动降级，不报错）
 *   engine === 'volcano' → 火山 → MiMo → SAPI
 *   engine === 'windows-sapi' → SAPI（离线，机械音，兜底）
 *
 * 兜底：SAPI 兜底固定启用（由 index.js 通过 createFallbackEngine 注入 VoiceQueue），
 *      云端引擎失败（断网/额度/Key 失效）自动回退 SAPI。
 *
 * 性能优化：TTS 引擎通过动态 import() 懒加载——DSH 启动加载插件时只加载本模块
 * 的轻量逻辑，火山/MiMo provider / SAPI 引擎等重型模块在首次播报时才真正加载，
 * 显著减少插件加载时间。
 *
 * factory 扩展位：未来加其他云端引擎，只需在候选链新增一项 + 新建对应 provider 文件。
 */

let cachedEngine = null
let enginePromise = null
// 缓存引擎类的动态 import Promise（避免重复加载）
let volcanoClassPromise = null
let mimoClassPromise = null
let sapiClassPromise = null

function getVolcanoClass() {
  if (!volcanoClassPromise) {
    volcanoClassPromise = import('./cloud/providers/volcano.js').then((m) => m.VolcanoProvider)
  }
  return volcanoClassPromise
}

function getMimoClass() {
  if (!mimoClassPromise) {
    mimoClassPromise = import('./cloud/providers/mimo.js').then((m) => m.MimoProvider)
  }
  return mimoClassPromise
}

function getSapiClass() {
  if (!sapiClassPromise) {
    sapiClassPromise = import('./windows-sapi.js').then((m) => m.WindowsSAPIEngine)
  }
  return sapiClassPromise
}

// 引擎日志去重：DSH 的 HMR 会重载插件导致 createTTSEngine 被多次调用（各实例有独立模块缓存），
// 记录已打印的引擎描述，相同的不重复输出，避免终端刷屏。
let lastLoggedEngine = null

function logEngine(desc) {
  if (lastLoggedEngine === desc) return
  lastLoggedEngine = desc
  console.log(`[voice] ${desc}`)
}

/**
 * @param {Object} options
 * @param {string} options.engine - auto / volcano / mimo / windows-sapi
 * @param {Object=} options.cloud - 火山引擎配置（apiKey/voice/resourceId/...）
 * @param {Object=} options.mimo - 小米 MiMo 配置（apiKey/voice/...）
 */
export function createTTSEngine(options = {}) {
  // 并发安全：多个并发调用共享同一个初始化 Promise，避免重复创建引擎
  if (cachedEngine) return Promise.resolve(cachedEngine)
  if (enginePromise) return enginePromise

  enginePromise = (async () => {
    const engineType = options.engine || 'auto'
    const hasKey = (cfg) => cfg && cfg.apiKey && cfg.apiKey.trim() && !cfg.apiKey.startsWith('${')

    /** 按候选列表尝试创建引擎：返回第一个 Key 可用的；全失败返回 null（走 SAPI）。 */
    const tryCandidates = async (candidates) => {
      for (const cand of candidates) {
        if (cand.type === 'windows-sapi') {
          const SAPI = await getSapiClass()
          cachedEngine = new SAPI()
          logEngine(`${cand.label}`)
          return cachedEngine
        }
        if (!hasKey(cand.cfg)) continue
        try {
          if (cand.type === 'mimo') {
            const Mimo = await getMimoClass()
            cachedEngine = new Mimo(cand.cfg)
          } else if (cand.type === 'volcano') {
            const Volcano = await getVolcanoClass()
            cachedEngine = new Volcano(cand.cfg)
          }
          logEngine(`${cand.label}`)
          return cachedEngine
        } catch (e) {
          console.warn(`[voice] ${cand.label} 初始化失败，回退下个引擎: ${e.message}`)
        }
      }
      return null
    }

    const MIMO = { type: 'mimo', cfg: options.mimo, label: 'auto → 小米 MiMo（已配置 Key）' }
    const VOLCANO = { type: 'volcano', cfg: options.cloud, label: 'auto → 火山引擎（已配置 Key）' }
    const SAPI = { type: 'windows-sapi', label: 'auto → SAPI（无云端 Key，离线兜底）' }

    // 自选引擎 = 对应该引擎优先的候选链；auto = MiMo（默认）→ 火山 → SAPI
    const chain =
      engineType === 'volcano' ? [VOLCANO, MIMO, SAPI] :
      engineType === 'mimo' ? [MIMO, VOLCANO, SAPI] :
      engineType === 'auto' ? [MIMO, VOLCANO, SAPI] :
      null

    if (chain) {
      // 显式自选引擎（非 auto）时，log 文案用「显式 →」前缀而非 auto
      if (engineType !== 'auto') {
        MIMO.label = `mimo → 小米 MiMo（已配置 Key）`
        VOLCANO.label = `volcano → 火山引擎（已配置 Key）`
        SAPI.label = `${engineType} → 无可用 Key，降级 SAPI 兜底`
      }
      cachedEngine = await tryCandidates(chain)
      return cachedEngine
    }

    if (engineType === 'windows-sapi') {
      const SAPI = await getSapiClass()
      cachedEngine = new SAPI()
      logEngine('windows-sapi（显式离线）')
      return cachedEngine
    }

    throw new Error(`不支持的引擎: ${engineType}。支持: auto / volcano / mimo / windows-sapi`)
  })().finally(() => {
    enginePromise = null
  })

  return enginePromise
}

/** 重置缓存（测试用 + 设置面板切引擎时用） */
export function resetEngineCache() {
  cachedEngine = null
  enginePromise = null
}

/** 创建兜底引擎（SAPI，动态加载） */
export async function createFallbackEngine() {
  const SAPI = await getSapiClass()
  return new SAPI()
}
