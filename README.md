# dsh-plugin-voice

[![npm version](https://img.shields.io/npm/v/dsh-plugin-voice.svg)](https://www.npmjs.com/package/dsh-plugin-voice)
[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/doer1296/dsh-plugin-voice)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-blue)](https://github.com/doer1296/dsh-plugin-voice#兼容性与权限说明)

> DeepSeek Harness 插件：语音 + 通知出口——agent 通过云端 TTS（火山 seed-tts 高音质，失败自动回退 SAPI）/ 桌面通知 / 提示音主动联系用户。
>
> 融合 [dsh-plugin-notify](https://github.com/huguangyu666/dsh-plugin-notify)（DSH 原生深度集成 + 智能确认窗口呼叫）与 [agent-voice-mcp-minus](https://github.com/doer1296/agent-voice-mcp-minus)（云端 seed-tts + 长文案停顿 + 文本清洗 + 情绪映射 + 蓝牙前导静音）两套优势，为 DSH 量身定制，性能最优、适配性最好。Windows 原生，零 Python 依赖。

## 功能

- **云端高质量 TTS**：火山引擎 seed-tts 大模型流式合成（seed-tts-1.0 模式，全参数调优，node:https 原生直连）
- **智能引擎选择**：`auto` 模式——配火山 Key 用火山，未配 / 火山失败自动回退 SAPI（固定兜底，播报不中断）
- **音质参数调优**：`nlp_para`（标点偏向 / 不等号读法）+ `post_process`（pitch 音调 / energy_rate 能量增益）+ `audio_params`（语速 / 音量 / 24kHz）+ 网络瞬时故障重试
- **DSH 全注入点集成**：工具（speak/notify_user/user_activity/stop_voice/get_voices）/ 命令（/voice）/ 路由（/voice 测试页）/ 系统提示词 / 设置面板 / 事件驱动
- **智能「确认窗口」呼叫**：回合结束 toast → 60 秒确认窗口 → 超时未互动则语音呼叫（云端高音质）
- **onlyIfAway 模式**：speak 工具可指定「仅用户离开电脑时播报」——用户在场自动降级为桌面通知，避免打扰
- **事件驱动兜底**：`agent/turn-stopping`（完成通知）/ `agent/error`（出错通知）/ `agent/inbox/inserted`（用户互动取消呼叫 + 新任务自动播报「开始」）
- **系统提示词注入**：让 agent 默认有「主动播报」习惯（5 场景 + 情绪指引），不用每次教
- **长文案停顿控制**：按句切分并行合成 + 句间静音，长播报有呼吸感、节奏自然
- **播报前文本清洗**：去代码块 / URL / Markdown 标记，不会读出「井号、反引号」
- **情绪声学映射**：6 情绪（happy/sad/angry/calm/excited/neutral）→ pitch + 语速/音量偏移
- **蓝牙前导静音**：默认 1500ms，语音前插全静音，防蓝牙耳机吞首字；有线用户可设 0
- **场景化提示音**：9 内置 WAV 音效（音量 +100% 放大，播放前自动修正文件头），5 场景可各自选配，播报前先响唤醒蓝牙链路
- **角色系统**：多 agent 不同音色 / 语速 / 情绪（简化版，name 精确匹配）
- **设置面板**：音量 / 语速 / 引擎 / 火山 Key / 音色 / 大模型 / 蓝牙前导静音 / 5 场景模板 + 5 场景提示音下拉 + 「试听当前配置」按钮，顶部带版本徽标
- **新任务自动播报「开始」**：发新消息（agent 空闲）＝新任务开始，自动播放「开始」模板（开关 `onTaskStart`，默认开）
- **配置单源**：所有设置存于 `~/.dsh/settings.yaml` 的 `voice:` 分区（DSH 原生设置，设置面板保存即生效）
- **SAPI 固定兜底**：火山失败（断网 / 额度 / Key 失效）自动回退离线语音，播报永不中断

## 安装

**方式一：官方命令（推荐）**

```bash
dsh plugin --profile web add dsh-plugin-voice
dsh web   # 重启生效
```

**方式二：手动**

```bash
npm i dsh-plugin-voice
```

在 dsh 的 profile patch（`~/.dsh/profiles/<profile>/cordis.patch.yml`）中挂载：

```yaml
- insert:
    - id: voice
      name: 'dsh-plugin-voice'
```

重启 dsh 即生效。要求 Windows + Node.js 22.5+ + PowerShell 5.1+（系统自带）。

## 使用

**模型主动播报**（核心场景）：

> "查一下今天的项目状态，完成后用语音叫我"

agent 会调用 `speak` 工具，语音播报会念出内容（自动清洗 Markdown + 截断 200 字）。

**手动播报 / 通知**：

```
/voice 任务完成了
/voice --speak 快回来看看结果
/voice --scene=task_complete --emotion=happy 搞定了
/voice --sound 提醒
```

**测试页**：浏览器打开 `/voice`，选模式 / 场景 / 情绪点发送；音色列表可点击试听。

### TTS 引擎配置

| 场景 | 引擎 | 配置 |
|---|---|---|
| 高音质 | 火山 seed-tts（推荐） | 设置面板填火山 API Key，`auto` 自动用火山（1.0 模式全参数调优） |
| 兜底（固定启用） | Windows SAPI | 火山失败自动回退（断网 / 额度 / Key 失效），无需配置 |
| 手动选择 | auto / volcano / windows-sapi | 设置面板「引擎」下拉切换 |

火山引擎 Key 获取：注册 [火山引擎](https://www.volcengine.com/) → 开通「语音合成大模型」→ 创建 X-Api-Key → 设置面板填入（或环境变量 `VOLCANO_API_KEY`）。

### 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `DSH_VOICE_INJECT_PROMPT` | `1` | 是否注入系统提示词（`0` 关闭） |
| `VOLCANO_API_KEY` | — | 火山引擎 X-Api-Key（避免明文落盘） |

## 文案模板

模型不写 `message` 时按场景用默认文案。模板支持 `{{summary}}` / `{{session}}` 变量：

| 场景 | 默认文案 |
|---|---|
| `task_start` | 开始执行任务 |
| `task_complete` | 任务已经完成了，快回来看看结果吧 |
| `task_error` | 任务出错了，需要你处理一下 |
| `need_interaction` | 我需要你过来看看 |
| `milestone` | 一个子任务完成了 |

## 场景 × 情绪映射

| 场景 | 默认情绪 | 默认语速 |
|---|---|---|
| `task_start` | calm | 190 |
| `task_complete` | happy | 220 |
| `task_error` | angry | 210 |
| `need_interaction` | calm | 200 |
| `milestone` | happy | 210 |

## 蓝牙前导静音（重要）

`cloud.leadingSilence`（**默认 `1500`ms**）：蓝牙耳机链路建立需 1-2s，播报开始时耳机常未连接，首字被连接杂音吞掉。本参数在语音数据最前插入指定毫秒全静音。

- **蓝牙耳机用户**：保持 `1500`（仍吞字可增至 `2000`）
- **有线耳机 / 扬声器用户**：设 `0`，播报更紧凑
- 播报前的场景提示音本身也提前唤醒蓝牙链路，与本参数协同

设置面板「行为偏好 → 蓝牙前导静音」可调。

## 架构

- **同进程**：所有逻辑在 dsh host 进程内，无独立 MCP Server / 无 watcher 子进程
- **引擎层 factory 抽象**：`createTTSEngine` 工厂 + provider 接口（speak/getVoices/stop），未来加新引擎仅需新增 provider 文件
- **后端 Windows 原生**：桌面通知 NotifyIcon / 场景蜂鸣 Console.Beep / 播放 WAV Media.SoundPlayer / 空闲检测 GetLastInputInfo（均 PowerShell，零 Python）
- **HTTP 用 Node 22+ 原生 fetch**：不引 axios / node-fetch

## 兼容性与权限说明

供开发者评估是否安装使用：

**兼容性**

- **操作系统**：Windows 10 / 11（依赖 SAPI、Media.SoundPlayer、Console.Beep、GetLastInputInfo 等 Windows 原生能力，不支持 macOS / Linux）
- **Node.js**：>= 22.5（依赖原生 fetch / node:https）
- **适配 profile**：`web`（设置面板 + /voice 测试页）；其他 profile 可用 speak 等工具但无 Web 界面
- **火山 Key 可选**：未配置自动回退 SAPI 离线语音，播报永不中断

**权限与外部访问**

- **文件系统**：读写 `~/.dsh/settings.yaml` 的 `voice:` 分区（插件配置）；向系统临时目录写入音频临时文件（播放后即删）
- **进程调用**：PowerShell（桌面通知 / 音频播放 / 用户空闲检测 / SAPI 合成），均为 Windows 系统内置组件
- **网络访问**：仅火山引擎 TTS API（需你自行配置 appkey，流量按火山计费）；**无遥测、无数据上报、无其他外联**
- **DSH 注入点**：工具（speak / notify_user / user_activity / stop_voice / get_voices）、命令（/voice）、路由（/voice 测试页）、系统提示词、设置面板、事件监听

## 致谢

- **[dsh-plugin-notify](https://github.com/huguangyu666/dsh-plugin-notify)** by huguangyu666 —— DSH 原生集成骨架、智能确认窗口、事件驱动兜底、user_activity 工具
- **[agent-voice-mcp-minus](https://github.com/doer1296/agent-voice-mcp-minus)**（fork of [agent-voice-mcp](https://github.com/al96169/agent-voice-mcp) by Antonio Liang）—— 云端 TTS 引擎、长文案停顿、文本清洗、情绪映射、蓝牙前导静音
- [火山引擎 · 豆包语音合成大模型](https://www.volcengine.com/product/voice)

## License

MIT（继承两源项目协议，保留原作者署名）
