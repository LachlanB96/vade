#!/usr/bin/env bash
# Tests for leak-check.sh, and for the hooks in .githooks that run it after the machine's own
# hooks (machine-hook.sh). Each case runs in a throwaway git repo with a made-up blocklist, a
# stand-in gitleaks and made-up global and system git configs, so it tests the logic and never
# reads the real lists or runs the machine's real hooks.
#
#   bash scripts/test-leak-check.sh

set -u

here="$(cd "$(dirname "$0")" && pwd)"
check="$here/leak-check.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
passed=0
failed=0
out=""
code=0

# A stand-in gitleaks that passes, unless a case swaps it for one that fails.
mkdir -p "$tmp/bin" "$tmp/nohooks"
stub() { printf '#!/usr/bin/env bash\nexit %s\n' "$1" >"$tmp/bin/gitleaks"; chmod +x "$tmp/bin/gitleaks"; }
stub 0
export PATH="$tmp/bin:$PATH"

# Empty global and system configs, so nothing from the machine's own git config reaches a case.
export GIT_CONFIG_GLOBAL="$tmp/global.gitconfig" GIT_CONFIG_SYSTEM="$tmp/system.gitconfig"
: >"$GIT_CONFIG_GLOBAL"
: >"$GIT_CONFIG_SYSTEM"

# Made-up personal strings, with the padding, comment, blank line and CR a hand-edited list can have.
export VADE_BLOCKLIST_FILE="$tmp/blocklist.txt"
export VADE_ALLOWED_IDENTITIES_FILE="$tmp/allowed.txt"
printf '# made-up personal strings\n  Zanzibar Quill \nquill@example.org\r\n\n' >"$VADE_BLOCKLIST_FILE"
: >"$VADE_ALLOWED_IDENTITIES_FILE"

# A public identity for every commit, unless a case says otherwise.
export GIT_AUTHOR_NAME="octo" GIT_AUTHOR_EMAIL="1+octo@users.noreply.github.com"
export GIT_COMMITTER_NAME="octo" GIT_COMMITTER_EMAIL="1+octo@users.noreply.github.com"

# A fresh repo, with no hooks of its own or from the global config. It runs in $(...), so its folder
# comes from mktemp rather than a counter.
repo() {
  local d
  d="$(mktemp -d "$tmp/repo.XXXXXX")"
  git init -q "$d"
  git -C "$d" config core.hooksPath "$tmp/nohooks"
  git -C "$d" config core.autocrlf false
  echo "$d"
}

# run <dir> <args...>: runs the check there, keeping its exit code and everything it printed.
run() {
  local d="$1"
  shift
  code=0
  out="$(cd "$d" && bash "$check" "$@" 2>&1)" || code=$?
}

fail() {
  failed=$((failed + 1))
  echo "FAIL $1"
  printf '%s\n' "$out" | sed 's/^/     /'
}

# expect <name> <exit code> [regex the output must match]. The matched text must never be printed.
expect() {
  local name="$1" want="$2" re="${3:-}"
  if [ "$code" != "$want" ]; then fail "$name: exit $code, expected $want"; return; fi
  if [ -n "$re" ] && ! grep -q -E -e "$re" <<<"$out"; then fail "$name: output doesn't match /$re/"; return; fi
  if grep -q -i -e "zanzibar" -e "quill" <<<"$out"; then fail "$name: the output shows the matched text"; return; fi
  passed=$((passed + 1))
  echo "ok   $name"
}

d="$(repo)"

run "$d"
expect "no mode is a usage error" 2 "usage:"
run "$d" --msg
expect "--msg without a file is a usage error" 2 "usage:"
VADE_BLOCKLIST_FILE="$tmp/missing.txt" run "$d" --staged
expect "no blocklist fails closed" 1 "no blocklist entries"

echo "hello garden" >"$d/a.md"
git -C "$d" add a.md
run "$d" --staged
expect "a clean staged file passes" 0

echo "met zanzibar QUILL today" >"$d/notes.md"
git -C "$d" add notes.md
run "$d" --staged
expect "staged contents with a blocklisted string fail, in any case, naming the file" 1 "notes\.md"
git -C "$d" rm -q --cached notes.md
rm "$d/notes.md"

echo "Zanzibar Quill" >>"$d/a.md"
run "$d" --staged
expect "a change that isn't staged isn't checked" 0
echo "hello garden" >"$d/a.md"

mkdir -p "$d/Zanzibar Quill"
echo "x" >"$d/Zanzibar Quill/x.md"
git -C "$d" add "Zanzibar Quill/x.md"
run "$d" --staged
expect "a blocklisted path fails without printing the path" 1 "path contains a blocklisted string"
git -C "$d" rm -q --cached "Zanzibar Quill/x.md"
rm -r "$d/Zanzibar Quill"

