/**
 * Context Manager — Client half.
 *
 * Renders two entries under the composer and one fixed-position panel. All data
 * comes from the Host `contextManager` projection; every mutation goes through
 * the `/context` command, so the UI and the command share one implementation.
 */
window.__ModuleLoader__.load({
  id: 'dsh-context-manager',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const CSS = [
      '.cm-dock{display:flex;gap:8px;align-items:center;justify-content:center;padding:2px 0 2px;font-size:12px;line-height:1.4}',
      '.cm-entry{border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:999px;padding:2px 10px;cursor:pointer;font:inherit}',
      '.cm-entry:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}',
      '.cm-entry .cm-badge{margin-left:6px;color:var(--dsw-alias-state-warn-primary)}',
      '.cm-mask{position:fixed;inset:0;z-index:120;background:rgba(0,0,0,.42);display:flex;align-items:center;justify-content:center;padding:24px}',
      '.cm-panel{width:min(760px,94vw);max-height:82vh;display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.28);overflow:hidden}',
      '.cm-head{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.cm-title{font-size:14px;font-weight:600;flex:1}',
      '.cm-x{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font-size:16px;cursor:pointer;padding:2px 6px;border-radius:6px}',
      '.cm-x:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.cm-tabs{display:flex;gap:4px;padding:8px 16px 0}',
      '.cm-tab{border:0;background:transparent;color:var(--dsw-alias-label-secondary);padding:6px 10px;border-radius:8px;cursor:pointer;font:inherit;font-size:12px}',
      '.cm-tab.is-on{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.cm-sum{padding:8px 16px;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.cm-content{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;padding-bottom:12px}',
      '.cm-body{padding:4px 12px 8px;display:flex;flex-direction:column;gap:6px}',
      '.cm-row{display:flex;gap:10px;padding:10px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}',
      '.cm-row.is-deleted{opacity:.55}',
      '.cm-idx{width:22px;flex:none;text-align:center;font-size:12px;color:var(--dsw-alias-label-secondary);padding-top:1px}',
      '.cm-text{flex:1;min-width:0}',
      '.cm-user{font-size:13px;word-break:break-word}',
      '.cm-reply{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:3px;word-break:break-word}',
      '.cm-meta{font-size:11px;color:var(--dsw-alias-state-idle-primary);margin-top:4px}',
      '.cm-act{flex:none;display:flex;gap:6px;align-items:flex-start}',
      '.cm-trash,.cm-danger,.cm-plain{border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:7px;padding:3px 9px;font:inherit;font-size:12px;cursor:pointer}',
      '.cm-trash:hover,.cm-danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}',
      '.cm-danger{background:var(--dsw-alias-bg-layer-2)}',
      '.cm-chip{font-size:11px;color:var(--dsw-alias-label-secondary);border:1px dashed var(--dsw-alias-border-l1);border-radius:999px;padding:2px 8px}',
      '.cm-empty{padding:24px 8px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.cm-sec{font-size:12px;font-weight:600;margin:12px 4px 6px}',
      '.cm-pre{margin:0 4px;max-height:220px;overflow:auto;white-space:pre-wrap;word-break:break-word;font-size:11px;line-height:1.6;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px}',
      '.cm-note{margin:8px 4px 4px;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.cm-src{margin:0;padding-left:18px;font-size:11px;color:var(--dsw-alias-label-secondary);line-height:1.8}',
      '.cm-ta{width:calc(100% - 8px);margin:0 4px;box-sizing:border-box;resize:vertical;min-height:96px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:10px;font:inherit;font-size:12px;line-height:1.6}',
      '.cm-ta:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}',
      '.cm-foot{display:flex;align-items:center;gap:8px;margin:8px 4px 0}',
      '.cm-foot .cm-count{flex:1;font-size:11px;color:var(--dsw-alias-state-idle-primary)}',
      '.cm-primary{border:1px solid var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);color:#fff;border-radius:8px;padding:5px 14px;font:inherit;font-size:12px;cursor:pointer}',
      '.cm-primary[disabled]{opacity:.5;cursor:default}',
      '.cm-ok{margin:6px 4px 0;font-size:11px;color:var(--dsw-alias-state-success-primary)}',
    ].join('\n')

    let hostCtx = null

    function runCommand(line, sessionId) {
      const sessions = hostCtx && typeof hostCtx.get === 'function' ? hostCtx.get('sessions') : undefined
      const binding = sessions && typeof sessions.binding === 'function' ? sessions.binding(sessionId) : undefined
      if (!binding) return Promise.resolve(false)
      return binding.session.command(line).then(
        (result) => Boolean(result && result.ok && result.value && result.value.matched),
        () => false,
      )
    }

    function toBase64Url(text) {
      const bytes = new TextEncoder().encode(text)
      let binary = ''
      for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index])
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    }

    function Tab(props) {
      return h('button', {
        className: 'cm-tab' + (props.on ? ' is-on' : ''),
        onClick: props.onClick,
      }, props.label)
    }

    function TurnRow(props) {
      const entry = props.entry
      const pending = props.pending === entry.turn
      const busy = props.busy === entry.turn
      return h('div', { className: 'cm-row' + (entry.deleted ? ' is-deleted' : '') },
        h('div', { className: 'cm-idx' }, String(entry.turn)),
        h('div', { className: 'cm-text' },
          h('div', { className: 'cm-user' }, entry.user || '（无文本）'),
          entry.reply ? h('div', { className: 'cm-reply' }, entry.reply) : null,
          h('div', { className: 'cm-meta' },
            entry.count + ' 条' + (entry.deleted ? (entry.reason === 'compacted' ? ' · 已被压缩' : ' · 已从上下文移除') : '')),
        ),
        h('div', { className: 'cm-act' },
          entry.deleted
            ? h('span', { className: 'cm-chip' }, entry.reason === 'compacted' ? '已压缩' : '已删除')
            : pending
              ? [
                h('button', { key: 'y', className: 'cm-danger', disabled: busy, onClick: () => props.onDelete(entry.turn) }, busy ? '删除中…' : '确认删除'),
                h('button', { key: 'n', className: 'cm-plain', disabled: busy, onClick: () => props.onCancel() }, '取消'),
              ]
              : h('button', { className: 'cm-trash', onClick: () => props.onAsk(entry.turn) }, '删除'),
        ),
      )
    }

    function ContextManager(props) {
      const sessionId = props.sessionId
      const useProjection = props.useProjection
      const view = typeof useProjection === 'function' ? useProjection('contextManager') : undefined

      const [open, setOpen] = React.useState(false)
      const [tab, setTab] = React.useState('context')
      const [pending, setPending] = React.useState(null)
      const [busy, setBusy] = React.useState(null)
      const [draft, setDraft] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const [copied, setCopied] = React.useState(false)

      React.useEffect(() => {
        if (!open) return undefined
        const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [open])

      const turns = view && Array.isArray(view.turns) ? view.turns : []
      const deletedCount = view && typeof view.deleted === 'number' ? view.deleted : 0
      const visibleCount = view && typeof view.visible === 'number' ? view.visible : turns.length
      const systemPrompt = view && typeof view.system === 'string' ? view.system : ''

      function openPanel(nextTab) {
        setTab(nextTab)
        setNotice('')
        setCopied(false)
        if (nextTab === 'prompt') setDraft(view && typeof view.prompt === 'string' ? view.prompt : '')
        setOpen(true)
      }

      async function removeTurn(turn) {
        setBusy(turn)
        const matched = await runCommand('/context delete ' + turn, sessionId)
        setBusy(null)
        setPending(null)
        if (!matched) setNotice('删除没有执行，具体原因看会话里的命令回执。')
      }

      async function savePrompt() {
        const text = draft.trim()
        if (text.length === 0) return clearPrompt()
        setBusy('prompt')
        const matched = await runCommand('/context prompt set ' + toBase64Url(draft), sessionId)
        setBusy(null)
        setNotice(matched ? '已保存，下一次模型请求生效。' : '保存失败，具体原因看会话里的命令回执。')
      }

      async function clearPrompt() {
        setBusy('prompt')
        const matched = await runCommand('/context prompt clear', sessionId)
        setBusy(null)
        if (matched) setDraft('')
        setNotice(matched ? '已清空，下一次模型请求生效。' : '清空失败，具体原因看会话里的命令回执。')
      }

      async function copyPrompt() {
        try {
          await navigator.clipboard.writeText(systemPrompt)
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        } catch {
          setCopied(false)
        }
      }

      const dock = h('div', { className: 'cm-dock' },
        h('button', { className: 'cm-entry', onClick: () => openPanel('context') },
          '管理上下文',
          deletedCount > 0 ? h('span', { className: 'cm-badge' }, '· 已删 ' + deletedCount) : null),
        h('button', { className: 'cm-entry', onClick: () => openPanel('prompt') }, '管理提示词'),
      )

      if (!open) return dock

      const contextTab = h('div', null,
        h('div', { className: 'cm-sum' }, '共 ' + turns.length + ' 轮 · 模型可见 ' + visibleCount + ' 轮 · 已删除 ' + deletedCount + ' 轮'),
        h('div', { className: 'cm-body' },
          turns.length === 0
            ? h('div', { className: 'cm-empty' }, '还没有可管理的对白。')
            : turns.map((entry) => h(TurnRow, {
              key: entry.turn,
              entry,
              pending,
              busy,
              onAsk: (turn) => setPending(turn),
              onCancel: () => setPending(null),
              onDelete: removeTurn,
            })),
        ),
      )

      const promptTab = h('div', null,
        h('div', { className: 'cm-sec' }, '模型当前收到的提示词（只读）'),
        h('pre', { className: 'cm-pre' }, systemPrompt || '（本会话还没有渲染过提示词）'),
        h('div', { className: 'cm-foot' },
          h('span', { className: 'cm-count' }, copied ? '已复制' : ''),
          h('button', { className: 'cm-plain', onClick: copyPrompt, disabled: !systemPrompt }, '复制'),
        ),
        h('div', { className: 'cm-note' }, '以下来源由各自插件提供，只读且不能在这里修改：'),
        h('ul', { className: 'cm-src' },
          h('li', null, 'Harness 身份与第一方指引（内置）'),
          h('li', null, '当前 Agent 预设'),
          h('li', null, '工具与技能说明（对应插件提供）'),
          h('li', null, '运行时上下文（工作目录、沙箱、审批策略等，以 user 快照注入）'),
        ),
        h('div', { className: 'cm-sec' }, '我的补充提示词（仅本会话）'),
        h('textarea', {
          className: 'cm-ta',
          rows: 6,
          value: draft,
          placeholder: '例如：回答用中文；改动代码前先说明思路。',
          onChange: (event) => setDraft(event.target.value),
        }),
        h('div', { className: 'cm-foot' },
          h('span', { className: 'cm-count' }, draft.length + ' 字'),
          h('button', { className: 'cm-plain', onClick: clearPrompt, disabled: busy === 'prompt' }, '清空'),
          h('button', { className: 'cm-primary', onClick: savePrompt, disabled: busy === 'prompt' }, busy === 'prompt' ? '保存中…' : '保存'),
        ),
        notice ? h('div', { className: 'cm-ok' }, notice) : null,
      )

      return h(React.Fragment, null,
        dock,
        h('div', {
          className: 'cm-mask',
          onMouseDown: (event) => { if (event.target === event.currentTarget) setOpen(false) },
        },
          h('div', { className: 'cm-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': '上下文管理' },
            h('div', { className: 'cm-head' },
              h('div', { className: 'cm-title' }, '上下文管理 · 本会话'),
              h('button', { className: 'cm-x', onClick: () => setOpen(false), 'aria-label': '关闭' }, '✕'),
            ),
            h('div', { className: 'cm-tabs' },
              h(Tab, { label: '上下文', on: tab === 'context', onClick: () => setTab('context') }),
              h(Tab, { label: '提示词', on: tab === 'prompt', onClick: () => setTab('prompt') }),
            ),
            h('div', { className: 'cm-content' }, tab === 'context' ? contextTab : promptTab),
          ),
        ),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        hostCtx = ctx
        ctx.effect(() => {
          const el = document.createElement('style')
          el.setAttribute('data-plugin', 'dsh-context-manager')
          el.textContent = CSS
          document.head.appendChild(el)
          return () => el.remove()
        })
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'context-manager',
          order: 30,
        }, ContextManager))
      },
    }
  },
})
