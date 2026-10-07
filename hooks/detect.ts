// Pure helpers: no `$`, so tests can call them directly.

const VERBS =
  '(?:proceed|change|touch|write|edit|run|test|verify|execute|check|implement|finish|complete|build|fix|confirm|install|update|add|wire|deploy|migrate|cover|handle|try|reproduce|compile|lint|start|validate|commit|push)'

// Sentences in which Claude admits something was not done.
const SAID: RegExp[] = [
  new RegExp(
    `\\bI(?:'ll| will)? (?:did not|didn't|have not|haven't|could not|couldn't|was unable to|wasn't able to|cannot|can't|did not get to|didn't get to|did not yet|haven't yet|won't|will not|am not going to|didn't)\\s+(?:\\w+\\s+){0,2}${VERBS}`,
    'i',
  ),
  /\bnot (?:yet )?(?:been )?(?:implemented|run|tested|verified|wired up|handled|supported|done|fixed|covered|checked)\b/i,
  /\b(?:untested|unverified|unimplemented|unresolved|still open|blocked on|waiting (?:on|for) (?:you|your|approval|confirmation))\b/i,
  /\buntil you (?:say|confirm|approve|decide)\b/i,
  /\b(?:left (?:as )?(?:a |an )?(?:TODO|stub|placeholder)|stubbed(?: out)?|placeholder (?:implementation|value|logic))\b/i,
  /\b(?:skipped|skipping|didn't run|did not run)\b/i,
  /\byou(?:'ll| will)? (?:need|have) to (?:run|install|add|set|configure|update|create|restart|deploy|fill in|replace)\b/i,
  /\b(?:still needs? to be|remains? to be (?:done|implemented|tested))\b/i,
  /(?:ยังไม่ได้|ไม่ได้รัน|ไม่ได้ทดสอบ|ไม่ได้ตรวจ|ข้ามไป|ข้ามการ|ยังไม่เสร็จ|ต้องทำต่อ|ค้างไว้|ไว้ทีหลัง|ยังไม่ได้ทำ)/,
]

// Markers that mark unfinished code when they appear in a newly written line.
const MARKER = /\b(?:TODO|FIXME|XXX|HACK)\b|NotImplementedError|not implemented|unimplemented!\(/i

const MAX_TEXT = 220

function clip(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > MAX_TEXT ? one.slice(0, MAX_TEXT - 1) + '…' : one
}

/** Split an answer into sentences, leaving out fenced code. */
export function sentences(answer: string): string[] {
  const prose = answer.replace(/```[\s\S]*?```/g, '\n')
  return prose
    .split(/\n+|(?<=[.!?])\s+/)
    .map(s => s.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').replace(/^#+\s*/, '').trim())
    .filter(s => s.length > 3)
}

// A line that opens a list of open work: "OPEN", "FLAGGED -", "Remaining:", "## Next steps".
const HEADING =
  /^\s*(?:#{1,4}\s*)?(?:\*\*)?(OPEN|FLAGGED|BLOCKED|PENDING|REMAINING|TODO|NOT DONE|LEFT OUT|NEXT STEPS?|FOLLOW[- ]?UPS?|OPEN QUESTIONS|KNOWN ISSUES|CAVEATS?|LIMITATIONS|UNRESOLVED|Open|Flagged|Blocked|Pending|Remaining|Not done|Left out|Next steps?|Follow[- ]?ups?|Open questions|Known issues|Caveats?|Limitations|Unresolved|ยังไม่ได้ทำ|ค้างอยู่|งานค้าง|สิ่งที่เหลือ|ขั้นต่อไป)(?:\*\*)?(?:\s*[:：]|\s{2,}|\s+(?=[-•*])|\s*$)(.*)$/
const BULLET = /^\s*(?:[-•*]|\d+[.)])\s+(.*)$/

/** Bullets listed under a heading such as OPEN, FLAGGED or "Remaining:". */
export function findSections(answer: string): string[] {
  const lines = answer.replace(/```[\s\S]*?```/g, '\n').split('\n')
  const found: string[] = []
  let isInside = false
  let label = ''
  let current: string | null = null
  const flush = () => {
    if (current !== null) {
      const text = clip((label ? label + ': ' : '') + current.replace(/\*\*|__|`/g, ''))
      if (current.trim().length > 3 && !found.includes(text)) found.push(text)
    }
    current = null
  }
  for (const line of lines) {
    const h = HEADING.exec(line)
    if (h) {
      flush()
      isInside = true
      label = (h[1] ?? '').toUpperCase()
      const rest = (h[2] ?? '').trim()
      const b = BULLET.exec(rest)
      if (b) current = b[1] ?? ''
      else if (rest.length > 3) current = rest
      continue
    }
    if (!isInside) continue
    if (line.trim() === '') {
      flush()
      isInside = false
      continue
    }
    const b = BULLET.exec(line)
    if (b) {
      flush()
      current = b[1] ?? ''
    } else if (/^\s+/.test(line) && current !== null) {
      current += ' ' + line.trim()
    } else {
      flush()
      isInside = false
    }
  }
  flush()
  return found.slice(0, 12)
}

/** The sentences of an answer that say something was left undone. */
export function findSaid(answer: string): string[] {
  const found: string[] = findSections(answer)
  const inSections = found.join(' \n ')
  for (const s of sentences(answer)) {
    if (SAID.some(re => re.test(s))) {
      const text = clip(s.replace(/\*\*|__|`/g, ''))
      const probe = text.slice(0, 40)
      if (!found.includes(text) && !inSections.includes(probe)) found.push(text)
    }
  }
  return found.slice(0, 12)
}

/** Lines with TODO-like markers that are in `after` but were not in `before`. */
export function findMarkers(before: string, after: string): string[] {
  const old = new Set(before.split('\n').map(l => l.trim()))
  const found: string[] = []
  for (const line of after.split('\n')) {
    const t = line.trim()
    if (t && MARKER.test(t) && !old.has(t)) {
      const text = clip(t)
      if (!found.includes(text)) found.push(text)
    }
  }
  return found.slice(0, 8)
}

/** 182340 -> "182.3K" */
export function kTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(Math.round(n))
}

/** 3725000 -> "1h02m", 192000 -> "3m12s" */
export function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m${String(sec).padStart(2, '0')}s`
  return `${sec}s`
}

/** "3:07" for a countdown. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function ttlMs(ttl: '5m' | '1h'): number {
  return ttl === '1h' ? 3_600_000 : 300_000
}

/**
 * Reads the cache lifetime the last response used from the tail of a
 * transcript (JSONL): `ephemeral_1h_input_tokens` > 0 means 1h.
 */
export function ttlFromTranscriptTail(tail: string): '5m' | '1h' | null {
  const lines = tail.split('\n').reverse()
  for (const line of lines) {
    if (!line.includes('"usage"') || !line.includes('"assistant"')) continue
    const h1 = /"ephemeral_1h_input_tokens"\s*:\s*(\d+)/.exec(line)
    const m5 = /"ephemeral_5m_input_tokens"\s*:\s*(\d+)/.exec(line)
    if (h1 && Number(h1[1]) > 0) return '1h'
    if (m5 && Number(m5[1]) > 0) return '5m'
  }
  return null
}

/** Clock time "14:02" from epoch ms, in local time. */
export function hhmm(at: number): string {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 0 fine, 1 getting full, 2 nearly full. */
export function contextLevel(percent: number | undefined, warnAt: number, urgentAt: number): 0 | 1 | 2 {
  if (percent === undefined) return 0
  if (percent >= urgentAt) return 2
  if (percent >= warnAt) return 1
  return 0
}
