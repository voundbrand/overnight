#!/usr/bin/env bash
# agent-signals.sh — the one per-turn probe an autonomous thread runs to gather
# BOTH feedback signals the loop is driven by, in one place:
#   1. Code review        (CodeRabbit when requested, or an internal reviewer)
#   2. GitHub Actions     (required-checks signal) — gh pr checks
#
# Runtime-agnostic: Codex /goal and a Claude /loop both call this, surface its
# output, and decide whether the exit condition holds. It does NOT auto-classify
# findings — per AGENTS.md the agent classifies each finding (actionable | invalid
# | duplicate | blocked | out-of-scope) and fixes only the valid actionable ones.
#
# Review source (SIGNALS_REVIEW_SOURCE):
#   auto (default) — PR open + CodeRabbit-ready marker present: read the
#                    CodeRabbit App's review threads via gh. PR open without the
#                    marker: do not spend/re-trigger CodeRabbit; rely on internal
#                    review + CI. No PR: skip CodeRabbit unless
#                    SIGNALS_PRE_PR_CLI=1.
#   app  — always read the App's PR review threads via gh (credit-free; line-by-line
#          on Pro; on the Free plan this is summary-only / 0 threads).
#   cli  — always run `coderabbit review --agent` (local; spends a CLI credit/turn).
#   SIGNALS_SKIP_REVIEW=1 — skip the review signal entirely (CI only).
#
# Cost controls:
#   SIGNALS_CODERABBIT_LABEL=coderabbit-ready  # default; empty disables label gating
#   SIGNALS_CODERABBIT_KEYWORD=coderabbit:review
#   SIGNALS_PRE_PR_CLI=1                       # opt into pre-PR CLI spend
#   SIGNALS_INTERNAL_REVIEW_COMMAND='<cmd>'    # exit 0 = clean, non-zero = findings
#   SIGNALS_IGNORE_CHECKS_REGEX='^CodeRabbit$' # extra ignored check names
#
# Usage:  scripts/agent-signals.sh [base-branch]     # default base: origin/main
set -uo pipefail

BASE="${1:-origin/main}"
branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
SRC="${SIGNALS_REVIEW_SOURCE:-auto}"
[ "${SIGNALS_SKIP_REVIEW:-0}" = "1" ] && SRC="skip"
pr="$(gh pr view --json number --jq .number 2>/dev/null || true)"
cr_verdict="?"
internal_verdict="not-run"
review_verdict="?"
CODE_REVIEW_LABEL="${SIGNALS_CODERABBIT_LABEL:-coderabbit-ready}"
CODE_REVIEW_KEYWORD="${SIGNALS_CODERABBIT_KEYWORD:-coderabbit:review}"
PRE_PR_CLI="${SIGNALS_PRE_PR_CLI:-0}"
INTERNAL_REVIEW_COMMAND="${SIGNALS_INTERNAL_REVIEW_COMMAND:-}"
IGNORE_CHECKS_REGEX="${SIGNALS_IGNORE_CHECKS_REGEX:-}"
AUTO_IGNORE_CHECKS_REGEX=""

# Portable temp file: prefer mktemp; in stripped environments that lack it, fall
# back to a unique path under $TMPDIR / /tmp / . — so stderr capture (and thus the
# error-not-clean and error-not-pass guards) keep working. If even that fails the
# caller gets an empty path and the probe fails CLOSED to error, never clean/pass.
_tmpfile() {
  local d f i n
  if command -v mktemp >/dev/null 2>&1; then
    f="$(mktemp 2>/dev/null || true)"
    if [ -n "$f" ] && : >"$f" 2>/dev/null; then
      printf '%s\n' "$f"
      return 0
    fi
  fi
  for d in "${TMPDIR:-/tmp}" /tmp .; do
    [ -d "$d" ] && [ -w "$d" ] || continue
    for i in 1 2 3 4 5; do
      n="$d/.agent-signals.$$.${RANDOM:-0}.$i.tmp"
      [ -e "$n" ] && continue
      ( set -C; : >"$n" ) 2>/dev/null && { printf '%s\n' "$n"; return 0; }
    done
  done
  return 1
}

