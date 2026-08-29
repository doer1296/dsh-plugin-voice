/**
 * TTS 引擎工厂（精简为火山 + SAPI，无 Edge TTS）。
 *
 * 选型逻辑：
 *   engine === 'auto'  → 有火山 Key 用火山，否则用 SAPI（默认策略）
 *   engine === 'volcano' → 火山（需 cloud.apiKey）
 *   engine === 'windows-sapi' → SAPI（离线，机械音，兜底）
 *
 * 兜底：SAPI 兜底固定启用（由 index.js 通过 createFallbackEngine 注入 VoiceQueue），
 *      火山失败（断网/额度/Key 失效）自动回退 SAPI。
 *
 * 性能优化：TTS 引擎通过动态 import() 懒加载——DSH 启动加载插件时只加载本模块
 * 的轻量逻辑，火山 provider / SAPI 引擎等重型模块在首次播报时才真正加载，
 * 显著减少插件加载时间。
 *
 * factory 扩展位：未来加其他云端引擎，只需在此 switch 新增一个 case + 新建对应 provider 文件。
 */

let cachedEngine = null
let enginePromise = null
// 缓存引擎类的动态 import Promise（避免重复加载）
let volcanoClassPromise = null
let sapiClassPromise = null

function getVolcanoClass() {
  if (!volcanoClassPromise) {
    volcanoClassPromise = import('./cloud/providers/volcano.js').then((m) => m.VolcanoProvider)
  }
  return volcanoClassPromise
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
 * @param {string} options.engine - auto / volcano / windows-sapi
 * @param {Object=} options.cloud - 火山引擎配置（apiKey/voice/resourceId/...）
 */
export function createTTSEngine(options = {}) {
  // 并发安全：多个并发调用共享同一个初始化 Promise，避免重复创建引擎
  if (cachedEngine) return Promise.resolve(cachedEngine)
  if (enginePromise) return enginePromise

  enginePromise = (async () => {
    const engineType = options.engine || 'auto'

    if (engineType === 'windows-sapi') {
      const SAPI = await getSapiClass()
      cachedEngine = new SAPI()
      return cachedEngine
    }

    if (engineType === 'volcano') {
      if (!options.cloud) throw new Error('火山引擎需要 cloud 配置（apiKey/voice/resourceId）')
      const Volcano = await getVolcanoClass()
      cachedEngine = new Volcano(options.cloud)
      return cachedEngine
    }

    // auto：有火山 Key 用火山，否则用 SAPI
    if (engineType === 'auto') {
      if (options.cloud && options.cloud.apiKey && options.cloud.apiKey.trim() && !options.cloud.apiKey.startsWith('${')) {
        try {
          const Volcano = await getVolcanoClass()
          cachedEngine = new Volcano(options.cloud)
          logEngine('auto → 火山引擎（已配置 Key）')
          return cachedEngine
        } catch (e) {
          console.warn('[voice] 火山引擎初始化失败，回退 SAPI:', e.message)
        }
      }
      const SAPI = await getSapiClass()
      cachedEngine = new SAPI()
      logEngine('auto → SAPI（无火山 Key，离线兜底）')
      return cachedEngine
    }

    throw new Error(`不支持的引擎: ${engineType}。支持: auto / volcano / windows-sapi`)
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
