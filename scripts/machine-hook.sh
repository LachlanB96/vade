#!/usr/bin/env bash
# Runs the machine's own git hook of the same name, before this repo's leak check.
#
# Usage (from the hooks in .githooks):
#   machine-hook.sh <hook> [args...]   stdin is passed through, for pre-push
#
# The machine's hooks are the folder core.hooksPath names in the global git config, or else the
# system one, with their includes followed. They're the hooks every repo on the machine runs, like
# a secret scan or a guard on main. This repo sets its own core.hooksPath, and a repo's own setting
# wins, so without this step they would be switched off here without a word.
#
# Nothing to run is a pass: no such setting, no such hook, or a setting that names this repo's own
# hooks folder. A folder that doesn't exist is a pass with a warning, as git itself skips it. The
# machine's hook failing fails this one. Output never shows the folder's path, which can hold a
# username, so it's safe to paste anywhere.

set -eu

hook="${1:-}"
if [ -z "$hook" ]; then
  echo "usage: machine-hook.sh <hook> [args...]" >&2
  exit 2
fi
shift

# Set while a machine hook runs, so a machine hook that comes back to this repo's hooks can't loop.
if [ -n "${VADE_IN_MACHINE_HOOK:-}" ]; then
  exit 0
fi

# --type=path expands a leading ~/ as git does when it reads core.hooksPath itself.
dir="$(git config --global --includes --type=path --get core.hooksPath || true)"
if [ -z "$dir" ]; then
  dir="$(git config --system --includes --type=path --get core.hooksPath || true)"
fi
if [ -z "$dir" ]; then
  exit 0
fi

top="$(git rev-parse --show-toplevel)"
case "$dir" in
  /* | [A-Za-z]:[/\\]*) ;;
  *) dir="$top/$dir" ;; # relative, as git takes it: from the top of the work tree
esac

if [ ! -d "$dir" ]; then
  echo "machine-hook: the hooks folder your git config names doesn't exist, so its $hook hook didn't run." >&2
  exit 0
fi
if [ "$(cd "$dir" && pwd -P)" = "$(cd "$top/.githooks" 2>/dev/null && pwd -P)" ]; then
  exit 0
fi
if [ ! -f "$dir/$hook" ] || [ ! -x "$dir/$hook" ]; then
  exit 0
fi

export VADE_IN_MACHINE_HOOK=1
status=0
"$dir/$hook" "$@" || status=$?
if [ "$status" != 0 ]; then
  echo "machine-hook: the machine's own $hook hook refused (exit $status, its reasons above)." >&2
  exit 1
fi
