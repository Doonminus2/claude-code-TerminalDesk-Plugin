"""Renders placeholder showcase media for terminal-desk: a screenshot and a short demo.

Everything is a mock drawn with Pillow, not a capture of a real session.
Usage: python3 scripts/make-media.py assets   (needs Pillow, ffmpeg, DejaVu fonts)
"""
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1]
FRAMES = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'terminal-desk-frames')
os.makedirs(OUT, exist_ok=True)
os.makedirs(FRAMES, exist_ok=True)

W, H = 1600, 1000
MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
MONO_B = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf'
SANS_B = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
F = ImageFont.truetype(MONO, 17)
FB = ImageFont.truetype(MONO_B, 17)
FS = ImageFont.truetype(MONO, 15)
FT = ImageFont.truetype(SANS_B, 13)

BG = (24, 25, 30)
PANEL = (29, 30, 36)
TEXT = (214, 216, 222)
DIM = (118, 125, 138)
RED = (240, 113, 120)
YEL = (229, 192, 123)
GRN = (152, 195, 121)
BLU = (97, 175, 239)
PUR = (167, 139, 250)
ORG = (236, 150, 92)
GRY = (90, 94, 104)
LINE = 22
CW = F.getlength('M')

CATS = [('Messages', BLU), ('System tools', GRY), ('Skills', YEL), ('Memory files', ORG),
        ('MCP server instructions', GRN), ('System prompt', DIM), ('Custom agents', PUR)]


def k(n):
    return f'{n / 1000:.1f}K' if n < 1_000_000 else f'{n / 1_000_000:.1f}M'


def text(d, x, y, s, fill=TEXT, font=F):
    d.text((x, y), s, fill=fill, font=font)
    return x + font.getlength(s)


def wrap(s, cols):
    words, lines, cur = s.split(' '), [], ''
    for w in words:
        if len(cur) + len(w) + (1 if cur else 0) > cols:
            lines.append(cur)
            cur = w
        else:
            cur = (cur + ' ' + w) if cur else w
    if cur:
        lines.append(cur)
    return lines


def box(d, x0, y0, x1, y1, color, width=1):
    d.rounded_rectangle((x0, y0, x1, y1), radius=8, outline=color, width=width)