_print_file_head() {
  [ -n "${1:-}" ] && [ -f "$1" ] || return 0
  sed 's/^/    /' "$1" | head -5
}

_cleanup_file() {
  [ -n "${1:-}" ] && rm -f "$1"
}

_stderr_is_no_checks() {
  local f="$1"
  [ -n "$f" ] && [ -s "$f" ] || return 1
  if grep -qiE '(^|[^[:alpha:]])(error|failed|failure|fatal|network|timeout|timed out|auth|credential|forbidden|rate.?limit|HTTP|GraphQL|API|bad gateway|[45][0-9][0-9])([^[:alpha:]]|$)' "$f"; then
    return 1
  fi
  grep -qiE '^[[:space:]]*(no checks reported|no commit statuses)([[:space:].!].*)?$' "$f"
}

run_cli_review() {
  local outf errf rc
  outf="$(_tmpfile || true)"
  errf="$(_tmpfile || true)"
  if [ -z "$outf" ] || [ -z "$errf" ]; then
    echo "ERROR: could not create temp files for CodeRabbit CLI output — review did NOT run; NOT clean. Re-probe."
    _cleanup_file "$outf"
    _cleanup_file "$errf"
    cr_verdict="error (tempfile)"
    return
  fi
  coderabbit review --agent --base "$BASE" >"$outf" 2>"$errf"
  rc=$?
  [ -s "$outf" ] && cat "$outf"
  if [ "$rc" -ne 0 ]; then
    echo "ERROR: CodeRabbit CLI FAILED (exit $rc) — review did NOT run; NOT clean. Re-probe."
    _print_file_head "$errf"
    cr_verdict="error (auth/credits/file-limit)"
  elif [ -s "$errf" ]; then
    echo "ERROR: CodeRabbit CLI wrote to stderr despite exit 0 — review result is not trustworthy; NOT clean. Re-probe."
    _print_file_head "$errf"
    cr_verdict="error (stderr)"
  elif [ ! -s "$outf" ]; then
    echo "ERROR: CodeRabbit CLI produced no output despite exit 0 — review result is not trustworthy; NOT clean. Re-probe."
    cr_verdict="error (empty)"
  else
    cr_verdict="ran (classify findings above)"
  fi
  _cleanup_file "$outf"
  _cleanup_file "$errf"
}

pr_has_coderabbit_marker() {
  local labels body title
  [ -n "${pr:-}" ] || return 1
  labels="$(gh pr view "$pr" --json labels --jq '.labels[].name' 2>/dev/null || true)"
  body="$(gh pr view "$pr" --json body --jq '.body // ""' 2>/dev/null || true)"
  title="$(gh pr view "$pr" --json title --jq '.title // ""' 2>/dev/null || true)"

  if [ -n "$CODE_REVIEW_LABEL" ] && printf '%s\n' "$labels" | grep -Fxq "$CODE_REVIEW_LABEL"; then
    return 0
  fi
  if [ -n "$CODE_REVIEW_KEYWORD" ] && printf '%s\n%s\n' "$body" "$title" | grep -Fq "$CODE_REVIEW_KEYWORD"; then
    return 0
  fi
  return 1
}

