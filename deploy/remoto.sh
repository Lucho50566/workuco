#!/usr/bin/env bash
# WorkUco · lo único que puede hacer la llave de actualización remota (comando forzado de SSH).
# Se instala como /usr/local/bin/workuco-remoto y se ata a la llave en /root/.ssh/authorized_keys:
#   restrict,command="/usr/local/bin/workuco-remoto" ssh-ed25519 AAAA... workuco-deploy-claude
# Con esa llave no se puede abrir una terminal ni correr otra cosa: sólo estos tres pedidos.
set -euo pipefail
case "${SSH_ORIGINAL_COMMAND:-}" in
  actualizar) exec /usr/local/bin/workuco-actualizar ;;
  logs)       exec journalctl -u workuco -n 150 --no-pager ;;
  estado)     systemctl is-active workuco || true
              curl -fsS -o /dev/null -w "api %{http_code}\n" http://127.0.0.1:4250/api/meta || echo "api no responde"
              command -v cwebp >/dev/null 2>&1 && echo "miniaturas: cwebp instalado" || echo "miniaturas: falta cwebp" ;;
  *)          echo "Permitido: actualizar | logs | estado"; exit 1 ;;
esac
