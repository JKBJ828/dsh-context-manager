/**
 * Context Manager — Host half.
 *
 * Two capabilities over one session:
 *  - delete one turn from the model-visible surface (append-only log untouched),
 *  - edit a per-session supplementary system-prompt section.
 *
 * The client half reads `contextManager` through the projection wire view and
 * mutates through the `/context` command, so the UI and the command share one
 * implementation.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const name = '@local/dsh-context-manager'
export const inject = ['sessions', 'commands', 'systemPrompt', 'agents', 'sessionProjections']

const KEY = 'contextManager'
const SECTION = 'plugin:context-manager/user-prompt'
const MARKER = '（以下为会话所有者补充的提示词）'
const TOMBSTONE_TEXT = '〔该轮对话已由用户删除〕'
const MAX_PROMPT = 16000
const PREVIEW = 160

/** The registry only calls `parse()`; a zod instance would add a dependency the profile cannot resolve. */
const passthrough = { parse: (value) => value }

const STORE = join(process.env.DSH_PROFILE_DIR || process.cwd(), '.context-manager', 'prompts.json')

function loadPrompts() {
  try {
    const raw = JSON.parse(readFileSync(STORE, 'utf8'))
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  } catch {
    return {}
  }
}

function clip(text) {
  const value = String(text || '').trim()
  return value.length > PREVIEW ? `${value.slice(0, PREVIEW)}…` : value
}

function textOfBlocks(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join(' ')
    .trim()
}

function previewOf(event) {
  if (event.type === 'user/message') return { user: clip(textOfBlocks(event.data && event.data.content)) }
  if (event.type === 'assistant/message') {
    const message = event.data && event.data.message
    return { reply: clip(textOfBlocks(message && message.content)) }
  }
  return {}
}

function parseTurns(spec) {
  const turns = []
  for (const part of String(spec).split(',')) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(part.trim())
    if (!match) throw new Error(`不认识的轮次写法：${part.trim() || '(空)'}`)
    const from = Number(match[1])
    const to = match[2] === undefined ? from : Number(match[2])
    if (to < from) throw new Error(`轮次区间反了：${part.trim()}`)
    if (to - from > 200) throw new Error('一次最多删 200 轮')
    for (let n = from; n <= to; n += 1) turns.push(n)
  }
  return turns
}

function decodeBase64(input) {
  const value = String(input || '').trim()
  if (!value) return ''
  try {
    return Buffer.from(value, 'base64url').toString('utf8')
  } catch {
    return Buffer.from(value, 'base64').toString('utf8')
  }
}