mkdir -p "$d/private"
echo '{"type":"add","id":"F1","text":"made up"}' >"$d/private/feedback.jsonl"
git -C "$d" add -f private/feedback.jsonl
run "$d" --staged
expect "a file under private/ fails even when added by force" 1 "under private/"
git -C "$d" rm -q --cached private/feedback.jsonl
rm -r "$d/private"

GIT_AUTHOR_EMAIL="quill@example.org" run "$d" --staged
expect "a personal author fails" 1 "author or committer"
printf 'OCTO <Quill@example.org>\n' >"$VADE_ALLOWED_IDENTITIES_FILE"
GIT_AUTHOR_EMAIL="quill@example.org" run "$d" --staged
expect "an allowed identity passes, matched without case" 0
GIT_AUTHOR_NAME="Zanzibar" GIT_AUTHOR_EMAIL="quill@example.org" run "$d" --staged
expect "the allowed list exempts that exact identity only" 1 "author or committer"
: >"$VADE_ALLOWED_IDENTITIES_FILE"

stub 1
run "$d" --staged
expect "a gitleaks finding fails" 1 "gitleaks found a possible secret"
stub 0

printf 'Add the garden\n' >"$tmp/msg1"
run "$d" --msg "$tmp/msg1"
expect "a clean commit message passes" 0
printf 'Thanks, Zanzibar Quill\n' >"$tmp/msg2"
run "$d" --msg "$tmp/msg2"
expect "a commit message with a blocklisted string fails" 1 "commit message contains"
printf 'Add the garden\n# zanzibar quill in a comment\n# ------------------------ >8 ------------------------\nquill@example.org in the diff\n' >"$tmp/msg3"
run "$d" --msg "$tmp/msg3"
expect "comment lines and the diff below the scissors are ignored" 0

h="$(repo)"
echo "garden" >"$h/a.md"
git -C "$h" add a.md
git -C "$h" commit -q -m "first"
run "$h" --all
expect "a clean history passes" 0 "checked 1 commit"
echo "zanzibar quill" >"$h/b.md"
git -C "$h" add b.md
git -C "$h" commit -q -m "second"
git -C "$h" rm -q b.md
git -C "$h" commit -q -m "third"
run "$h" --all
expect "a blocklisted string anywhere in history fails, even once deleted" 1 "files contain blocklisted strings"

h="$(repo)"
echo "garden" >"$h/a.md"
git -C "$h" add a.md
GIT_AUTHOR_NAME="Zanzibar Quill" git -C "$h" commit -q -m "first"
run "$h" --all
expect "a personal author in history fails" 1 "author or committer name or email is personal"

h="$(repo)"
echo "garden" >"$h/a.md"
git -C "$h" add a.md
git -C "$h" commit -q -m "for Zanzibar Quill"
run "$h" --all
expect "a personal commit message in history fails" 1 "message contains a blocklisted string"

h="$(repo)"
mkdir -p "$h/private"
echo "made up" >"$h/private/feedback.jsonl"
git -C "$h" add -f private/feedback.jsonl
git -C "$h" commit -q -m "first"
run "$h" --all
expect "a file under private/ anywhere in history fails" 1 "files under private/"

# The hooks. A repo with this repo's .githooks and scripts, and a machine hooks folder whose
# stand-in hooks log their name, arguments and stdin, and exit with $MACHINE_EXIT.
mkdir -p "$tmp/machine"
for name in pre-commit commit-msg pre-push; do
  # shellcheck disable=SC2016 # expanded when the stand-in runs
  printf '#!/usr/bin/env bash\necho "%s $*" >>"%s"\n[ %s != pre-push ] || sed "s/^/  stdin: /" >>"%s"\nexit "${MACHINE_EXIT:-0}"\n' \
    "$name" "$tmp/machine.log" "$name" "$tmp/machine.log" >"$tmp/machine/$name"
  chmod +x "$tmp/machine/$name"
done
machine() { git config --file "$GIT_CONFIG_GLOBAL" core.hooksPath "$1"; }
unmachine() { git config --file "$GIT_CONFIG_GLOBAL" --unset core.hooksPath || true; }

hooked() {
  local d
  d="$(repo)"
  cp -R "$here/../.githooks" "$d/.githooks"
  mkdir -p "$d/scripts"
  cp "$check" "$here/machine-hook.sh" "$d/scripts/"
  git -C "$d" config core.hooksPath .githooks
  echo "$d"
}

# gitrun <dir> <git args...>: like run, for a git command whose hooks are under test.
gitrun() {
  local d="$1"
  shift
  code=0
  : >"$tmp/machine.log"
  out="$(git -C "$d" "$@" 2>&1)" || code=$?
}

