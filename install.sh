#!/usr/bin/env bash
# install.sh — drop the Overnight autonomous-coding system into a target repo.
#
# Usage:
#   ./install.sh /path/to/your-repo            # non-destructive: never overwrites existing files
#   ./install.sh /path/to/your-repo --force    # overwrite existing files with the packaged versions
#   ./install.sh --help
#
# What it copies:
#   .claude/skills/*            the portable skills (engine + quality lenses)
#   scripts/agent-signals.sh    the per-turn CodeRabbit + CI signals probe
#   docs/*                      how-it-works / quickstart / configuration / autonomy-engine / faq
#                               + quality-lenses / code-review-guidelines / parallel-repo-write-protocol
#   .coderabbit.example.yaml -> .coderabbit.yaml   (only if the target has none)
#   .github/workflows/ci.example.yml, .github/pull_request_template.md
#
# What it does NOT do (on purpose):
#   - It does not edit your AGENTS.md / CLAUDE.md. Paste agents/AGENTS.snippet.md
#     yourself and fill the knobs (see agents/AGENTS.example.md). This is a one-time
#     decision you should make consciously.
set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() { sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }

TARGET=""
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --help|-h) usage 0 ;;
    --force)   FORCE=1 ;;
    -*)        echo "unknown flag: $arg" >&2; usage 1 ;;
    *)         TARGET="$arg" ;;
  esac
done

[ -n "$TARGET" ] || { echo "error: target repo path required" >&2; usage 1; }
[ -d "$TARGET" ] || { echo "error: target '$TARGET' is not a directory" >&2; exit 1; }
TARGET="$(cd "$TARGET" && pwd)"
if [ ! -d "$TARGET/.git" ]; then
  echo "warning: '$TARGET' is not a git repository root. Continue anyway? [y/N]" >&2
  read -r reply; case "$reply" in y|Y) ;; *) echo "aborted." >&2; exit 1 ;; esac
fi

copied=0; skipped=0

# copy_file SRC DST — non-destructive unless --force
copy_file() {
  local src="$1" dst="$2"
  mkdir -p "$(dirname "$dst")"
  if [ -e "$dst" ] && [ "$FORCE" -ne 1 ]; then
    echo "  skip (exists): ${dst#$TARGET/}"; skipped=$((skipped+1)); return
  fi
  cp "$src" "$dst"; echo "  copy:          ${dst#$TARGET/}"; copied=$((copied+1))
}

# copy_tree SRC_DIR DST_DIR — walk files, non-destructive unless --force
copy_tree() {
  local srcdir="$1" dstdir="$2"
  [ -d "$srcdir" ] || return 0
  while IFS= read -r -d '' f; do
    copy_file "$f" "$dstdir/${f#$srcdir/}"
  done < <(find "$srcdir" -type f -print0)
}

echo "Installing Overnight into: $TARGET"
echo

echo "• skills (.claude/skills/)"
copy_tree "$SELF_DIR/.claude/skills" "$TARGET/.claude/skills"

echo "• signals probe (scripts/)"
copy_file "$SELF_DIR/scripts/agent-signals.sh" "$TARGET/scripts/agent-signals.sh"
chmod +x "$TARGET/scripts/agent-signals.sh" 2>/dev/null || true

echo "• docs (docs/)"
copy_tree "$SELF_DIR/docs" "$TARGET/docs"

echo "• reviewer config"
if [ -e "$TARGET/.coderabbit.yaml" ] && [ "$FORCE" -ne 1 ]; then
  copy_file "$SELF_DIR/.coderabbit.example.yaml" "$TARGET/.coderabbit.example.yaml"
  echo "  (you already have .coderabbit.yaml — left the template as .coderabbit.example.yaml)"
else
  copy_file "$SELF_DIR/.coderabbit.example.yaml" "$TARGET/.coderabbit.yaml"
fi

echo "• CI + PR template (.github/)"
copy_file "$SELF_DIR/.github/workflows/ci.example.yml" "$TARGET/.github/workflows/ci.example.yml"
copy_file "$SELF_DIR/.github/pull_request_template.md" "$TARGET/.github/pull_request_template.md"

echo
echo "Done. ${copied} file(s) copied, ${skipped} skipped (already present; re-run with --force to overwrite)."
echo
echo "Next steps:"
echo "  1. Paste agents/AGENTS.snippet.md into $TARGET/AGENTS.md (or CLAUDE.md) and fill the knobs."
echo "     A filled-in example is in agents/AGENTS.example.md."
echo "  2. Wire a reviewer: install the CodeRabbit GitHub App or the 'cr' CLI"
echo "     (optional — a fresh independent reviewer session is the fallback)."
echo "  3. Create implementation_plans/<plan>/TASK_QUEUE.md"
echo "     (copy examples/implementation_plans/example_plan/ or use the prd-to-task-queue skill)."
echo "  4. Read docs/quickstart.md and start your first slice."
