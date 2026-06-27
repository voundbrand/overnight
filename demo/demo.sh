#!/usr/bin/env bash
# demo.sh — a self-contained, ~13s narrated walkthrough of the Overnight loop,
# used to render docs/demo.gif via demo.tape (VHS). It is ILLUSTRATIVE: the command
# output is sample data in the *real* format the tools print (see scripts/agent-signals.sh),
# so it shows the actual shape of a run without needing a live PR/CodeRabbit.
#
# Run it yourself:   ./demo.sh            (paced, for the GIF)
#                    DEMO_NOSLEEP=1 ./demo.sh   (instant, for testing)
set -u

# base styles
B=$'\033[1m'; D=$'\033[2m'; R=$'\033[0m'
# themed 16-color (palette comes from demo.tape)
RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; MAG=$'\033[35m'; CYN=$'\033[36m'; WHT=$'\033[37m'
BRED=$'\033[91m'; BGRN=$'\033[92m'; BYEL=$'\033[93m'; BMAG=$'\033[95m'; BCYN=$'\033[96m'
# truecolor accents (vivid on black, theme-independent)
ORG=$'\033[38;2;255;158;77m'    # orange
PRP=$'\033[38;2;189;147;249m'   # purple
PNK=$'\033[38;2;255;121;198m'   # pink
TEAL=$'\033[38;2;46;232;195m'   # teal
GLD=$'\033[38;2;255;203;107m'   # gold

slp() { [ "${DEMO_NOSLEEP:-0}" = "1" ] || sleep "$1"; }
say() { printf '%b\n' "$1"; }
cmd() { printf '%b\n' "${D}\$${R} ${BCYN}$1${R}"; }                 # a typed command
note(){ printf '%b\n' "${PRP}#${R} ${D}$1${R}"; }                  # a step comment
rule(){ printf '%b\n' "${D}────────────────────────────────────────────────────────────${R}"; }

clear 2>/dev/null || true

say "${B}${PRP}  ▍Over${PNK}night${R}  ${B}${WHT}— autonomous, review-driven coding agent${R}"
say "${D}   point it at a task queue; it ships reviewed PRs while you sleep${R}"
echo; slp 1.6

note "1. claim a slice, open a draft PR  (the PR's review IS the work queue)"
cmd "gh pr create --draft --base main --fill"
slp 0.5
say "  ${ORG}→${R} https://github.com/you/app/pull/${GLD}${B}42${R}  ${YEL}(draft)${R}"
echo; slp 1.3

note "2. one probe gathers BOTH feedback signals"
cmd "./scripts/agent-signals.sh"
slp 0.4
rule
say " ${B}${TEAL}AGENT SIGNALS${R}  branch=${BCYN}feat/login${R}  base=${D}origin/main${R}  pr=${GLD}${B}42${R}"
rule
say "${B}${MAG}## 1. CodeRabbit review${R} ${D}(review-comment signal)${R}"
say "${ORG}2 unresolved finding(s) on PR #42:${R}"
say "  ${ORG}-${R} ${CYN}src/auth.ts${R}${D}:88${R}   guard null session before ${TEAL}.userId${R}"
say "  ${ORG}-${R} ${CYN}src/auth.ts${R}${D}:131${R}  add a test for the ${TEAL}expired-token${R} path"
say "${B}${TEAL}## 2. GitHub Actions checks${R} ${D}(required-checks signal)${R}"
say "  ${BGRN}✓${R} ${WHT}build${R}      ${BRED}✗ test${R}  ${D}(1 failing)${R}"
rule
say "SIGNALS  ci=${BRED}fail${R}  coderabbit=${GLD}findings:2${R}  internal=${D}not-run${R}  review=${GLD}findings:2${R}"
echo; slp 1.9

note "3. classify findings, fix only the VALID actionable ones, push a new head"
cmd "git commit -am 'fix(auth): guard null session; cover expired token' && git push"
slp 0.5
say "  ${ORG}→${R} pushed ${BCYN}feat/login${R} ${D}· a new head re-triggers review + CI${R}"
echo; slp 1.4

note "4. re-probe the new head"
cmd "./scripts/agent-signals.sh"
slp 0.4
rule
say " ${B}${TEAL}AGENT SIGNALS${R}  branch=${BCYN}feat/login${R}  base=${D}origin/main${R}  pr=${GLD}${B}42${R}"
rule
say "${B}${MAG}## 1. CodeRabbit review${R}"
say "${BGRN}No unresolved CodeRabbit review threads on PR #42 — clean.${R}"
say "${B}${TEAL}## 2. GitHub Actions checks${R}"
say "  ${BGRN}✓${R} ${WHT}build${R}      ${BGRN}✓ test${R}"
rule
say "SIGNALS  ci=${BGRN}pass${R}  coderabbit=${BGRN}clean${R}  internal=${D}not-run${R}  review=${BGRN}clean${R}"
say "${D}EXIT WHEN: review=clean AND ci=pass → stop, report ready.${R}"
echo; slp 1.9

say "${B}${BGRN}  ✓ reviewer clean · checks green · PR left READY for a human${R}"
say "${B}${ORG}  ▍main is human-gated — the agent never merges it.${R}"
say "${D}   no kanban board · no dispatcher · no polling daemon${R}"
echo; slp 2.2
