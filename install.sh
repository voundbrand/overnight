#!/usr/bin/env bash
# install.sh — drop the Overnight autonomous-coding system into a target repo.
#
# Usage:
#   ./install.sh /path/to/your-repo            # non-destructive: never overwrites existing files
#   ./install.sh /path/to/your-repo --force    # overwrite existing files with the packaged versions
#   ./install.sh /path/to/your-repo --without-quality-lenses
#                                                # skip quality companion skills
#   ./install.sh --help
#
# What it copies:
#   .claude/skills/*            the portable skills (setup, engine, plan builder,
#                               quality lenses unless --without-quality-lenses)
#   scripts/agent-signals.sh    the per-turn review + CI signals probe
#   scripts/implementation-plan-orchestrator-preflight.mjs
#                               cheap local no-op gate before waking an orchestrator
#   docs/*                      how-it-works / quickstart / configuration / autonomy-engine / faq
#                               + quality-lenses / code-review-guidelines / parallel-repo-write-protocol
#   agents/*                    AGENTS.md / CLAUDE.md snippets to paste into the target repo
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
INSTALL_QUALITY_LENSES=1
for arg in "$@"; do
  case "$arg" in
    --help|-h) usage 0 ;;
    --force)   FORCE=1 ;;
    --without-quality-lenses) INSTALL_QUALITY_LENSES=0 ;;
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

is_quality_skill_rel() {
  case "$1" in
    architecture-review/*|code-structure/*|diagnose/*|engineering-quality-lens/*|tdd/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

copy_skills_tree() {
  local srcdir="$1" dstdir="$2" rel
  [ -d "$srcdir" ] || return 0
  while IFS= read -r -d '' f; do
    rel="${f#$srcdir/}"
    if [ "$INSTALL_QUALITY_LENSES" -ne 1 ] && is_quality_skill_rel "$rel"; then
      echo "  skip (quality opt-out): ${dstdir#$TARGET/}/$rel"; skipped=$((skipped+1)); continue
    fi
    copy_file "$f" "$dstdir/$rel"
  done < <(find "$srcdir" -type f -print0)
}

echo "Installing Overnight into: $TARGET"
echo

echo "• skills (.claude/skills/)"
copy_skills_tree "$SELF_DIR/.claude/skills" "$TARGET/.claude/skills"

echo "• orchestration scripts (scripts/)"
copy_file "$SELF_DIR/scripts/agent-signals.sh" "$TARGET/scripts/agent-signals.sh"
chmod +x "$TARGET/scripts/agent-signals.sh" 2>/dev/null || true
copy_file "$SELF_DIR/scripts/implementation-plan-orchestrator-preflight.mjs" "$TARGET/scripts/implementation-plan-orchestrator-preflight.mjs"
chmod +x "$TARGET/scripts/implementation-plan-orchestrator-preflight.mjs" 2>/dev/null || true

echo "• docs (docs/)"
copy_tree "$SELF_DIR/docs" "$TARGET/docs"

echo "• agent instructions (agents/)"
copy_tree "$SELF_DIR/agents" "$TARGET/agents"

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
echo "  2. Wire a reviewer: use a fresh independent reviewer by default; add"
echo "     CodeRabbit only for deliberate ready heads (App label/keyword or 'cr' CLI)."
echo "  3. Create implementation_plans/<plan>/TASK_QUEUE.md"
echo "     (copy examples/implementation_plans/example_plan/ or use the prd-to-task-queue skill)."
echo "  4. Add an npm script such as:"
echo "     \"plan:orchestrator:preflight\": \"node scripts/implementation-plan-orchestrator-preflight.mjs\""
echo "     If your plans live outside implementation_plans/, pass --plans-root and --plan."
echo "  5. Read docs/quickstart.md and start your first slice."
