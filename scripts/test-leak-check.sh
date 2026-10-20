#!/usr/bin/env bash
# Tests for leak-check.sh. Each case runs the script in a throwaway git repo with a made-up
# blocklist and a stand-in gitleaks, so it tests the blocklist logic and never reads the real lists.
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

echo
echo "$passed passed, $failed failed"
[ "$failed" = 0 ]