run_internal_review() {
  local outf errf rc
  if [ -z "$INTERNAL_REVIEW_COMMAND" ]; then
    echo "(no SIGNALS_INTERNAL_REVIEW_COMMAND configured)"
    internal_verdict="not-run"
    return
  fi
  outf="$(_tmpfile || true)"
  errf="$(_tmpfile || true)"
  if [ -z "$outf" ] || [ -z "$errf" ]; then
    echo "ERROR: could not create temp files for internal review output."
    _cleanup_file "$outf"
    _cleanup_file "$errf"
    internal_verdict="error (tempfile)"
    return
  fi
  bash -lc "$INTERNAL_REVIEW_COMMAND" >"$outf" 2>"$errf"
  rc=$?
  [ -s "$outf" ] && cat "$outf"
  [ -s "$errf" ] && _print_file_head "$errf"
  if [ "$rc" -eq 0 ]; then
    internal_verdict="clean"
  else
    internal_verdict="findings"
  fi
  _cleanup_file "$outf"
  _cleanup_file "$errf"
}

derive_review_verdict() {
  case "$cr_verdict" in
    clean) review_verdict="clean"; return ;;
    findings*) review_verdict="$cr_verdict"; return ;;
    in-progress) review_verdict="pending"; return ;;
    error*) review_verdict="$cr_verdict"; return ;;
  esac
  case "$internal_verdict" in
    clean) review_verdict="clean" ;;
    findings*) review_verdict="$internal_verdict" ;;
    error*) review_verdict="$internal_verdict" ;;
    *) review_verdict="missing" ;;
  esac
}

append_ignore_regex() {
  local extra="$1"
  if [ -z "$IGNORE_CHECKS_REGEX" ]; then
    IGNORE_CHECKS_REGEX="$extra"
  else
    IGNORE_CHECKS_REGEX="($IGNORE_CHECKS_REGEX)|($extra)"
  fi
}

echo "============================================================"
echo " AGENT SIGNALS — branch=$branch  base=$BASE  pr=${pr:-none}"
echo "============================================================"

