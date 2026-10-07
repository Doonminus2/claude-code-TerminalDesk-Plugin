import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { findMarkers, findSaid, ttlFromTranscriptTail } from '../hooks/detect'


// The engine beneath the plugin, answered from memory.
function world(on: On) {
  mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('session.start', async () => ({ cwd: '/tmp/project' }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never)
  on('ui.status', async () => ({ value: undefined }) as never)
  on('ui.toast', async () => ({ value: undefined }) as never)
  on('turn.complete', async ($, e) => ({ text: e.answer }))
  on('session.usage', async () =>
    ({ value: {
      startedAt: 0,
      context: {
        tokens: 42_000,
        window: 200_000,
        percent: 21,
        breakdown: {
          categories: [
            { name: 'Messages', tokens: 30_000, color: 'promptBorder', isDeferred: false, kind: 'used' },
            { name: 'System tools', tokens: 12_000, color: 'warning', isDeferred: false, kind: 'used' },
            { name: 'Free space', tokens: 158_000, color: 'inactive', isDeferred: false, kind: 'free' },
          ],
          totalTokens: 42_000,
          maxTokens: 200_000,
          rawMaxTokens: 200_000,
        },
      },
      rateLimits: [],
      cost: { usd: 1.23 },
    } }) as never,
  )
}

const PANE = {
  component: 'Pane' as const,
  requestId: 'terminal-desk',
  props: {
    title: 'Desk',
    isFocused: false,
    bodyColumns: 50,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
}

describe('detection', () => {
  test('finds admissions in English and Thai, not ordinary prose', () => {
    const said = findSaid(
      [
        'I added the retry helper with exponential backoff.',
        "I didn't run the test suite because there is no test runner configured.",
        '- The README section is **not yet tested** on Windows.',
        'ยังไม่ได้รันเทสต์ครับ',
        '```ts\n// I did not run this\n```',
        'Everything else works.',
      ].join('\n'),
    )
    expect(said.length).toBe(3)
    expect(said[0]).toContain("didn't run the test suite")
    expect(said[1]).toContain('not yet tested')
    expect(said[2]).toContain('ยังไม่ได้')
  })

  test('finds bullets under OPEN / FLAGGED headings and a refusal to proceed', () => {
    const said = findSaid(
      [
        'OPEN      - Exact heading vocabulary comes from the sampled files.',
        '          - AI-08 wants metadata.task_id and 1-2 chunks per file.',
        'FLAGGED   - Scope: tests/ not in the row.',
        '',
        "Waiting. I won't implement until you say so.",
      ].join('\n'),
    )
    expect(said.some(t => t.startsWith('OPEN: Exact heading'))).toBe(true)
    expect(said.some(t => t.startsWith('OPEN: AI-08'))).toBe(true)
    expect(said.some(t => t.startsWith('FLAGGED: Scope'))).toBe(true)
    expect(said.some(t => t.includes("won't implement"))).toBe(true)
  })

  test('finds only newly added TODO lines', () => {
    const before = 'a()\n// TODO: old one\n'
    const after = 'a()\n// TODO: old one\n// TODO: wait with the next attempt\nb()\n'
    expect(findMarkers(before, after)).toEqual(['// TODO: wait with the next attempt'])
  })

  test('reads the cache lifetime from a transcript tail', () => {
    const line5m =
      '{"type":"assistant","message":{"usage":{"cache_creation":{"ephemeral_5m_input_tokens":900,"ephemeral_1h_input_tokens":0}}}}'
    const line1h =
      '{"type":"assistant","message":{"usage":{"cache_creation":{"ephemeral_5m_input_tokens":0,"ephemeral_1h_input_tokens":1200}}}}'
    expect(ttlFromTranscriptTail(line5m)).toBe('5m')
    expect(ttlFromTranscriptTail(line5m + '\n' + line1h)).toBe('1h')
    expect(ttlFromTranscriptTail('{"type":"user"}')).toBe(null)
  })
})

describe('desk', () => {
  test('a turn that admits something lands in Left undone, and ✓ clears it', { options: { autoOpen: false } }, async ($, on) => {
    world(on)
    await $.session.start({ cwd: '/tmp/project' } as never)
    await $.turn.complete({
      answer: "Done. I didn't run the tests because the runner is not configured.",
      durationMs: 1200,
      isAborted: false,
      turnId: 't1',
      reason: 'answer',
      usage: {
        model: 'claude-opus-5-5',
        input_tokens: 10,
        output_tokens: 50,
        cache_read_input_tokens: 40_000,
        cache_creation_input_tokens: 2_000,
      },
    })

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'terminal-desk', surface, ...PANE })
      expect(await ui.find({ text: /Left undone \(1\)/ })).toBeDefined()
      expect(await ui.find({ text: /didn't run the tests/ })).toBeDefined()
      expect(await ui.find({ text: /warm/ })).toBeDefined()
      await ui.unmount()
    }

    const ui = await $.ui.mount({ plugin: 'terminal-desk', surface: 'terminal', ...PANE })
    await ui.press({ key: 'done-1' })
    expect(await ui.find({ text: /Nothing left undone/ })).toBeDefined()
    await ui.unmount()
  })

  test('a TODO written by Edit lands in Left undone', { options: { autoOpen: false } }, async ($, on) => {
    world(on)
    // Stand in for the real Edit tool beneath the plugin.
    on('tool.call', { tool: 'Edit' }, async () => ({ result: undefined as never, text: 'ok' }) as never)
    await $.session.start({ cwd: '/tmp/project' } as never)
    await $.tool.call({
      tool: 'Edit',
      file_path: '/tmp/project/src/retry.ts',
      old_string: 'export const retry = 1',
      new_string: 'export const retry = 1\n// TODO: wait with the next attempt',
    })
    const ui = await $.ui.mount({ plugin: 'terminal-desk', surface: 'terminal', ...PANE })
    expect(await ui.find({ text: /in a file/ })).toBeDefined()
    expect(await ui.find({ text: /TODO: wait with the next attempt/ })).toBeDefined()
    await ui.unmount()
  })
})
