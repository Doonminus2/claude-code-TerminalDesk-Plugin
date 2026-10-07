import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CacheTtl, CategoryRow, TaskItem, UndoneItem } from '../types'
import {
  clock,
  duration,
  findMarkers,
  findSaid,
  hhmm,
  kTokens,
  ttlFromTranscriptTail,
  ttlMs,
} from './detect'

const PANE = 'terminal-desk'
const MAX_ITEMS = 50

const undone = atom({ plugin: 'terminal-desk', key: 'undone' } as const, [])
const tasks = atom({ plugin: 'terminal-desk', key: 'tasks' } as const, [])
const nextId = atom({ plugin: 'terminal-desk', key: 'nextId' } as const, 1)
const usage = atom({ plugin: 'terminal-desk', key: 'usage' } as const, {
  window: 200_000,
  categories: [],
})
const cache = atom({ plugin: 'terminal-desk', key: 'cache' } as const, {
  lastAt: null,
  ttl: null,
  isObserved: false,
  readTokens: 0,
  inputTokens: 0,
  lastContext: 0,
})

type Options = { autoOpen?: boolean; cacheTtl?: string }
type Api = EngineInterface

// ---------- helpers that touch $ ----------


async function addItems($: Api, items: { kind: 'said' | 'file'; text: string; file?: string }[]) {
  if (items.length === 0) return 0
  const now = await $.clock.now()
  let added = 0
  let first = 0
  await update($, nextId, id => {
    first = id
    return id
  })
  await update($, undone, list => {
    const out = [...list]
    let id = first
    for (const it of items) {
      const dup = out.some(o => o.text === it.text && o.file === it.file)
      if (dup) continue
      out.push({ id: id++, kind: it.kind, text: it.text, file: it.file, at: now })
      added++
    }
    return out.slice(-MAX_ITEMS)
  })
  if (added > 0) await update($, nextId, id => id + added)
  return added
}

/** Everything the assistant wrote since the person's last prompt, newest last. */
async function turnTexts($: Api): Promise<string[]> {
  const rows = await $.session.messages()
  const out: string[] = []
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]
    if (row === undefined) continue
    if (row.role === 'user' && (row.toolResults?.length ?? 0) === 0 && row.text.trim() !== '') break
    if (row.role === 'assistant' && row.text.trim() !== '') out.unshift(row.text)
  }
  return out
}

async function refreshUsage($: Api, withBreakdown: boolean) {
  const u = await $.session.usage(withBreakdown ? { breakdown: 'summary', columns: 60 } : undefined)
  const categories: CategoryRow[] | undefined = u.context.breakdown?.categories.map(c => ({
    name: c.name,
    tokens: c.tokens,
    color: c.color,
    kind: c.kind,
  }))
  await update($, usage, prev => ({
    tokens: u.context.tokens,
    window: u.context.window,
    percent: u.context.percent,
    usd: u.cost?.usd,
    startedAt: u.startedAt,
    categories: categories ?? prev.categories,
  }))
}

async function statusLine($: Api, forcedTtl: CacheTtl | null) {
  const [u, c, list, ts] = await Promise.all([read($, usage), read($, cache), read($, undone), read($, tasks)])
  const now = await $.clock.now()
  const parts: string[] = []
  const open = list.length + ts.filter(t => t.status !== 'completed').length
  if (u.percent !== undefined) parts.push(`ctx ${u.percent}%`)
  if (u.usd !== undefined) parts.push(`$${u.usd.toFixed(2)}`)
  const ttl = forcedTtl ?? c.ttl ?? '5m'
  if (c.isObserved && c.lastAt !== null) {
    const left = c.lastAt + ttlMs(ttl) - now
    parts.push(left > 0 ? `cache warm ${clock(left)}` : 'cache cold')
  }
  if (open > 0) parts.push(`⚠ ${open} left undone (/desk)`)
  $.ui.status(parts.length ? 'desk · ' + parts.join(' · ') : undefined)
}


