# terminal-desk

Mod สำหรับ Claude Code ที่เพิ่มแผงด้านข้าง มี 3 ส่วน + คำเตือน context:

- **Left undone** — งานที่ Claude ทิ้งค้างไว้ (ดูวิธีทำงานด้านล่าง)
- **Where your context went** — แถบสีแยกตามหมวด (Messages, System tools, MCP, Memory files ฯลฯ) พร้อม % และจำนวน token
- **Prompt cache** — cache ยังอุ่นอยู่ไหม เหลือเวลาอีกเท่าไรก่อนเย็น และ hit ratio ของ session
- **คำเตือน context ใกล้เต็ม** — บอกให้ `/clear` หรือ `/compact` เมื่อถึงเวลา

ด้านล่างแผงมีค่าใช้จ่ายและเวลาของ session ส่วนใต้ช่องพิมพ์มีแถบสถานะสั้นๆ แสดงตลอด เช่น
`desk · 🟡 ctx 64% · $24.32 · cache warm 3:12 · ⚠ 3 left undone (/desk)`

## Left undone ทำงานยังไง

หลัง Claude ตอบเสร็จแต่ละรอบ mod จะเก็บรายการจาก 3 แหล่ง:

1. **Claude said** — อ่านข้อความทั้งหมดที่ Claude เขียนในรอบนั้น แล้วจับ
   - ประโยคที่ยอมรับว่าไม่ได้ทำ เช่น "I didn't run the tests", "not yet implemented", "I won't implement until you say so", "ยังไม่ได้รัน…", "ข้ามไป…"
   - รายการ bullet ใต้หัวข้อ `OPEN`, `FLAGGED`, `BLOCKED`, `Remaining:`, `Next steps`, `Known issues` ฯลฯ (ขึ้นเป็น `OPEN: …`)
   - ข้ามโค้ดใน ```` ``` ```` ไม่จับ
2. **in a file** — ตอน Claude ใช้ Write / Edit / MultiEdit / NotebookEdit ถ้ามีบรรทัด**ใหม่**ที่มี `TODO`, `FIXME`, `XXX`, `HACK`, `NotImplementedError` จะถูกจับพร้อมชื่อไฟล์ (บรรทัด TODO ที่มีอยู่ก่อนแล้วไม่นับ)
3. **task list** — to-do ของ Claude เอง (TaskCreate / TaskUpdate / TodoWrite) ที่ยังไม่ completed แสดงเป็น ◐ กำลังทำ / ◻ ยังไม่เริ่ม และหายไปเองเมื่อ Claude ทำเสร็จ

ในแผงกด:
- `✓` ลบทีละรายการ
- `x` ล้างทั้งหมด (หรือ `/desk-clear`)
- `f` (Ask Claude to finish) พิมพ์คำขอให้ Claude ทำรายการที่ค้างลงในช่องพิมพ์ คุณกด Enter เอง
- `h` เปิดคำอธิบายนี้ในแผง

รายการค้างจะ**ถูกยกไป session ใหม่หลัง `/clear`** (task ที่ยังไม่เสร็จก็ยกไปด้วย) จึง clear ก่อนแล้วค่อยสั่งให้ Claude ทำต่อใน context ที่สะอาดได้

การจับใช้รูปแบบข้อความ อาจพลาดหรือจับเกินบ้าง แก้ pattern ได้ใน `hooks/detect.ts`

## คำเตือน context ใกล้เต็ม

| context | ที่แสดง |
| --- | --- |
| ต่ำกว่า 60% | ปกติ |
| 60% ขึ้นไป | 🟡 toast หนึ่งครั้ง, แถบเหนือช่องพิมพ์, ป้ายในแผง: "จบงานนี้แล้ว /clear" |
| 80% ขึ้นไป | 🔴 เตือนอีกครั้ง: "ถึงเวลา /clear (หรือ /compact เพื่อเก็บสรุป)" |

แถบเหนือช่องพิมพ์มีปุ่ม **Type /clear**, **Type /compact** (พิมพ์คำสั่งลงช่องให้ คุณกด Enter เอง) และ **Hide** ซ่อนจนกว่าจะถึงระดับถัดไป ปรับเกณฑ์ได้ที่ `/plugin` → terminal-desk → configure (`warnPercent`, `urgentPercent`)

## ติดตั้ง

ต้องมี Claude Code CLI เวอร์ชัน 2.1.287 ขึ้นไป (`claude --version`)

**แบบที่ 1: ติดตั้งจาก GitHub (แนะนำ)** พิมพ์ในช่องพิมพ์ของ Claude Code ใน terminal:

```
/plugin install terminal-desk --marketplace Doonminus2/claude-code-TerminalDesk-Plugin
```

ตอบ `y` เพื่อเพิ่ม marketplace แล้วเลือก scope เป็น user

**แบบที่ 2: จาก clone ในเครื่อง** (macOS / Linux)

```bash
git clone https://github.com/Doonminus2/claude-code-TerminalDesk-Plugin.git
bash claude-code-TerminalDesk-Plugin/install.sh
```

จากนั้นเปิด Claude Code ใหม่ (หรือพิมพ์ `/reload-plugins` ถ้าเปิดค้างไว้)

## ใช้งาน

| คำสั่ง | ทำอะไร |
| --- | --- |
| `/desk` | เปิด/ปิดแผง |
| `/desk-clear` | ล้างรายการ Left undone |

- แผงจะเปิดเองตอนเริ่ม session ถ้าหน้าต่าง terminal กว้างพอ (ราว 144 คอลัมน์ขึ้นไป) ถ้าแคบกว่านั้นพิมพ์ `/desk` เปิดเองได้ จะไปอยู่เหนือช่องพิมพ์แทน
- แผงจะเป็น sidebar ด้านขวาเมื่อใช้ fullscreen mode ของ Claude Code
- ปรับตั้งค่าได้ที่ `/plugin` → terminal-desk → configure:
  - `autoOpen` เปิดแผงเองตอนเริ่ม session
  - `cacheTtl` อายุ cache `auto` / `5m` / `1h`
  - `warnPercent`, `urgentPercent` เกณฑ์เตือน context (ค่าเริ่มต้น 60 / 80)

## อัปเดต

```bash
claude plugin marketplace update terminal-desk
claude plugin update terminal-desk@terminal-desk
```

แล้ว `/reload-plugins` ใน Claude Code

## ถอนการติดตั้ง

```bash
claude plugin uninstall terminal-desk@terminal-desk
```

(ถ้าติดตั้งด้วย install.sh ใช้ `bash ~/.claude/mods/terminal-desk/install.sh --remove`)

## พัฒนาต่อ

```bash
claude --plugin-dir .            # โหลด mod จากโฟลเดอร์นี้ แก้แล้ว reload เอง
claude plugin validate .         # ตรวจ manifest และ hooks
claude plugin test .             # รันเทสต์ใน tests/
```

- `hooks/register.tsx` แผง, status line, คำสั่ง `/desk`
- `hooks/detect.ts` ตัวจับข้อความ "Left undone" (แก้ pattern ที่นี่)
- `types/index.d.ts` state ของ mod

## หมายเหตุ

- ค่าใช้จ่ายเป็นค่าประมาณที่ Claude Code คำนวณเอง (เหมือน `/cost`)
- Mod รันด้วยสิทธิ์ของคุณ โค้ดทั้งหมดอยู่ใน `hooks/` อ่านได้ และตรวจได้ด้วย `claude plugin validate ~/.claude/mods/terminal-desk`