# Read CodeRabbit App feedback from the PR thread (credit-free) ------------------
read_app_review() {
  local owner repo inprog lines count rc errf
  errf="$(_tmpfile || true)"
  if [ -z "$errf" ]; then
    echo "ERROR: could not create temp file for CodeRabbit PR-thread lookup — review did NOT run; NOT clean. Re-probe."
    cr_verdict="error"; return
  fi
  inprog="$(gh pr view "$pr" --json comments,reviews --jq '
    [ (.comments[]?, .reviews[]?) | select(.author.login | test("coderabbit"; "i")) | .body // "" ]
    | map(select(test("Come back again in a few minutes|currently reviewing|review in progress"; "i")))
    | length' 2>"$errf")"
  rc=$?
  if [ "$rc" -ne 0 ] || ! printf '%s' "$inprog" | grep -qE '^[0-9]+$'; then
    echo "ERROR: could not read CodeRabbit PR review status (gh pr view exit $rc) — review did NOT run; NOT clean. Re-probe."
    _print_file_head "$errf"
    _cleanup_file "$errf"
    cr_verdict="error"; return
  fi
  _cleanup_file "$errf"
  if [ "${inprog:-0}" -gt 0 ]; then
    echo "CodeRabbit review IN PROGRESS on PR #$pr — re-probe in a few minutes."
    cr_verdict="in-progress"; return
  fi
  owner="$(gh repo view --json owner --jq .owner.login 2>/dev/null || true)"
  repo="$(gh repo view --json name --jq .name 2>/dev/null || true)"
  if [ -z "$owner" ] || [ -z "$repo" ]; then
    echo "ERROR: could not resolve owner/repo via gh (auth/network?) — review did NOT run; NOT clean. Re-probe."
    cr_verdict="error"; return
  fi
  # Capture the API exit code + stderr so a FAILED fetch (network/rate-limit/auth)
  # is never mistaken for 'no findings': errors go to stderr and leave stdout empty,
  # and an empty result AFTER a failed call is NOT 'clean'.
  errf="$(_tmpfile || true)"
  if [ -z "$errf" ]; then
    echo "ERROR: could not create temp file for CodeRabbit review fetch — review did NOT run; NOT clean. Re-probe."
    cr_verdict="error"; return
  fi
  lines="$(gh api graphql -F owner="$owner" -F repo="$repo" -F pr="$pr" -f query='
    query($owner:String!,$repo:String!,$pr:Int!){repository(owner:$owner,name:$repo){
      pullRequest(number:$pr){reviewThreads(first:100){nodes{
        isResolved isOutdated comments(first:1){nodes{body path line author{login}}}}}}}}' \
    --jq 'if (((.errors // []) | length) > 0) then
            "ERROR_GRAPHQL " + ((.errors // []) | map(.message // tostring) | join("; "))
          elif (.data.repository.pullRequest.reviewThreads.nodes == null) then
            "ERROR_GRAPHQL missing reviewThreads in GraphQL response"
          else
            .data.repository.pullRequest.reviewThreads.nodes[]
          | select(.isResolved==false and .isOutdated==false)
          | (.comments.nodes[0] // empty)
          | select((.author.login // "") | test("coderabbit"; "i"))
          | "  - \(.path):\(.line // "?")  \((.body | split("\n"))[0])"
          end' 2>"$errf")"
  rc=$?
  if [ "$rc" -ne 0 ]; then
    echo "ERROR: CodeRabbit review fetch FAILED (gh api exit $rc) — review did NOT run; NOT clean. Re-probe."
    _print_file_head "$errf"
    _cleanup_file "$errf"
    cr_verdict="error"; return
  fi
  if printf '%s\n' "$lines" | grep -q '^ERROR_GRAPHQL '; then
    echo "ERROR: CodeRabbit review fetch returned GraphQL errors — review did NOT run; NOT clean. Re-probe."
    printf '%s\n' "$lines" | grep '^ERROR_GRAPHQL ' | sed 's/^ERROR_GRAPHQL /    /' | head -5
    _print_file_head "$errf"
    _cleanup_file "$errf"
    cr_verdict="error"; return
  fi
  if [ -s "$errf" ] && [ -z "$lines" ]; then
    echo "ERROR: CodeRabbit review fetch wrote stderr with no review output — review result is not trustworthy; NOT clean. Re-probe."
    _print_file_head "$errf"
    _cleanup_file "$errf"
    cr_verdict="error"; return
  fi
  _cleanup_file "$errf"
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
  skip) echo "(skipped)"; cr_verdict="skipped"; AUTO_IGNORE_CHECKS_REGEX='^CodeRabbit$' ;;
  app)
    if [ -z "${pr:-}" ]; then echo "app mode needs an open PR — none for '$branch'."; cr_verdict="no-pr"
    else read_app_review; fi ;;
  cli)
    if ! command -v coderabbit >/dev/null 2>&1; then echo "coderabbit CLI not found (see AGENTS.md)."; cr_verdict="unavailable"
    else run_cli_review; fi ;;
  auto|*)
    if [ -n "${pr:-}" ]; then
      if pr_has_coderabbit_marker; then
        read_app_review
      else
        echo "CodeRabbit not requested for PR #$pr."
        echo "Add label '$CODE_REVIEW_LABEL' or include '$CODE_REVIEW_KEYWORD' in the PR title/body to request it."
        cr_verdict="not-requested"
        AUTO_IGNORE_CHECKS_REGEX='^CodeRabbit$'
      fi
    elif [ "$PRE_PR_CLI" = "1" ] && command -v coderabbit >/dev/null 2>&1; then
      run_cli_review
    else
      echo "no PR, or pre-PR CodeRabbit CLI disabled (set SIGNALS_PRE_PR_CLI=1 to spend a CLI review)."
      cr_verdict="not-requested"
      AUTO_IGNORE_CHECKS_REGEX='^CodeRabbit$'
    fi ;;
esac

echo
echo "## 2. Internal review fallback"
case "$cr_verdict" in
  clean|findings*|in-progress|error*) echo "(not run; CodeRabbit supplied the active review signal)" ;;
  *) run_internal_review ;;
esac
derive_review_verdict

# ---- Signal 3: GitHub Actions checks ------------------------------------------
echo
echo "## 3. GitHub Actions checks (required-checks signal)"
ci="none"
if [ -n "$AUTO_IGNORE_CHECKS_REGEX" ]; then
  append_ignore_regex "$AUTO_IGNORE_CHECKS_REGEX"
fi
if [ -n "${pr:-}" ]; then
  echo "PR #$pr"
  gh pr checks "$pr" 2>/dev/null || true   # human-readable table (display only)
  # Single status query. A successful query prints check rows to stdout EVEN when
  # checks fail/pend (gh exits 8 — not an error). A
  # real failure (network/auth) writes to stderr and leaves stdout empty, so an
  # empty/non-numeric result is NOT 'pass' and NOT 'no-checks' -> ci=error.
  cerr="$(_tmpfile || true)"
  if [ -z "$cerr" ]; then
    echo "ERROR: could not create temp file for CI checks — NOT pass. Re-probe."
    ci="error"
  else
    checks="$(gh pr checks "$pr" --json name,bucket --jq '.[] | [.name, .bucket] | @tsv' 2>"$cerr")"
    rc=$?
    if { [ "$rc" -eq 0 ] || [ "$rc" -eq 8 ]; } && { [ -n "$checks" ] || _stderr_is_no_checks "$cerr"; }; then
      total=0; fails=0; pend=0; ignored=0
      while IFS=$'\t' read -r name bucket; do
        [ -n "${name:-}" ] || continue
        if [ -n "$IGNORE_CHECKS_REGEX" ] && printf '%s\n' "$name" | grep -Eq "$IGNORE_CHECKS_REGEX"; then
          ignored=$((ignored + 1))
          continue
        fi
        total=$((total + 1))
        [ "$bucket" = "fail" ] && fails=$((fails + 1))
        [ "$bucket" = "pending" ] && pend=$((pend + 1))
      done <<EOF_CHECKS
$checks
EOF_CHECKS
      [ "$ignored" -gt 0 ] && echo "(ignored $ignored check(s) matching: $IGNORE_CHECKS_REGEX)"
      if   [ "$total" = "0" ]; then ci="no-checks"
      elif [ "$fails" -gt 0 ]; then ci="fail"
      elif [ "$pend"  -gt 0 ]; then ci="pending"
      else ci="pass"; fi
    elif _stderr_is_no_checks "$cerr"; then
      ci="no-checks"
    else
      ci="error"
      echo "ERROR: could not read CI checks (gh failed) — NOT pass. Re-probe."
      _print_file_head "$cerr"
    fi
    _cleanup_file "$cerr"
  fi
else
  ci="no-pr"
  echo "No open PR for '$branch'. Open a DRAFT PR so CI runs (and the App reviews):"
  echo "  gh pr create --draft --base ${BASE#origin/} --fill"
fi

# ---- Verdict the loop reads ---------------------------------------------------
echo
echo "============================================================"
echo "SIGNALS  ci=$ci  coderabbit=$cr_verdict  internal=$internal_verdict  review=$review_verdict"
echo "EXIT WHEN: review=clean (CodeRabbit or internal reviewer) AND ci=pass -> stop, report ready."
echo "  review=missing -> configure SIGNALS_INTERNAL_REVIEW_COMMAND or request CodeRabbit with the label/keyword."
echo "  coderabbit=error -> a requested CodeRabbit review did NOT run (network/rate-limit/auth); re-probe — NEVER treat as clean."
echo "  coderabbit=in-progress / ci=pending -> wait, re-probe."
echo "  ci=error -> CI status could not be read (network/auth); re-probe — do NOT treat as pass."
echo "  ci=no-pr -> open a draft PR first (command above)."
echo "  Merge stays HUMAN-GATED."
echo "============================================================"

case "$cr_verdict" in
  error*) exit 2 ;;
esac
case "$internal_verdict" in
  error*) exit 2 ;;
esac
[ "$ci" = "error" ] && exit 2
exit 0
