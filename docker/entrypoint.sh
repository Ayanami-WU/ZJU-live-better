#!/bin/sh
set -eu

# Keep env-only deployments working; auto-load a mounted unified config when present.
if [ -z "${LIVE_BETTER_CONFIG_FILE:-}" ] && [ -f /data/config.json ]; then
  export LIVE_BETTER_CONFIG_FILE=/data/config.json
fi

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
