# Demo

The animated demo in the top-level [README](../README.md) is rendered from these two
files with [VHS](https://github.com/charmbracelet/vhs):

- **`demo.sh`** — a self-contained, ~13-second narrated walkthrough of the loop:
  open a draft PR → probe both signals (`agent-signals.sh`) → fix the valid findings,
  push a new head → re-probe (clean + green) → PR left ready for a human.
  It is **illustrative**: the output is sample data in the *real* format the tools
  print, so it shows the actual shape of a run without needing a live PR or CodeRabbit.
- **`demo.tape`** — the VHS script that runs `demo.sh` in a clean terminal and records
  it to `../docs/demo.gif`.

## Regenerate the GIF

```bash
brew install vhs          # macOS; pulls ttyd + ffmpeg. (Linux: see the VHS README)
cd demo
vhs demo.tape             # writes ../docs/demo.gif
```

## Preview the narrative without rendering

```bash
./demo.sh                 # paced, as it appears in the GIF
DEMO_NOSLEEP=1 ./demo.sh  # instant, for quick edits
```

## Customize

Edit `demo.sh` to change what the demo shows (it's just `printf` + `sleep`), then
re-run `vhs demo.tape`. Tune size/theme/speed in `demo.tape` (`Set FontSize`,
`Set Theme`, `Set Width/Height`, `Set TypingSpeed`). If the GIF is too large for the
README, drop the resolution or `Set Framerate 20`, or post-optimize with `gifsicle -O3`.
