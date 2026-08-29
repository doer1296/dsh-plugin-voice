/**
 * TTS 引擎接口（移植自 agent-voice-mcp-minus dist/tts/interface.js）。
 * 所有引擎实现此接口，可插拔。未来加新引擎只需新增一个 provider 文件。
 *
 * 接口契约：
 *   speak(text, options, onBeforePlay?): Promise<void>
 *     - text: 要播报的文本（已清洗已截断）
 *     - options: { voice, rate, volume, emotion, emotionIntensity }
 *     - onBeforePlay: 可选回调，合成完成、本地播放前调用（用于响提示音）
 *   stop(): void —— 停止当前播放
 *   getVoices(): Promise<string[]> —— 列出可用音色
 *
 * 实现者：
 *   - VolcanoProvider（火山 seed-tts v3 流式，高音质）
 *   - WindowsSAPIEngine（离线兜底）
 */

/**
 * @typedef {Object} TTSOptions
 * @property {string=} voice
 * @property {number=} rate
 * @property {number=} volume
 * @property {string=} emotion
 * @property {number=} emotionIntensity
 */

/**
 * @typedef {Object} TTSEngine
 * @property {(text: string, options: TTSOptions, onBeforePlay?: () => Promise<void>) => Promise<void>} speak
 * @property {() => void} stop
 * @property {() => Promise<string[]>} getVoices
 */

export {}
