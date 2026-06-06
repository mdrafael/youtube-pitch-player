#!/usr/bin/env bash
set -euo pipefail
if command -v deno >/dev/null 2>&1; then
  echo "Deno já instalado: $(deno --version)"
  exit 0
fi
curl -fsSL https://deno.land/install.sh | sh -s v2.1.4
echo "Deno instalado em $HOME/.deno/bin/deno"
