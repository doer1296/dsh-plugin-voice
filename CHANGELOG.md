# Changelog

All notable changes to this project will be documented in this file.

## [0.1.2] - 2025

### Changed
- 提示音音量增益从 +50% 提升到 **+100%**（`SOUND_GAIN` 1.5 → 2.0，自适应增益防削波；语音音量由引擎独立控制，不受影响）
- 场景提示音**移除全部蜂鸣**（beep:*），只用 assets 内置 9 个 WAV 音效；设置面板 / 测试页下拉同步精简
- 5 场景默认音效：开始=light / 完成=bright / 出错=sudden / 呼叫=ding_ding / 关键点=gift

### Fixed
- **修复 8 个内置 WAV 播放无声**：这些文件 RIFF size 字段比实际小 4 字节，Windows SoundPlayer 严格校验直接拒播（"wave header is corrupt"）。`amplifyWav` 重写为播放前先修正 RIFF size（按实际文件大小重写）再放大，9 个 WAV 全部可播

## [0.1.1] - 2025

### Added
- 设置面板 / 测试页顶部新增版本徽标（`DSH-语音助手 v0.1.1`，构建时从 package.json 注入，与 better-sidebar 同款样式）
- 新任务自动播报「开始」：`agent/inbox/inserted` 收到用户消息且 agent 空闲时自动播放 task_start 模板（开关 `onTaskStart`，默认开）
- 系统提示词升级：关键点（milestone）从「推荐」改为「必须」，多步任务关键进展节点强制播报进度

### Fixed
- 修复此前「开始」/「关键点」场景无事件兜底、纯靠模型自觉导致听不到语音的问题

## [0.1.0] - 2025

### Added
- 初始版本：融合 dsh-plugin-notify（DSH 原生集成）+ agent-voice-mcp-minus（云端 TTS 调优）
- 云端 TTS 引擎层：火山 seed-tts v3 单向流式（node:https 原生直连，绕开全局 fetch 代理劫持）
- 引擎 factory 抽象：`auto` 模式自动选引擎（有火山 Key 用火山，否则 SAPI）
- SAPI 离线固定兜底：火山失败（断网 / 额度 / Key 失效）自动回退，播报永不中断
- 长文案停顿控制：按句切分并行合成 + 句间静音
- 播报前文本清洗：去 Markdown / 代码块 / URL
- 情绪声学映射：6 情绪 → pitch + 语速/音量偏移
- 蓝牙前导静音：默认 1500ms 可调
- 场景化提示音：Console.Beep 蜂鸣 + 9 内置 WAV
- 火山 1.0 音质参数：nlp_para（标点偏向/不等号读法）+ post_process.energy_rate 能量增益 + 网络瞬时故障重试
- DSH 全注入点集成：speak/notify_user/user_activity/stop_voice/get_voices 工具 + /voice 命令 + /voice 测试页 + 系统提示词注入 + 设置面板
- 智能「确认窗口」呼叫：toast → 60s 确认 → 超时语音呼叫（云端）
- onlyIfAway 模式：speak 工具可指定「仅用户离开时播报」，在场自动降级 toast
- 事件驱动兜底：agent/turn-stopping / agent/error / agent/inbox/inserted
- 角色系统（简化版）：多 agent 不同音色，name 精确匹配
- 设置面板可调：音量 / 语速 / 引擎 / 火山 Key / 音色 / 大模型（资源 ID）/ 蓝牙前导静音 / 5 场景模板 + 「试听当前配置」按钮
- 配置单源：所有设置存于 ~/.dsh/voice/config.json（移除 DSH settings scope 双写）

### Changed
- 相比 dsh-plugin-notify：语音播报从 SAPI 升级为云端 TTS（火山 seed-tts）
- 相比 dsh-plugin-notify：去掉 Python 依赖（音效改 Console.Beep + WAV，音量增强改服务端 volume 参数）
- 相比 agent-voice-mcp-minus：从独立 MCP Server 改为 DSH 原生插件（同进程，无 stdio）
- 相比 agent-voice-mcp-minus：去掉 watcher 文件轮询兜底（DSH 有事件驱动）
- 相比 agent-voice-mcp-minus：去掉跨平台引擎（仅 Windows，专注一平台性能最优）
- 相比 agent-voice-mcp-minus：**Edge TTS 已移除**（微软 token 实测失效 403，改用火山官方 API + SAPI 兜底）
- 相比 agent-voice-mcp-minus：SAPI 兜底从默认启用改为固定启用不可关闭
- 相比 agent-voice-mcp-minus：角色匹配去掉 target 双向包含模糊匹配，仅 name 精确匹配
- 相比 agent-voice-mcp-minus：火山请求从 fetch 改为 node:https 原生直连（解决 DSH 全局代理劫持）
- apply() 幂等保护 + 引擎日志去重（兼容 DSH HMR 重载）