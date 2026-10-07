# terminal-desk

Mod สำหรับ Claude Code ที่เพิ่มแผงด้านข้าง (คล้ายในคลิป) มี 3 ส่วน:

- **Left undone** — จับประโยคที่ Claude ยอมรับว่าไม่ได้ทำ ("I didn't run the tests…", "not yet implemented", "ยังไม่ได้รัน…") และ `TODO` / `FIXME` ที่ Claude เพิ่งเขียนลงไฟล์ กด `✓` เพื่อลบทีละอัน, `x` ล้างทั้งหมด, หรือ `f` (Ask Claude to finish) เพื่อเติมข้อความขอให้ Claude ทำต่อลงช่องพิมพ์ให้คุณกดส่งเอง
- **Where your context went** — แถบสีแยกตามหมวด (Messages, System tools, MCP, Memory files ฯลฯ) พร้อม % และจำนวน token
- **Prompt cache** — cache ยังอุ่นอยู่ไหม เหลือเวลาอีกเท่าไรก่อนเย็น และ hit ratio ของ session

ด้านล่างแผงมีค่าใช้จ่ายและเวลาของ session ส่วนใต้ช่องพิมพ์มีแถบสถานะสั้นๆ แสดงตลอด เช่น
`desk · ctx 32% · $24.32 · cache warm 3:12 · ⚠ 3 left undone (/desk)`

## ติดตั้ง (macOS)

ต้องมี Claude Code CLI เวอร์ชัน 2.1.287 ขึ้นไป (`claude --version`)

```bash
unzip terminal-desk.zip -d ~/Downloads/terminal-desk
bash ~/Downloads/terminal-desk/install.sh
```

จากนั้นเปิด Claude Code ใหม่ (หรือพิมพ์ `/reload-plugins` ถ้าเปิดค้างไว้)

## ใช้งาน

| คำสั่ง | ทำอะไร |
| --- | --- |
| `/desk` | เปิด/ปิดแผง |
| `/desk-clear` | ล้างรายการ Left undone |

- แผงจะเปิดเองตอนเริ่ม session ถ้าหน้าต่าง terminal กว้างพอ (ราว 144 คอลัมน์ขึ้นไป) ถ้าแคบกว่านั้นพิมพ์ `/desk` เปิดเองได้ จะไปอยู่เหนือช่องพิมพ์แทน
- แผงจะเป็น sidebar ด้านขวาเมื่อใช้ fullscreen mode ของ Claude Code
- ปรับตั้งค่าได้ที่ `/plugin` → terminal-desk → configure: ปิดการเปิดเองตอนเริ่ม (`autoOpen`) หรือบังคับอายุ cache เป็น `5m` / `1h` (`cacheTtl`, ค่าเริ่มต้น `auto` อ่านจาก transcript)

## ถอนการติดตั้ง

```bash
bash ~/.claude/mods/terminal-desk/install.sh --remove
```

## หมายเหตุ

- การจับ "Left undone" ใช้รูปแบบข้อความ จึงอาจพลาดหรือจับเกินบ้าง กด `✓` ทิ้งได้
- ค่าใช้จ่ายเป็นค่าประมาณที่ Claude Code คำนวณเอง (เหมือน `/cost`)
- Mod รันด้วยสิทธิ์ของคุณ โค้ดทั้งหมดอยู่ใน `hooks/` อ่านได้ และตรวจได้ด้วย `claude plugin validate ~/.claude/mods/terminal-desk`