def frame(st):
    img = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(img)

    # window chrome
    d.rectangle((0, 0, W, 30), fill=(36, 37, 44))
    for i, c in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
        d.ellipse((14 + i * 22, 9, 26 + i * 22, 21), fill=c)
    text(d, 92, 7, 'Claude Code — ~/projects/retry-lib', DIM, FT)

    # ---- transcript (left)
    lx, y = 22, 48
    for kind, s in st['transcript']:
        color = {'user': TEXT, 'bullet': TEXT, 'dim': DIM, 'tool': GRN, 'add': GRN, 'del': RED}[kind]
        prefix = {'user': '> ', 'bullet': '● ', 'tool': '● ', 'dim': '  ', 'add': '  + ', 'del': '  - '}[kind]
        if kind == 'user':
            d.rectangle((0, y - 3, 1015, y + LINE - 3), fill=(40, 42, 50))
        for i, part in enumerate(wrap(s, 86)):
            text(d, lx, y, (prefix if i == 0 else '  ') + part, color)
            y += LINE
        y += 8

    # toast
    if st.get('toast'):
        t = st['toast']
        tw = F.getlength(t) + 28
        d.rounded_rectangle((1000 - tw, 44, 1000, 80), radius=8, fill=(46, 48, 58), outline=YEL)
        text(d, 1000 - tw + 14, 52, t, YEL)

    # divider
    d.line((1030, 30, 1030, H - 96), fill=(55, 58, 68), width=2)

    # ---- pane (right)
    px0, px1 = 1046, W - 18
    text(d, px1 - 10, 36, '×', DIM, FS)
    y = 56
    cols = int((px1 - px0 - 32) / CW)

    level = st.get('level', 0)
    if level:
        color = RED if level == 2 else YEL
        msg = ('Time for /clear: long contexts make answers slower, pricier and less sharp.'
               if level == 2 else 'Finish the current task, then /clear (or /compact).')
        lines = wrap(msg, cols)
        h = 30 + LINE * (len(lines) + 1) + 14
        box(d, px0, y, px1, y + h, color, 3)
        text(d, px0 + 14, y + 10, ('🔴 ' if False else '■ ') + ('Context nearly full' if level == 2 else 'Context getting full') + f' ({st["pct"]}%)', color, FB)
        yy = y + 10 + LINE
        for ln in lines:
            text(d, px0 + 14, yy, ln)
            yy += LINE
        x = text(d, px0 + 14, yy, 'c', YEL)
        x = text(d, x, yy, ': Type /clear    ')
        x = text(d, x, yy, 'k', YEL)
        text(d, x, yy, ': Type /compact')
        y += h + 14

    # Left undone
    items, tasks = st['undone'], st['tasks']
    n = len(items) + len(tasks)
    body = []
    if n == 0:
        body.append(('dim', 'Nothing left undone. Press h to see what gets caught.'))
    else:
        for it in items:
            body.append(('head', it))
            for ln in wrap(it['text'], cols):
                body.append(('text', ln))
            body.append(('gap', ''))
        if tasks:
            body.append(('dim', 'Task list · not completed'))
            for t in tasks:
                body.append(('task', t))
            body.append(('gap', ''))
        body.append(('buttons', ''))
    def bh(b):
        if b[0] == 'gap':
            return 10
        if b[0] == 'head' and b[1].get('file'):
            return 2 * LINE
        if b[0] == 'buttons':
            return LINE + 6
        return LINE
    h = 34 + sum(bh(b) for b in body) + 10
    box(d, px0, y, px1, y + h, RED)
    x = text(d, px0 + 14, y + 10, f'Left undone{f" ({n})" if n else ""}', RED, FB)
    text(d, x + 22, y + 10, 'h: how it works', DIM)
    yy = y + 10 + LINE + 4
    for kind, v in body:
        if kind == 'gap':
            yy += 10
            continue
        if kind == 'dim':
            text(d, px0 + 14, yy, v, DIM)
        elif kind == 'head':
            x = text(d, px0 + 14, yy, f'U{v["id"]} ', RED, FB)
            x = text(d, x, yy, f'· {v["at"]} · ', DIM)
            x = text(d, x, yy, v['kind'], RED)
            text(d, x + 14, yy, '✓', DIM)
            if v.get('file'):
                yy += LINE
                text(d, px0 + 14, yy, v['file'], DIM)
        elif kind == 'text':
            text(d, px0 + 14, yy, v)
        elif kind == 'task':
            mark, subj = v
            x = text(d, px0 + 14, yy, mark + ' ', YEL if mark == '◐' else TEXT)
            text(d, x, yy, subj)
        elif kind == 'buttons':
            d.rounded_rectangle((px0 + 12, yy - 2, px0 + 252, yy + 20), radius=4, outline=BLU)
            text(d, px0 + 20, yy, 'f: Ask Claude to finish', BLU)
            text(d, px0 + 272, yy, '[ x: Clear all ]')
        yy += LINE
    y += h + 14

    # Context
    pct, total, cats = st['pct'], st['window'], st['cats']
    used = sum(c for c in cats)
    rows = [(name, color, tok) for (name, color), tok in zip(CATS, cats) if tok > 0]
    h = 30 + LINE * (3 + len(rows) + 2) + 6
    box(d, px0, y, px1, y + h, YEL)
    text(d, px0 + 14, y + 10, 'Where your context went', YEL, FB)
    text(d, px0 + 14, y + 10 + LINE, f'{pct}% used · {k(used)} / {k(total)}')
    bx, by, bw = px0 + 14, y + 14 + 2 * LINE, px1 - px0 - 28
    d.rectangle((bx, by, bx + bw, by + 14), fill=(55, 58, 68))
    cx = bx
    for (name, color), tok in zip(CATS, cats):
        wseg = bw * tok / total
        if wseg >= 1:
            d.rectangle((cx, by, cx + wseg, by + 14), fill=color)
            cx += wseg
    yy = y + 14 + 3 * LINE
    for name, color, tok in rows:
        d.rectangle((px0 + 16, yy + 5, px0 + 26, yy + 15), fill=color)
        x = text(d, px0 + 34, yy, name + ' ')
        text(d, x, yy, k(tok), DIM)
        yy += LINE
    for name, tok in [('Free space', max(0, total - used - 33_000)), ('Autocompact buffer', 33_000)]:
        d.rectangle((px0 + 16, yy + 5, px0 + 26, yy + 15), fill=GRY)
        x = text(d, px0 + 34, yy, name + ' ', DIM)
        text(d, x, yy, k(tok), DIM)
        yy += LINE
    y += h + 14

    # Prompt cache
    h = 30 + LINE * 3 + 10
    box(d, px0, y, px1, y + h, GRN)
    text(d, px0 + 14, y + 10, 'Prompt cache', GRN, FB)
    left = st['cache_left']
    if left > 0:
        x = text(d, px0 + 14, y + 10 + LINE, '● warm', GRN, FB)
        text(d, x, y + 10 + LINE, f' · goes cold in {left // 60}:{left % 60:02d} (5m cache)')
        text(d, px0 + 14, y + 10 + 2 * LINE, f'Next message reads ~{k(used)} from cache: cheap.', DIM)
    else:
        x = text(d, px0 + 14, y + 10 + LINE, '○ cold', YEL, FB)
        text(d, x, y + 10 + LINE, f' · expired {-left}s ago (5m cache)')
        text(d, px0 + 14, y + 10 + 2 * LINE, f'Next message re-caches ~{k(used)} tokens: pricier.', DIM)
    if st['hit']:
        text(d, px0 + 14, y + 10 + 3 * LINE, f'Hit ratio this session: {st["hit"]}%', DIM)
    y += h + 14
    x = text(d, px0, y, f'${st["usd"]:.2f}', YEL)
    x = text(d, x + 20, y, f'session {st["elapsed"]}', DIM)
    text(d, x + 20, y, '/desk hides', DIM)

    # ---- band above the prompt
    by = H - 96
    d.line((0, by, 1030, by), fill=(55, 58, 68), width=1)
    if level:
        color = RED if level == 2 else YEL
        x = text(d, 22, by + 8, f'■ Context {st["pct"]}% full', color, FB)
        tail = (' · /clear starts fresh, /compact keeps a summary' if level == 2
                else ' · /clear when this task is done')
        if n:
            tail += f' · {n} left undone will carry over'
        text(d, x, by + 8, tail, DIM)
        x = text(d, 22, by + 8 + LINE, 'c', YEL)
        x = text(d, x, by + 8 + LINE, ': Type /clear   ')
        x = text(d, x, by + 8 + LINE, 'k', YEL)
        x = text(d, x, by + 8 + LINE, ': Type /compact   ')
        x = text(d, x, by + 8 + LINE, 'h', YEL)
        text(d, x, by + 8 + LINE, ': Hide', DIM)
    # prompt
    d.line((0, H - 50, 1030, H - 50), fill=(55, 58, 68), width=1)
    text(d, 22, H - 44, '> ' + st.get('prompt', ''), TEXT)

    # status line
    parts = []
    pre = '■ ' if level else ''
    parts.append(f'{pre}ctx {st["pct"]}%' + (' → /clear' if level == 2 else ''))
    parts.append(f'${st["usd"]:.2f}')
    parts.append(f'cache warm {left // 60}:{left % 60:02d}' if left > 0 else 'cache cold')
    if n:
        parts.append(f'⚠ {n} left undone (/desk)')
    text(d, 22, H - 22, 'desk · ' + ' · '.join(parts), RED if level == 2 else (YEL if level else DIM), FS)

    return img