export const register: Register = (on, options) => {
  const opts = (options ?? {}) as Options
  const forcedTtl: CacheTtl | null =
    opts.cacheTtl === '5m' || opts.cacheTtl === '1h' ? opts.cacheTtl : null

  // ---------- session ----------

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'desk',
      description: 'Show or hide the desk: left undone, context, cost, prompt cache',
      immediate: true,
    })
    await $.command.register({
      name: 'desk-clear',
      description: 'Clear the desk\'s "Left undone" list',
      immediate: true,
    })

    try {
      await refreshUsage($, true)
    } catch {
      // usage is not ready before the first response; the next measure fills it
    }

    // One tick a second keeps the cache countdown and the status line current.
    $.clock.every(1000, () => {
      void (async () => {
        await statusLine($, forcedTtl)
        const c = await read($, cache)
        if (c.isObserved) $.ui.invalidate('ui.render')
      })()
    })

    if (opts.autoOpen !== false) void $.ui.open({ id: PANE, title: 'Desk' })

    return next(e)
  })

  on('command.run', { command: 'desk' }, async $ => {
    const isUp = (await $.ui.panes()).some(p => p.id === PANE)
    if (isUp) {
      await $.ui.close({ id: PANE })
      return {}
    }
    await $.ui.open({ id: PANE, title: 'Desk' })
    return {}
  })

  on('command.run', { command: 'desk-clear' }, async $ => {
    await update($, undone, () => [])
    await update($, tasks, () => [])
    await statusLine($, forcedTtl)
    return { text: 'Cleared the "Left undone" list.' }
  })

  // Context and cost move: keep the snapshot current.
  on('session.measure', async ($, e, next) => {
    await update($, usage, prev => ({
      ...prev,
      tokens: e.context.tokens,
      window: e.context.window,
      percent: e.context.percent,
      usd: e.cost?.usd ?? prev.usd,
    }))
    await statusLine($, forcedTtl)
    return next(e)
  })

  // ---------- left undone: what Claude said ----------

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result // a subagent's turn

    const now = await $.clock.now()
    const u = e.usage
    if (u) {
      const context = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
      const isCached = u.cache_read_input_tokens + u.cache_creation_input_tokens > 0
      await update($, cache, prev => ({
        ...prev,
        lastAt: now,
        isObserved: prev.isObserved || isCached,
        readTokens: prev.readTokens + u.cache_read_input_tokens,
        inputTokens: prev.inputTokens + context,
        lastContext: context,
      }))
    }

    if (e.reason === 'answer' || e.reason === 'aborted') {
      let texts: string[] = []
      try {
        texts = await turnTexts($)
      } catch {
        texts = []
      }
      if (e.answer && !texts.includes(e.answer)) texts.push(e.answer)
      const said: string[] = []
      for (const t of texts) for (const one of findSaid(t)) if (!said.includes(one)) said.push(one)
      const added = await addItems(
        $,
        said.map(text => ({ kind: 'said' as const, text })),
      )
      if (added > 0) $.ui.toast(`⚠ Left undone: +${added} (/desk to see)`)
    }

    try {
      await refreshUsage($, true)
    } catch {
      // keep the previous snapshot
    }
    await statusLine($, forcedTtl)
    return result
  })

  // ---------- left undone: TODOs written into files ----------

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    if (tool !== 'Write' && tool !== 'Edit' && tool !== 'MultiEdit' && tool !== 'NotebookEdit') {
      return next(e)
    }
    const input = e as unknown as Record<string, unknown>
    const file = typeof input.file_path === 'string' ? input.file_path : (input.notebook_path as string | undefined)

    let before = ''
    let after = ''
    if (tool === 'Write') {
      after = String(input.content ?? '')
      if (file) {
        try {
          before = await $.fs.read(file)
        } catch {
          before = ''
        }
      }
    } else if (tool === 'Edit') {
      before = String(input.old_string ?? '')
      after = String(input.new_string ?? '')
    } else if (tool === 'MultiEdit' && Array.isArray(input.edits)) {
      for (const ed of input.edits as Record<string, unknown>[]) {
        before += String(ed.old_string ?? '') + '\n'
        after += String(ed.new_string ?? '') + '\n'
      }
    } else if (tool === 'NotebookEdit') {
      after = String(input.new_source ?? '')
    }

    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran

    const markers = findMarkers(before, after)
    if (markers.length > 0) {
      const short = file ? file.split('/').slice(-2).join('/') : undefined
      const added = await addItems(
        $,
        markers.map(text => ({ kind: 'file' as const, text, file: short })),
      )
      if (added > 0) await statusLine($, forcedTtl)
    }
    return ran
  }).catch(($, e, next) => next(e)) // an observer: if it fails, the edit goes on as usual

  // ---------- which cache lifetime the session uses ----------

  on('classic.Stop', async ($, e, next) => {
    if (forcedTtl === null) {
      const path = (e as unknown as { transcript_path?: string }).transcript_path
      if (path) {
        try {
          const { stdout } = await $.process.run(['tail', '-c', '300000', path], { timeoutMs: 5000 })
          const ttl = ttlFromTranscriptTail(stdout)
          if (ttl) await update($, cache, prev => ({ ...prev, ttl }))
        } catch {
          // keep what we had
        }
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // ---------- drawing ----------

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const [list, u, c] = await Promise.all([read($, undone), read($, usage), read($, cache)])
    const now = await $.clock.now()
    const width = Math.max(20, Math.min(e.props.bodyColumns ?? 40, 80))

    // Left undone
    const undoneRows = list.slice().reverse().map((it: UndoneItem) => (
      <Box flexDirection="column" key={`u-${it.id}`}>
        <Box flexDirection="row" columnGap={1}>
          <Text color="error" bold>
            U{it.id}
          </Text>
          <Text dimColor>· {hhmm(it.at)} ·</Text>
          <Text color="error">{it.kind === 'said' ? 'Claude said' : 'in a file'}</Text>
          <Button
            key={`done-${it.id}`}
            label="✓"
            plain
            dimColor
            onPress={() => update($, undone, l => l.filter(x => x.id !== it.id))}
          />
        </Box>
        {it.file && <Text dimColor wrap="truncate-start">{it.file}</Text>}
        <Text wrap="wrap">{it.text}</Text>
      </Box>
    ))

    const askClaude = async () => {
      const items = await read($, undone)
      if (items.length === 0) return
      const lines = items.map(it => `- ${it.kind === 'file' && it.file ? `${it.file}: ` : ''}${it.text}`)
      await $.prompt.fill({
        text: `Earlier you left these undone. Please finish them, or tell me why not:\n${lines.join('\n')}`,
        mode: 'replace',
      })
    }

    // Context bar
    const used = u.categories.filter(k => k.kind === 'used')
    const total = u.window || 1
    const barCols = Math.max(10, width - 2)
    const segs = used
      .map(k => ({ k, n: Math.round((k.tokens / total) * barCols) }))
      .filter(s => s.n > 0)
    const usedCols = segs.reduce((a, s) => a + s.n, 0)
    const fallbackUsed = u.percent !== undefined ? Math.round((u.percent / 100) * barCols) : 0
    const bar =
      segs.length > 0 ? (
        <Box flexDirection="row">
          {segs.map((s, i) => (
            <Text key={`seg-${i}`} color={s.k.color}>
              {'█'.repeat(s.n)}
            </Text>
          ))}
          <Text dimColor>{'░'.repeat(Math.max(0, barCols - usedCols))}</Text>
        </Box>
      ) : (
        <Box flexDirection="row">
          <Text color="promptBorder">{'█'.repeat(fallbackUsed)}</Text>
          <Text dimColor>{'░'.repeat(Math.max(0, barCols - fallbackUsed))}</Text>
        </Box>
      )

    const rows = u.categories
      .filter(k => k.kind !== 'deferred' && k.tokens > 0)
      .slice()
      .sort((a, b) => (a.kind === 'used' ? 0 : 1) - (b.kind === 'used' ? 0 : 1) || b.tokens - a.tokens)
      .map((k: CategoryRow, i) => (
        <Box flexDirection="row" columnGap={1} key={`cat-${i}`}>
          <Text color={k.kind === 'used' ? k.color : undefined} dimColor={k.kind !== 'used'}>
            ■
          </Text>
          <Text dimColor={k.kind !== 'used'}>{k.name}</Text>
          <Text dimColor>{kTokens(k.tokens)}</Text>
        </Box>
      ))

    // Prompt cache
    const ttl = forcedTtl ?? c.ttl ?? '5m'
    const left = c.lastAt !== null ? c.lastAt + ttlMs(ttl) - now : -1
    const hit = c.inputTokens > 0 ? Math.round((c.readTokens / c.inputTokens) * 100) : null
    const cacheLines =
      !c.isObserved || c.lastAt === null ? (
        <Text dimColor>No cached request yet.</Text>
      ) : left > 0 ? (
        <Box flexDirection="column">
          <Text>
            <Text color="success" bold>
              ● warm
            </Text>{' '}
            · goes cold in {clock(left)} ({ttl} cache)
          </Text>
          <Text dimColor>Next message reads ~{kTokens(c.lastContext)} from cache: cheap.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Text>
            <Text color="warning" bold>
              ○ cold
            </Text>{' '}
            · expired {duration(-left)} ago ({ttl} cache)
          </Text>
          <Text dimColor>Next message re-caches ~{kTokens(c.lastContext)} tokens: pricier.</Text>
        </Box>
      )

    const elapsed = u.startedAt !== undefined ? duration(now - u.startedAt) : undefined

    return (
      <Box flexDirection="column" rowGap={1}>
        <Box flexDirection="column" borderStyle="round" borderColor="error" paddingX={1}>
          <Text color="error" bold>
            Left undone {list.length > 0 ? `(${list.length})` : ''}
          </Text>
          {list.length === 0 ? (
            <Text dimColor>Nothing left undone. Claude's admissions and new TODOs show up here.</Text>
          ) : (
            <Box flexDirection="column" rowGap={1}>
              {undoneRows}
              <Box flexDirection="row" columnGap={2}>
                <Button key="ask" label="Ask Claude to finish" hotkey="f" variant="primary" onPress={askClaude} />
                <Button key="clear" label="Clear all" hotkey="x" onPress={() => update($, undone, () => [])} />
              </Box>
            </Box>
          )}
        </Box>

        <Box flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1}>
          <Text color="warning" bold>
            Where your context went
          </Text>
          <Text>
            {u.percent !== undefined ? `${u.percent}% used` : 'no response yet'}
            {u.tokens !== undefined ? ` · ${kTokens(u.tokens)} / ${kTokens(total)}` : ''}
          </Text>
          {bar}
          {rows}
        </Box>

        <Box flexDirection="column" borderStyle="round" borderColor="success" paddingX={1}>
          <Text color="success" bold>
            Prompt cache
          </Text>
          {cacheLines}
          {hit !== null && <Text dimColor>Hit ratio this session: {hit}%</Text>}
        </Box>

        <Box flexDirection="row" columnGap={2}>
          {u.usd !== undefined && <Text color="warning">${u.usd.toFixed(2)}</Text>}
          {elapsed && <Text dimColor>⏱ {elapsed}</Text>}
          <Text dimColor>/desk hides</Text>
        </Box>
      </Box>
    )
  })
}
