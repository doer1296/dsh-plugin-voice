/**
 * 语音播报队列 + 文本清洗 / 截断（移植自 agent-voice-mcp-minus dist/voice-queue.js）。
 *
 * 设计：
 *   - 串行队列：语音播报必须串行，避免多个通知重叠
 *   - maxSize=2：超出丢弃旧的，实时性优先于完整性
 *   - 火山失败时固定回退 SAPI（始终启用）
 *   - onBeforePlay 回调：合成完成后、播放前响提示音（唤醒蓝牙链路）
 *   - waitForDone：返回 Promise，队列空时 resolve（用于工具 execute 等待）
 *
 * 性能优化：playNotificationSound 通过动态 import() 懒加载（提示音模块在
 * 首次播放时才加载，不阻塞 DSH 启动）。
 */
const NOTIFICATION_GAP_MS = 2000

let notificationSoundPromise = null
function getPlayNotificationSound() {
  if (!notificationSoundPromise) {
    notificationSoundPromise = import('./tts/notification-sound.js').then((m) => m.playNotificationSound)
  }
  return notificationSoundPromise
}

/** 播报前清洗：去除代码块 / URL / Markdown 标记，避免合成时读出「井号、反引号」。 */
export function cleanSpeechText(text) {
  return String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#+\s*/gm, '')
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/** 超长截断：优先在句读处收口，避免半句突兀截断。 */
export function truncateForSpeech(text, maxLen) {
  if (!maxLen || text.length <= maxLen) return text
  const head = text.slice(0, maxLen)
  const lastStop = Math.max(
    head.lastIndexOf('。'), head.lastIndexOf('！'), head.lastIndexOf('？'),
    head.lastIndexOf('；'), head.lastIndexOf('，'), head.lastIndexOf(','),
  )
  return lastStop > maxLen / 2 ? head.slice(0, lastStop + 1) : head
}

export class VoiceQueue {
  queue = []
  maxSize
  engine
  processing = false
  notificationSound
  fallbackEngine = null
  hasPlayedNotification = false
  prevEnqueuedAt = 0
  doneResolve = null
  donePromise = null

  constructor(engine, maxSize = 2, notificationSound, fallbackEngine = null) {
    this.engine = engine
    this.maxSize = maxSize
    this.notificationSound = notificationSound
    this.fallbackEngine = fallbackEngine
  }

  enqueue(text, options, notificationSound) {
    while (this.queue.length >= this.maxSize) this.queue.shift()
    this.queue.push({ text, options, enqueuedAt: Date.now(), notificationSound })
    this.processQueue()
  }

  stop() {
    this.queue = []
    this.engine.stop()
  }

  async processQueue() {
    if (this.processing) return
    this.processing = true
    this.hasPlayedNotification = false
    while (this.queue.length > 0) {
      const item = this.queue.shift()
      // 间隔超 NOTIFICATION_GAP_MS 视为新批次，重新响提示音
      if (this.hasPlayedNotification && this.prevEnqueuedAt > 0 &&
          item.enqueuedAt - this.prevEnqueuedAt > NOTIFICATION_GAP_MS) {
        this.hasPlayedNotification = false
      }
      this.prevEnqueuedAt = item.enqueuedAt
      let onBeforePlay
      try {
        if (!this.hasPlayedNotification && this.notificationSound !== false) {
          const sound = item.notificationSound ?? this.notificationSound
          this.hasPlayedNotification = true
          const playSound = await getPlayNotificationSound()
          onBeforePlay = () => playSound(sound)
        }
        await this.engine.speak(item.text, item.options, onBeforePlay)
      } catch (err) {
        console.error('[voice] 播报失败:', err instanceof Error ? err.message : err)
        // 火山失败 → 固定回退 SAPI（始终启用）
        if (this.fallbackEngine) {
          try {
            const sapiOptions = {
              rate: item.options?.rate,
              volume: item.options?.volume,
            }
            console.error('[voice] 回退本地 SAPI 引擎')
            await this.fallbackEngine.speak(item.text, sapiOptions, onBeforePlay)
          } catch (err2) {
            console.error('[voice] SAPI 兜底也失败:', err2 instanceof Error ? err2.message : err2)
          }
        }
      }
    }
    this.processing = false
    if (this.queue.length > 0) {
      this.processQueue()
    } else if (this.doneResolve) {
      this.doneResolve()
      this.doneResolve = null
      this.donePromise = null
    }
  }

  /** 返回 Promise，队列空时 resolve。 */
  waitForDone() {
    if (!this.processing && this.queue.length === 0) return Promise.resolve()
    if (!this.donePromise) {
      this.donePromise = new Promise((resolve) => { this.doneResolve = resolve })
    }
    return this.donePromise
  }
}
