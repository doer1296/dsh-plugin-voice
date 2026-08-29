# dsh-plugin-voice

[![npm version](https://img.shields.io/npm/v/dsh-plugin-voice.svg)](https://www.npmjs.com/package/dsh-plugin-voice)
[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/doer1296/dsh-plugin-voice)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-blue)](https://github.com/doer1296/dsh-plugin-voice)

> DeepSeek Harness 插件：语音 + 通知出口——agent 通过云端 TTS（火山 seed-tts 高音质，失败自动回退 SAPI）/ 桌面通知 / 提示音主动联系用户。Windows 原生，零 Python 依赖。

## 功能

- 云端高质量 TTS：火山 seed-tts 大模型流式合成，6 情绪声学映射
- 智能兜底：火山失败（断网 / 额度 / Key 失效）自动回退 Windows SAPI 离线语音
- 场景化提示音：5 场景各配一个内置 WAV 音效，播完立即接语音
- 智能呼叫：回合结束通知 → 60 秒确认窗口 → 超时且你离开 → 语音叫你回来；agent 提问等待过久也自动呼叫
- 长文案优化：按句切分并行合成 + 文本清洗（不读代码块 / URL / Markdown 标记）
- 设置面板：引擎 / 音色 / 音量 / 语速 / Key / 场景模板与提示音，实时生效，支持试听
- 测试页：浏览器打开 `/voice`，选模式 / 场景 / 情绪点发送

## 安装

```bash
dsh plugin --profile web add dsh-plugin-voice
dsh web   # 重启生效
```

要求：Windows 10 / 11 + Node.js 22.5+（PowerShell 系统自带）。

> **pnpm 用户**：推荐用上面的 registry 安装（npm 包自带构建产物，零配置秒装）。git 方式安装需克隆仓库（较慢），且 pnpm 的 allowBuilds 只认「包名@精确 tarball URL」（URL 含 commit hash，仓库每次更新都会变），供应链门禁还可能改写你的 `pnpm-workspace.yaml`。本仓库已提交 `lib/`，git 安装**无需现场构建**；若仍被 `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED` 拦截，改用 registry 安装即可。

## 使用

**模型主动播报**（核心场景）——直接对话即可：

> "查一下项目状态，完成后用语音叫我"

**手动播报 / 通知**：

```
/voice 任务完成了
/voice --scene=task_complete --emotion=happy 搞定了
```

## 配置

设置面板（DSH 设置 → 语音）即可完成全部常用配置。火山 Key：注册[火山引擎](https://www.volcengine.com/) → 开通「语音合成大模型」→ 创建 X-Api-Key → 面板填入（或环境变量 `VOLCANO_API_KEY`）。未配置 Key 自动用 SAPI 离线语音。

高级参数（角色 / 场景音色 / 云端音质微调）见 [config.example.json](config.example.json)。

## 致谢

- [dsh-plugin-notify](https://github.com/huguangyu666/dsh-plugin-notify) by huguangyu666 —— DSH 原生集成骨架
- [agent-voice-mcp-minus](https://github.com/doer1296/agent-voice-mcp-minus) —— 云端 TTS 引擎
- [火山引擎 · 豆包语音合成大模型](https://www.volcengine.com/product/voice)

## License

MIT（继承两源项目协议，保留原作者署名）
