#!/bin/bash
# Installs the terminal-desk mod for Claude Code (macOS / Linux).
# Usage:  bash install.sh            install or update
#         bash install.sh --remove   uninstall
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.claude/mods/terminal-desk"

if ! command -v claude >/dev/null 2>&1; then
  echo "ไม่พบคำสั่ง claude — ติดตั้ง Claude Code ก่อน: https://code.claude.com/docs/en/setup" >&2
  exit 1
fi

if [ "${1:-}" = "--remove" ]; then
  claude plugin uninstall terminal-desk@terminal-desk || true
  claude plugin marketplace remove terminal-desk || true
  rm -rf "$DEST"
  echo "ถอนการติดตั้ง terminal-desk แล้ว"
  exit 0
fi

echo "Claude Code $(claude --version 2>/dev/null | head -1) (mods ต้องการ 2.1.287 ขึ้นไป)"

mkdir -p "$DEST"
if [ "$SRC" != "$DEST" ]; then
  rm -rf "$DEST"
  mkdir -p "$DEST"
  cp -R "$SRC/." "$DEST/"
fi

claude plugin validate "$DEST"
claude plugin marketplace add "$DEST" 2>/dev/null || claude plugin marketplace update terminal-desk || true
claude plugin install terminal-desk@terminal-desk --config autoOpen=true --config cacheTtl=auto

echo
echo "ติดตั้งเสร็จแล้ว เปิด Claude Code ใหม่ แล้วพิมพ์ /desk เพื่อเปิดแผง"
echo "(ถ้า Claude Code เปิดอยู่ ให้พิมพ์ /reload-plugins)"