BASE_TRANSCRIPT = [
    ('user', 'Add a retry helper with exponential backoff and a README section'),
    ('dim', 'Read 3 files, ran 2 shell commands'),
    ('tool', 'Update(src/retry.ts)'),
    ('add', 'export const retry = async <T>(run: () => Promise<T>, attempts = 3) => {'),
    ('add', '// TODO: wait with the next attempt'),
    ('bullet', 'Added retry() with exponential backoff and a README section on when to use it.'),
]
ADMIT = [('bullet', "I didn't run the test suite: there is no test runner configured yet.")]

ITEMS_FILE = {'id': 1, 'at': '19:42', 'kind': 'in a file', 'file': 'src/retry.ts',
              'text': '// TODO: wait with the next attempt'}
ITEMS_SAID = {'id': 2, 'at': '19:43', 'kind': 'Claude said',
              'text': "I didn't run the test suite: there is no test runner configured yet."}
CARRIED_1 = {'id': 3, 'at': '20:31', 'kind': 'task list', 'text': 'Write tests for retry()'}
CARRIED_2 = {'id': 4, 'at': '20:31', 'kind': 'task list', 'text': 'Document the backoff options'}
TASKS = [('◐', 'Write tests for retry()'), ('◻', 'Document the backoff options')]


def state(**kw):
    s = dict(transcript=BASE_TRANSCRIPT, undone=[], tasks=[], pct=21, window=200_000,
             cats=[24_000, 9_400, 4_100, 2_600, 1_300, 900, 0], cache_left=300, hit=91,
             usd=0.42, elapsed='6m12s', level=0, toast=None, prompt='')
    s.update(kw)
    return s


