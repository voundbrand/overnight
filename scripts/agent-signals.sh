#!/usr/bin/env bash
# agent-signals.sh — the one per-turn probe an autonomous thread runs to gather
# BOTH feedback signals the loop is driven by, in one place:
#   1. CodeRabbit review (the review-comment signal)
#   2. GitHub Actions    (the required-checks signal) — gh pr checks (json bucket)
#
# Runtime-agnostic: Codex /goal and a Claude /loop both call this, surface its
# output, and decide whether the exit condition holds. It does NOT auto-classify
# findings — per AGENTS.md the agent classifies each finding (actionable | invalid
# | duplicate | blocked | out-of-scope) and fixes only the valid actionable ones.
#
# Review source (SIGNALS_REVIEW_SOURCE):
#   auto (default) — PR open: read the CodeRabbit App's review threads via gh
#                    (CREDIT-FREE line-by-line when your repo is on CodeRabbit PRO);
#                    no PR yet: run a local `coderabbit review --agent` (CLI).
#   app  — always read the App's PR review threads via gh (credit-free; line-by-line
#          on Pro; on the Free plan this is summary-only / 0 threads).
#   cli  — always run `coderabbit review --agent` (local; spends a CLI credit/turn).
#   SIGNALS_SKIP_REVIEW=1 — skip the review signal entirely (CI only).
#
# Usage:  scripts/agent-signals.sh [base-branch]     # default base: origin/main
set -uo pipefail

BASE="${1:-origin/main}"
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
SRC="${SIGNALS_REVIEW_SOURCE:-auto}"
[ "${SIGNALS_SKIP_REVIEW:-0}" = "1" ] && SRC="skip"
pr="$(gh pr view --json number --jq .number 2>/dev/null || true)"
cr_verdict="?"

echo "============================================================"
echo " AGENT SIGNALS — branch=$branch  base=$BASE  pr=${pr:-none}"
echo "============================================================"

# Read CodeRabbit App feedback from the PR thread (credit-free) ------------------
read_app_review() {
  local owner repo inprog lines count
  inprog="$(gh pr view "$pr" --json comments,reviews --jq '
    [ (.comments[]?, .reviews[]?) | select(.author.login | test("coderabbit"; "i")) | .body // "" ]
    | map(select(test("Come back again in a few minutes|currently reviewing|review in progress"; "i")))
    | length' 2>/dev/null || echo 0)"
  if [ "${inprog:-0}" -gt 0 ]; then
    echo "CodeRabbit review IN PROGRESS on PR #$pr — re-probe in a few minutes."
    cr_verdict="in-progress"; return
  fi
  owner="$(gh repo view --json owner --jq .owner.login 2>/dev/null)"
  repo="$(gh repo view --json name --jq .name 2>/dev/null)"
  lines="$(gh api graphql -F owner="$owner" -F repo="$repo" -F pr="$pr" -f query='
    query($owner:String!,$repo:String!,$pr:Int!){repository(owner:$owner,name:$repo){
      pullRequest(number:$pr){reviewThreads(first:100){nodes{
        isResolved isOutdated comments(first:1){nodes{body path line author{login}}}}}}}}' \
    --jq '.data.repository.pullRequest.reviewThreads.nodes[]
          | select(.isResolved==false and .isOutdated==false)
          | .comments.nodes[0]
          | select(.author.login | test("coderabbit"; "i"))
          | "  - \(.path):\(.line // "?")  \((.body | split("\n"))[0])"' 2>/dev/null || true)"
  count="$(printf '%s\n' "$lines" | grep -c '^  - ' || true)"
  if [ "${count:-0}" = "0" ]; then
    echo "No unresolved CodeRabbit review threads on PR #$pr — clean (Pro line-by-line)."
    echo "(If the org were on Free this would be summary-only; use SIGNALS_REVIEW_SOURCE=cli there.)"
    cr_verdict="clean"
  else
    echo "$count unresolved CodeRabbit finding(s) on PR #$pr:"
    printf '%s\n' "$lines"
    echo "(read full threads: gh pr view $pr --comments)"
    cr_verdict="findings:$count"
  fi
}

# ---- Signal 1: CodeRabbit review ----------------------------------------------
echo
echo "## 1. CodeRabbit review (review-comment signal) [source: $SRC]"
case "$SRC" in
  skip) echo "(skipped)"; cr_verdict="skipped" ;;
  app)
    if [ -z "${pr:-}" ]; then echo "app mode needs an open PR — none for '$branch'."; cr_verdict="no-pr"
    else read_app_review; fi ;;
  cli)
    if ! command -v coderabbit >/dev/null 2>&1; then echo "coderabbit CLI not found (see AGENTS.md)."; cr_verdict="unavailable"
    elif coderabbit review --agent --base "$BASE"; then cr_verdict="ran (classify findings above)"
    else cr_verdict="error (auth/credits/file-limit)"; fi ;;
  auto|*)
    # Pro: credit-free line-by-line via the App once a PR exists; local CLI before that.
    if [ -n "${pr:-}" ]; then read_app_review
    elif command -v coderabbit >/dev/null 2>&1 && coderabbit review --agent --base "$BASE"; then
      cr_verdict="ran (classify findings above)"
    else echo "no PR + no usable CLI review."; cr_verdict="unavailable"; fi ;;
esac

# ---- Signal 2: GitHub Actions checks ------------------------------------------
echo
echo "## 2. GitHub Actions checks (required-checks signal)"
ci="none"
if [ -n "${pr:-}" ]; then
  echo "PR #$pr"
  gh pr checks "$pr" 2>/dev/null || true
  total="$(gh pr checks "$pr" --json bucket --jq 'length' 2>/dev/null || echo 0)"
  fails="$(gh pr checks "$pr" --json bucket --jq '[.[]|select(.bucket=="fail")]|length' 2>/dev/null || echo 0)"
  pend="$(gh pr checks "$pr" --json bucket --jq '[.[]|select(.bucket=="pending")]|length' 2>/dev/null || echo 0)"
  if   [ "${total:-0}" = "0" ]; then ci="no-checks"
  elif [ "${fails:-0}" -gt 0 ]; then ci="fail"
  elif [ "${pend:-0}" -gt 0 ]; then ci="pending"
  else ci="pass"; fi
else
  ci="no-pr"
  echo "No open PR for '$branch'. Open a DRAFT PR so CI runs (and the App reviews):"
  echo "  gh pr create --draft --base ${BASE#origin/} --fill"
fi

# ---- Verdict the loop reads ---------------------------------------------------
echo
echo "============================================================"
echo "SIGNALS  ci=$ci  coderabbit=$cr_verdict"
echo "EXIT WHEN: coderabbit=clean (no actionable findings) AND ci=pass -> stop, report ready."
echo "  coderabbit=in-progress / ci=pending -> wait, re-probe."
echo "  ci=no-pr -> open a draft PR first (command above)."
echo "  Merge stays HUMAN-GATED."
echo "============================================================"