export function apply(ctx) {
  let prompts = loadPrompts()

  function persist() {
    try {
      mkdirSync(dirname(STORE), { recursive: true })
      writeFileSync(STORE, JSON.stringify(prompts, null, 2))
    } catch (error) {
      ctx.logger.warn(`context-manager: cannot persist prompt text: ${String(error)}`)
    }
  }

  function sectionText(sessionId) {
    const text = String(prompts[sessionId] || '').trim()
    return text ? `${MARKER}\n\n${text}` : ''
  }

  // --- per-agent editable prompt section ---------------------------------
  const owned = new Map()

  function mount(agent) {
    if (!agent || owned.has(agent.id)) return
    const sessionId = agent.id
    owned.set(sessionId, agent.ctx.effect(() => agent.ctx.systemPrompt.section({
      name: SECTION,
      order: 10150,
      text: () => sectionText(sessionId),
    })))
  }

  function unmount(sessionId) {
    const dispose = owned.get(sessionId)
    if (dispose === undefined) return
    owned.delete(sessionId)
    dispose()
  }

  ctx.effect(() => () => {
    for (const dispose of owned.values()) dispose()
    owned.clear()
  })

  ctx.on('agent/created', ({ agent }) => { mount(agent) })
  ctx.on('agent/disposed', ({ agent }) => { unmount(agent.id) })
  for (const agent of ctx.agents.list()) mount(agent)

  // --- projection: turns, deletion state, last rendered prompt -----------
  ctx.effect(() => ctx.sessionProjections.register({
    key: KEY,
    stateVersion: 3,
    stateSchema: passthrough,
    init: (header) => ({ sid: String(header.id), seq: -1, openTurn: null, turns: [], system: '' }),
    apply: (state, event) => {
      const data = (event && event.data) || {}
      const op = event.surfaceOp
      let next = state
      const diverge = () => { if (next === state) next = { ...state } }

      if (event.type === 'turn/start') {
        const turn = data.turn
        diverge()
        next.openTurn = turn
        if (!next.turns.some((entry) => entry.turn === turn)) {
          next.turns = [...state.turns, { turn, nodes: [], total: 0, deleted: false, reason: null, user: '', reply: '', lastStep: 0 }]
        }
        next.seq = event.seq
        return next
      }

      if (event.type === 'turn/end') {
        diverge()
        next.openTurn = null
        next.seq = event.seq
        return next
      }

      if (op === 'append') {
        const turn = state.openTurn
        const index = turn === null ? -1 : state.turns.findIndex((entry) => entry.turn === turn)
        if (index >= 0) {
          const entry = state.turns[index]
          const preview = previewOf(event)
          const step = typeof data.step === 'number' && data.step > 0 ? data.step : 0
          diverge()
          next.turns = state.turns.slice()
          next.turns[index] = {
            ...entry,
            nodes: [...entry.nodes, event.seq],
            total: entry.total + 1,
            user: entry.user || preview.user || '',
            reply: entry.reply || preview.reply || '',
            lastStep: Math.max(entry.lastStep || 0, step),
          }
        }
        if (event.type === 'system/message') {
          const message = data.message
          diverge()
          next.system = textOfBlocks(message && message.content)
        }
        diverge()
        next.seq = event.seq
        return next
      }

      if (op !== null && typeof op === 'object' && op.op === 'replace') {
        const from = op.startSeq
        const to = op.endSeq
        const message = data.message
        // A deletion marker is a `user/message` replacement whose id carries our
        // prefix; the older empty `system/message` form is still recognized so
        // logs written by the first build keep reporting their deletions.
        const tombstone = (event.type === 'user/message' && typeof data.id === 'string' && data.id.startsWith('ctxmgr-del-'))
          || (event.type === 'system/message'
            && message !== undefined
            && Array.isArray(message.content)
            && message.content.length === 0)
        diverge()
        next.turns = state.turns.map((entry) => {
          if (entry.nodes.length === 0) return entry
          const kept = entry.nodes.filter((seq) => seq < from || seq > to)
          if (kept.length === entry.nodes.length) return entry
          const emptied = kept.length === 0
          return {
            ...entry,
            nodes: kept,
            deleted: entry.deleted || (emptied && tombstone),
            reason: entry.reason || (emptied ? (tombstone ? 'user' : 'compacted') : null),
          }
        })
        if (event.type === 'system/message' && message !== undefined) {
          next.system = tombstone ? next.system : textOfBlocks(message.content)
        }
        next.seq = event.seq
        return next
      }

      diverge()
      next.seq = event.seq
      return next
    },
    wire: {
      viewSchema: passthrough,
      view: (state) => {
        const turns = state.turns.map((entry) => ({
          turn: entry.turn,
          deleted: entry.deleted === true,
          reason: entry.reason,
          count: entry.total,
          user: entry.user,
          reply: entry.reply,
        }))
        return {
          session: state.sid,
          turns,
          visible: turns.filter((entry) => entry.deleted !== true).length,
          deleted: turns.filter((entry) => entry.deleted === true).length,
          prompt: String(prompts[state.sid] || ''),
          marker: MARKER,
          system: state.system,
        }
      },
    },
  }))

  // --- one delete operation, shared by the command and future callers ----
  function deleteTurn(session, turn) {
    const state = ctx.sessionProjections.stateOf(session, KEY)
    if (state === undefined) return { ok: false, text: '上下文投影尚未就绪，稍后再试。' }
    const entry = state.turns.find((item) => item.turn === turn && item.deleted !== true && item.nodes.length > 0)
    if (entry === undefined) {
      const known = state.turns.find((item) => item.turn === turn)
      if (known !== undefined && known.deleted === true) return { ok: false, text: `第 ${turn} 轮已经删除过了。` }
      return { ok: false, text: `第 ${turn} 轮没有可删除的内容。` }
    }

    const nodes = session.surface.nodes
    const first = entry.nodes[0]
    const last = entry.nodes[entry.nodes.length - 1]
    const startIndex = nodes.indexOf(first)
    const endIndex = nodes.indexOf(last)
    if (startIndex <= 0) return { ok: false, text: '不能删除系统提示词。' }
    if (startIndex < 0 || endIndex < 0) return { ok: false, text: '该轮已经不在可见序列里了，刷新后重试。' }
    if (endIndex - startIndex + 1 !== entry.nodes.length) {
      return { ok: false, text: '该轮的消息在可见序列里不连续，拒绝删除。' }
    }

    // A surface replacement must be a message that needs no open turn/step.
    // `system/message` carries turn+step and is rejected on resume when no such
    // step is open, so a deletion lands as a normal user-role marker instead.
    const turnNumber = Math.max(1, turn)
    session.append('user/message', {
      id: `ctxmgr-del-${turnNumber}-${session.seq}`,
      role: 'user',
      source: { kind: 'user' },
      content: [{ type: 'text', text: TOMBSTONE_TEXT }],
    }, {
      surfaceOp: { op: 'replace', startSeq: first, endSeq: last },
      sourceEventSeqs: entry.nodes,
    })

    return { ok: true, text: `已从模型上下文删除第 ${turnNumber} 轮（${entry.nodes.length} 条）。`, count: entry.nodes.length }
  }

  async function handleDelete(agent, spec) {
    if (agent.status !== undefined && agent.status !== 'idle') {
      return { kind: 'error', text: '这一轮还在进行，先停止再删除。' }
    }
    const session = ctx.sessions.get(agent.id)
    if (session === undefined) return { kind: 'error', text: '会话尚未激活，无法删除。' }

    let turns
    try { turns = parseTurns(spec) } catch (error) { return { kind: 'error', text: String(error.message || error) } }

    const done = []
    const failed = []
    for (const turn of turns) {
      const result = deleteTurn(session, turn)
      if (result.ok) done.push(result.text)
      else failed.push(result.text)
    }
    if (done.length > 0) {
      try {
        await ctx.sessions.flush(session)
      } catch (error) {
        const reason = String(error && error.message ? error.message : error)
        return {
          kind: 'error',
          text: `${done.join(' ')} 但落盘失败（${reason}）。这些删除只在内存里生效，重启后会全部回来；重启后重试一次。`,
        }
      }
    }
    if (done.length === 0) return { kind: 'error', text: failed.join(' ') || '没有删除任何轮次。' }
    if (failed.length > 0) return { kind: 'success', text: `${done.join(' ')} 未处理：${failed.join(' ')}` }
    return { kind: 'success', text: done.join(' ') }
  }

  // --- human command ------------------------------------------------------
  ctx.effect(() => ctx.commands.register({
    name: 'context',
    description: '管理本会话的上下文（按轮删除）与补充提示词',
    input: { hint: 'list | delete <轮次> | prompt set <base64url> | prompt clear' },
    handler: async (invocation) => {
      const raw = String(invocation.rawInput || '').trim().replace(/^\/context\b\s*/u, '')
      const first = raw.split(/\s+/)[0] || 'list'
      const rest = raw.slice(first.length).trim()
      const session = ctx.sessions.get(invocation.agent.id)

      try {
        if (first === 'list') {
          const state = session === undefined ? undefined : ctx.sessionProjections.stateOf(session, KEY)
          if (state === undefined) return { kind: 'error', text: '会话尚未激活，无法读取上下文。' }
          const visible = state.turns.filter((entry) => entry.deleted !== true && entry.nodes.length > 0).length
          const deleted = state.turns.filter((entry) => entry.deleted === true).length
          const lines = state.turns.map((entry) => `${entry.turn}. ${entry.deleted ? '已删除' : '在上文'}（${entry.total} 条）`)
          return { kind: 'success', text: `共 ${state.turns.length} 轮 · 可见 ${visible} · 已删 ${deleted}${lines.length ? '\n' + lines.join('\n') : ''}` }
        }

        if (first === 'delete') {
          if (!rest) return { kind: 'error', text: '用法：/context delete 3 或 /context delete 2,5-7' }
          return await handleDelete(invocation.agent, rest)
        }

        if (first === 'prompt') {
          const action = rest.split(/\s+/)[0] || ''
          const payload = rest.slice(action.length).trim()
          if (action === 'set') {
            const text = decodeBase64(payload)
            if (!text.trim()) return { kind: 'error', text: '提示词不能为空，要清空请用 /context prompt clear。' }
            if (text.length > MAX_PROMPT) return { kind: 'error', text: `提示词过长（${text.length} 字），上限 ${MAX_PROMPT} 字。` }
            prompts = { ...prompts, [invocation.agent.id]: text }
            persist()
            return { kind: 'success', text: `已保存本会话的补充提示词（${text.length} 字），将在下一次模型请求生效。` }
          }
          if (action === 'clear') {
            const next = { ...prompts }
            delete next[invocation.agent.id]
            prompts = next
            persist()
            return { kind: 'success', text: '已清空本会话的补充提示词，下一次模型请求生效。' }
          }
          return { kind: 'error', text: '用法：/context prompt set <base64url> 或 /context prompt clear' }
        }

        return { kind: 'error', text: '用法：/context list | delete <轮次> | prompt set <base64url> | prompt clear' }
      } catch (error) {
        return { kind: 'error', text: `操作失败：${String(error && error.message ? error.message : error)}` }
      }
    },
  }))
}
