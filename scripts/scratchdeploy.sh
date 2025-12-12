#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/test-scratch-data/test-metadata"
ORG_ALIAS="${1:-}"

if command -v sf >/dev/null 2>&1; then
  cmd=(sf project deploy start --source-dir "$SRC")
  [[ -n "$ORG_ALIAS" ]] && cmd+=(-o "$ORG_ALIAS")
else
  cmd=(sfdx force:source:deploy -p "$SRC")
  [[ -n "$ORG_ALIAS" ]] && cmd+=(-u "$ORG_ALIAS")
fi

echo "Deploying from $SRC"
echo "${cmd[*]}"
"${cmd[@]}"