#!/usr/bin/env bash
# WorkUco · trae la última versión de GitHub y reinicia, con copia de seguridad antes.
# Se instala como /usr/local/bin/workuco-actualizar. Uso:  sudo workuco-actualizar
set -euo pipefail
APP_DIR=/opt/workuco
G() { sudo -u workuco git -C "$APP_DIR" "$@"; }  # git como el dueño de la carpeta
BRANCH="${BRANCH:-$(G rev-parse --abbrev-ref HEAD)}"
[ "$(id -u)" -eq 0 ] || { echo "Corrélo con sudo"; exit 1; }

echo "==> Copia de seguridad antes de actualizar"
/usr/local/bin/workuco-backup
echo "==> Bajando la última versión ($BRANCH)"
before="$(G rev-parse --short HEAD)"
G pull --ff-only origin "$BRANCH"
after="$(G rev-parse --short HEAD)"
install -m 755 "$APP_DIR/deploy/backup.sh" /usr/local/bin/workuco-backup
install -m 755 "$APP_DIR/deploy/actualizar.sh" /usr/local/bin/workuco-actualizar
install -m 755 "$APP_DIR/deploy/remoto.sh" /usr/local/bin/workuco-remoto
# herramienta para las miniaturas WebP de las listas (si falta, la página anda igual, sin miniaturas)
if ! command -v cwebp >/dev/null 2>&1; then
  echo "==> Instalando la herramienta de miniaturas (webp)"
  apt-get install -y webp >/dev/null 2>&1 || echo "    (no se pudo instalar webp: las listas siguen sin miniaturas)"
fi
echo "==> Reiniciando ($before -> $after)"
systemctl restart workuco
sleep 2
if curl -fsS http://127.0.0.1:4250/api/meta >/dev/null; then echo "Listo: WorkUco actualizado y andando."; else
  echo "WorkUco no responde. Para volver a la versión anterior:"
  echo "  sudo -u workuco git -C $APP_DIR checkout $before && sudo systemctl restart workuco"
  journalctl -u workuco -n 30 --no-pager
fi
