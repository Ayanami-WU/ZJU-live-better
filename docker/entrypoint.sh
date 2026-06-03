#!/bin/sh
set -eu

if [ -n "${LIVE_BETTER_SCRIPT:-}" ] || [ -n "${LIVE_BETTER_ARGS:-}" ]; then
  set -- "${LIVE_BETTER_SCRIPT:-courses.zju/autosign.js}"
  if [ -n "${LIVE_BETTER_ARGS:-}" ]; then
    # Intentionally split simple CLI flags from env files, for example:
    # LIVE_BETTER_ARGS=--accounts-file /data/accounts.json --raderAt AUTO
    set -- "$@" $LIVE_BETTER_ARGS
  fi
elif [ "$#" -eq 0 ]; then
  set -- courses.zju/autosign.js
elif [ "${1#-}" != "$1" ]; then
  set -- courses.zju/autosign.js "$@"
fi

exec node "$@"
