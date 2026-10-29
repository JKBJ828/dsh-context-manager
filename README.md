# dsh-context-manager

> 在 DSH 会话底部管理上下文：**按轮删除对白**（被删的轮次不再进入模型上下文），并**查看 / 编辑本会话的提示词**。其他插件提供的提示词只读。

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## 它做什么

| 入口 | 能力 |
|---|---|
| **管理上下文** | 列出本会话每一轮对白，逐轮删除。删除后该轮不再进入模型上下文，但会话本身、其他轮次、原始日志都保留 |
| **管理提示词** | 查看模型当前收到的系统提示词全文；编辑"本会话补充提示词"这一段；Harness 内置 / Agent 预设 / 工具与技能插件 / 运行时上下文一律只读 |

两个入口在输入框下方（`conversation.composer.dock`），点开是浮层，不需要新开会话。

## 安装

```bash
git clone https://github.com/JKBJ828/dsh-context-manager.git
```

然后在 DSH 里用插件管理器从该目录安装（`install_bundle`，target 指向克隆下来的目录）。安装后需要重启一次 DSH 让 Host 半加载。

要求：

- DSH `0.2.1-rc.3` 或兼容版本
- 会话格式 v4（`session.v4.jsonl.zstd`）
- Web GUI（客户端半只注册到网页）

## 用法

输入框下方：

```
管理上下文    管理提示词
```

命令行等价物（UI 与命令共用同一套实现）：

```
/context                     摘要：共几轮、可见几轮、删了几轮
/context delete 3            删除第 3 轮
/context delete 2,5-7        批量
/context prompt set <b64url> 写入本会话补充提示词
/context prompt clear        清空
```

删除是**用户操作**：不提供模型工具，模型无法自己删上下文或改提示词。

## 它是怎么做到的

### 删除一轮

删除不是重写日志，而是向会话追加一条 **surface replacement**（只遮不删）：

```js
session.append('user/message', {
  id: `ctxmgr-del-${turn}-${session.seq}`,
  role: 'user',
  source: { kind: 'user' },
  content: [{ type: 'text', text: '〔该轮对话已由用户删除〕' }],
}, {
  surfaceOp: { op: 'replace', startSeq, endSeq },
  sourceEventSeqs: shadowed,   // 必须覆盖全部被遮蔽节点
})
await ctx.sessions.flush(session)
```

模型看到的历史由 surface 推导，被遮蔽的轮次不再出现在里面；原始事件仍在日志中，面板里仍可回看。

两个被格式逼出来的约束：

1. **不能用 `system/message` 当墓碑。** v4 要求 `system/message` 必须落在打开的 turn/step 内，且 `turn/step` 为正；在轮外写入虽然能过写入校验，恢复时会被判为日志损坏。
2. **`user/message` 至少带一条内容。** 能"投影为 null"的只有空内容的 system/developer 消息，而它们同样要求打开的 step。所以被删的一轮会留下一行占位：`〔该轮对话已由用户删除〕`。

删除要求：会话空闲、该轮 surface 节点连续、不触碰系统提示词（节点 0）。

### 提示词

每个 agent 作用域注册一段 section，`text()` 每次装配重读：

```js
agent.ctx.systemPrompt.section({
  name: 'plugin:context-manager/user-prompt',
  order: 10150,
  text: () => sectionText(sessionId),
})
```

所以：保存后**下一次模型请求**生效；其他插件的 section 取不到、也改不了。

### 状态与存储

- 删除状态、轮次列表、最近一次渲染的提示词：由 `sessionProjections` 单元 `contextManager` 从日志折叠，客户端通过 `useProjection('contextManager')` 读取（重启、fork 后一致）。
- 补充提示词文本：存在 `<profile 目录>/.context-manager/prompts.json`。

## 已知限制

| 项 | 说明 |
|---|---|
| 原始日志 | 删除不动原始事件；磁盘上仍可找到原文 |
| 检索工具 | 若安装了 `dsh-tool-session-query`，默认仍能搜到被删内容（等上游支持 surface 过滤后可在插件里加"彻底删除"开关） |
| 其他会话 | 第三方插件若把旧会话原文搬进新会话，不受本插件约束 |
| 压缩检查点 | 删的是轮次；已概括进摘要的内容不会因删原轮次而消失 |
| 生效时机 | 提示词改动在下一次模型请求生效 |
| 占位行 | 每轮删除会在上下文里留下 `〔该轮对话已由用户删除〕` |

## 开发

纯 JS，无构建步骤、无运行时依赖（不依赖 zod / 其他 DSH 包）。

```
index.js            Host：命令、投影、systemPrompt section、存储
client.js           Client：dock 入口 + 浮层
cordis.patch.yml    插入 context-manager 行
locale/*.json       插件管理器里的标题/描述
icon.svg
```

> 说明：投影注册的 `stateSchema` / `viewSchema` 传的是透传对象（运行时只会调用 `.parse()`），这是为了让插件零依赖；如果将来 registry 改用 `.safeParse()` 等，需要补一个轻量校验。

## English

A DSH plugin that lets you delete a single conversation turn from the model-visible context, and edit a per-session supplementary system prompt. Deletion appends a surface replacement and leaves the original log untouched; prompts from other plugins stay read-only. Requires DSH `0.2.1-rc.3` with the Web GUI and session format v4.

## License

[MIT](LICENSE)
