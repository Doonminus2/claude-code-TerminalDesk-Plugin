# Changelog

## v0.0.1 — 2026-10-07

First public release.

### Added

- **Desk pane** beside the transcript (`/desk` to show or hide). It opens on its own in wide terminals and docks as a sidebar in fullscreen.
- **Left undone**, filled from three sources:
  - **What Claude said**: admissions such as "I didn't run…", "not yet implemented", "I won't implement until…", Thai phrases like "ยังไม่ได้…", and bullets under `OPEN` / `FLAGGED` / `Remaining` / `Next steps` headings.
  - **New TODO markers in files**: new `TODO` / `FIXME` / `XXX` / `HACK` / `NotImplementedError` lines written by `Write` / `Edit` / `MultiEdit` / `NotebookEdit`.
  - **Claude's own task list**: items from `TaskCreate` / `TaskUpdate` / `TodoWrite` that are not completed.
  - Keys: `✓` dismiss, `x` clear all, `f` ask Claude to finish (fills the prompt, never sends), `h` explains how it works.
  - The list carries over across `/clear`.
- **Where your context went**: a colored bar and per-category breakdown, the same categories as `/context`.
- **Context warning** at 60% (yellow) and 80% (red), configurable: a toast, a band above the prompt with "Type /clear" / "Type /compact" / "Hide", and a banner in the pane.
- **Prompt cache**: warm/cold status with a countdown, the tokens the next message reads or re-caches, and the session hit ratio. The cache lifetime (5m / 1h) is read from the transcript.
- **Status line** under the prompt: context %, cost, cache countdown and left-undone count.
- Settings: `autoOpen`, `cacheTtl`, `warnPercent`, `urgentPercent`.
- `install.sh` for installing from a clone, and a marketplace entry for one-line install from GitHub.
- MIT license.