# ---- screenshot: a full desk with an urgent warning
shot = state(transcript=BASE_TRANSCRIPT + ADMIT, undone=[ITEMS_FILE, ITEMS_SAID], tasks=TASKS,
             pct=83, cats=[115_000, 23_600, 9_900, 7_000, 4_000, 3_900, 2_600],
             cache_left=212, hit=92, usd=3.87, elapsed='48m03s', level=2)
frame(shot).save(os.path.join(OUT, 'screenshot.png'))

# ---- demo: scenes, each a list of (state, seconds)
scenes = []
# 1 calm start
for t in range(3):
    scenes.append((state(cache_left=300 - t), 1))
# 2 a TODO lands in a file
for t in range(3):
    scenes.append((state(undone=[ITEMS_FILE], cache_left=297 - t, toast='⚠ Left undone: +1 (/desk to see)' if t < 2 else None,
                         pct=34, cats=[42_000, 9_400, 4_100, 2_600, 1_300, 900, 0], usd=0.91), 1))
# 3 Claude admits it skipped the tests, tasks still open
for t in range(3):
    scenes.append((state(transcript=BASE_TRANSCRIPT + ADMIT, undone=[ITEMS_FILE, ITEMS_SAID], tasks=TASKS,
                         cache_left=294 - t, toast='⚠ Left undone: +1 (/desk to see)' if t < 2 else None,
                         pct=47, cats=[70_000, 9_400, 4_100, 2_600, 1_300, 900, 0], usd=1.64), 1))
# 4 context fills: yellow then red
for t in range(2):
    scenes.append((state(transcript=BASE_TRANSCRIPT + ADMIT, undone=[ITEMS_FILE, ITEMS_SAID], tasks=TASKS,
                         cache_left=180 - t, pct=64, cats=[98_000, 9_400, 4_100, 2_600, 1_300, 900, 0],
                         usd=2.55, level=1, toast='■ Context 64% full: consider /clear when this task is done'), 1))
for t in range(3):
    scenes.append((state(transcript=BASE_TRANSCRIPT + ADMIT, undone=[ITEMS_FILE, ITEMS_SAID], tasks=TASKS,
                         cache_left=120 - t, pct=83, cats=[115_000, 23_600, 9_900, 7_000, 4_000, 3_900, 2_600],
                         usd=3.87, level=2, toast='■ Context 83% full: time to /clear' if t < 2 else None), 1))
# 5 the cache goes cold while you are away
for t in range(2):
    scenes.append((state(transcript=BASE_TRANSCRIPT + ADMIT, undone=[ITEMS_FILE, ITEMS_SAID], tasks=TASKS,
                         cache_left=-(40 + t), pct=83, cats=[115_000, 23_600, 9_900, 7_000, 4_000, 3_900, 2_600],
                         usd=3.87, level=2, prompt='/clear'), 1))
# 6 after /clear: fresh context, the list carried over
for t in range(3):
    scenes.append((state(transcript=[('dim', '(conversation cleared)')], undone=[ITEMS_FILE, ITEMS_SAID, CARRIED_1, CARRIED_2],
                         tasks=[], pct=6, cats=[1_200, 9_400, 4_100, 2_600, 1_300, 900, 0], cache_left=-60,
                         hit=0, usd=0.00, elapsed='0m0' + str(4 + t) + 's', toast='Carried 4 left-undone item(s) into the fresh session' if t < 2 else None,
                         prompt='Earlier you left these undone. Please finish them…' if t == 2 else ''), 1))

for f in os.listdir(FRAMES):
    os.remove(os.path.join(FRAMES, f))
i = 0
for st, secs in scenes:
    img = frame(st)
    for _ in range(secs):
        img.save(os.path.join(FRAMES, f'f{i:04d}.png'))
        i += 1

# 1 frame per second of mock time, shown at 1 fps; mp4 at 30 fps for players
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '1', '-i', os.path.join(FRAMES, 'f%04d.png'),
                '-vf', 'scale=1280:-2:flags=lanczos,fps=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart', os.path.join(OUT, 'demo.mp4')], check=True)
palette = os.path.join(FRAMES, 'palette.png')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '1', '-i', os.path.join(FRAMES, 'f%04d.png'),
                '-vf', 'scale=960:-2:flags=lanczos,palettegen=max_colors=64', palette], check=True)
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '1', '-i', os.path.join(FRAMES, 'f%04d.png'),
                '-i', palette, '-lavfi', 'scale=960:-2:flags=lanczos[x];[x][1:v]paletteuse=dither=none',
                '-loop', '0', os.path.join(OUT, 'demo.gif')], check=True)
print('frames', i)