# logged <regex>: the machine's hooks wrote a line matching it.
logged() { grep -q -E -e "$1" "$tmp/machine.log"; }

k="$(hooked)"
machine "$tmp/machine"

echo "garden" >"$k/a.md"
git -C "$k" add a.md
gitrun "$k" commit -q -m "Add the garden"
expect "a commit runs the machine's pre-commit and commit-msg hooks, then the leak check" 0
logged '^pre-commit $' || fail "the machine's pre-commit hook didn't run"
logged '^commit-msg .*COMMIT_EDITMSG$' || fail "the machine's commit-msg hook didn't get the message file"

echo "zanzibar quill" >"$k/b.md"
git -C "$k" add b.md
gitrun "$k" commit -q -m "Add b"
expect "the leak check still runs after the machine's hooks pass" 1 "staged files contain blocklisted strings"
logged '^pre-commit' || fail "the machine's pre-commit hook didn't run before the leak check"
git -C "$k" rm -q --cached b.md
rm "$k/b.md"

echo "more garden" >>"$k/a.md"
git -C "$k" add a.md
MACHINE_EXIT=1 gitrun "$k" commit -q -m "More garden"
expect "the machine's pre-commit hook refusing blocks the commit" 1 "own pre-commit hook refused"
grep -q "leak-check:" <<<"$out" && fail "the leak check ran after the machine's hook refused"

sed -i 's/exit "${MACHINE_EXIT:-0}"/exit 3/' "$tmp/machine/commit-msg"
gitrun "$k" commit -q -m "More garden"
expect "the machine's commit-msg hook refusing blocks the commit" 1 "own commit-msg hook refused \(exit 3"
sed -i 's/exit 3/exit "${MACHINE_EXIT:-0}"/' "$tmp/machine/commit-msg"

git init -q --bare "$tmp/remote.git"
gitrun "$k" push -q "$tmp/remote.git" HEAD:refs/heads/main
expect "a push runs the machine's pre-push hook with the refs on stdin, then the leak check" 0 "checked 1 commit"
logged '^pre-push .*remote\.git .*remote\.git$' || fail "the machine's pre-push hook didn't get the remote"
logged '^  stdin: HEAD [0-9a-f]+ refs/heads/main 0+$' || fail "the machine's pre-push hook didn't get the refs"

MACHINE_EXIT=1 gitrun "$k" push -q "$tmp/remote.git" HEAD:refs/heads/second
expect "the machine's pre-push hook refusing blocks the push" 1 "own pre-push hook refused"
git -C "$tmp/remote.git" rev-parse -q --verify refs/heads/second >/dev/null && fail "the refused push reached the remote"

unmachine
gitrun "$k" commit -q -m "More garden"
expect "with no machine hooks configured, the leak check runs alone" 0
[ -s "$tmp/machine.log" ] && fail "a machine hook ran with none configured"

git config --file "$GIT_CONFIG_SYSTEM" core.hooksPath "$tmp/machine"
echo "even more" >>"$k/a.md"
git -C "$k" add a.md
gitrun "$k" commit -q -m "Even more"
expect "the system config's hooks folder runs when the global config names none" 0
logged '^pre-commit' || fail "the system config's hooks didn't run"
mkdir -p "$tmp/global-machine"
machine "$tmp/global-machine"
echo "and more" >>"$k/a.md"
git -C "$k" add a.md
gitrun "$k" commit -q -m "And more"
expect "the global config's hooks folder wins over the system one" 0
[ -s "$tmp/machine.log" ] && fail "the system config's hooks ran though the global config names a folder"
git config --file "$GIT_CONFIG_SYSTEM" --unset core.hooksPath

mkdir -p "$tmp/home"
cp -R "$tmp/machine" "$tmp/home/hooks"
machine "~/hooks"
echo "home" >>"$k/a.md"
git -C "$k" add a.md
HOME="$tmp/home" gitrun "$k" commit -q -m "Home"
expect "a hooks folder under ~ is found" 0
logged '^pre-commit' || fail "the hooks folder under ~ wasn't used"

machine "$tmp/no-such-folder"
echo "missing" >>"$k/a.md"
git -C "$k" add a.md
gitrun "$k" commit -q -m "Missing"
expect "a hooks folder that doesn't exist is a pass, named without its path" 0 "doesn't exist"
grep -q "no-such-folder" <<<"$out" && fail "the warning shows the folder's path"

machine "$k/.githooks"
echo "loop" >>"$k/a.md"
git -C "$k" add a.md
code=0
: >"$tmp/machine.log"
out="$(timeout 60 git -C "$k" commit -q -m "Loop" 2>&1)" || code=$?
expect "a machine hooks folder that is this repo's own runs once, with no loop" 0
unmachine

echo
echo "$passed passed, $failed failed"
[ "$failed" = 0 ]
