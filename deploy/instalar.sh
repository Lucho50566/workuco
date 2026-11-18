#!/usr/bin/env bash
# =====================================================================
#  WorkUco · instalación en un servidor Ubuntu 24.04 (DonWeb Cloud Server)
#
#  Se corre UNA vez, como root, en el servidor recién creado:
#     curl -fsSL https://raw.githubusercontent.com/Lucho50566/workuco/main/deploy/instalar.sh -o instalar.sh
#     sudo bash instalar.sh
#
#  Deja andando: Node 24, WorkUco como servicio (se reinicia solo), Caddy con
#  HTTPS automático para workuco.com.ar, firewall, memoria swap, actualizaciones
#  de seguridad automáticas y copia de seguridad diaria de la base y las fotos.
#  Se puede volver a correr sin romper nada: no pisa la configuración ni los datos.
# =====================================================================
set -euo pipefail

DOMAIN="${DOMAIN:-workuco.com.ar}"
REPO="${REPO:-https://github.com/Lucho50566/workuco.git}"
BRANCH="${BRANCH:-main}"
APP_DIR=/opt/workuco
DATA_DIR=/var/lib/workuco
ENV_FILE=/etc/workuco.env
BACKUP_DIR=/var/backups/workuco
PORT=4250

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "Corré el script como root (sudo bash instalar.sh)"; exit 1; }
. /etc/os-release
[ "${ID:-}" = "ubuntu" ] || echo "Aviso: el script está pensado para Ubuntu 24.04 (este es ${PRETTY_NAME:-desconocido})."

say "1/9 Actualizando el sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y openssh-server curl git ufw sqlite3 ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https unattended-upgrades
timedatectl set-timezone America/Argentina/Mendoza || true

say "2/9 Memoria swap de 1 GB (el servidor tiene 1 GB de RAM)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

say "3/9 Node.js 24"
if ! command -v node >/dev/null || ! node -v | grep -q '^v24'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
node -v

say "4/9 Usuario y carpetas"
id workuco >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin workuco
mkdir -p "$DATA_DIR" "$BACKUP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  # la carpeta es del usuario workuco: git se corre como él (si no, git la rechaza)
  sudo -u workuco git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  sudo -u workuco git -C "$APP_DIR" checkout --quiet "$BRANCH"
  sudo -u workuco git -C "$APP_DIR" pull --quiet --ff-only origin "$BRANCH"
else
  git clone --quiet --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
chown -R workuco:workuco "$APP_DIR" "$DATA_DIR"
chmod 750 "$DATA_DIR"

say "5/9 Configuración ($ENV_FILE)"
if [ ! -f "$ENV_FILE" ]; then
  ADMIN_PASS="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)"
  cat > "$ENV_FILE" <<EOF
# Configuración de WorkUco. Después de cambiar algo: systemctl restart workuco
PORT=$PORT
HOST=127.0.0.1
PUBLIC_URL=https://$DOMAIN
WORKUCO_DATA=$DATA_DIR

# Administración (cambiá el mail si querés; la clave se generó sola)
WORKUCO_ADMIN_EMAIL=admin@$DOMAIN
WORKUCO_ADMIN_PASS=$ADMIN_PASS

# WhatsApp de contacto de WorkUco (se muestra en la guía y en los avisos importados)
WORKUCO_CONTACT_WA=

# Mails con Resend (https://resend.com): sin clave, no se mandan
RESEND_API_KEY=
WORKUCO_MAIL_FROM=WorkUco <avisos@$DOMAIN>

# Cobro de destacados con Mercado Pago: Access Token de producción (APP_USR-...).
# Precios y "cobrar sí/no" se manejan desde el panel de admin, pestaña Pagos.
WORKUCO_MP_TOKEN=
# Clave secreta de Webhooks (panel de Mercado Pago → tu aplicación → Webhooks): verifica la firma de cada aviso.
WORKUCO_MP_WEBHOOK_SECRET=

# Datos del responsable (aparecen en el pie, los términos y la privacidad)
WORKUCO_LEGAL_NAME=
WORKUCO_LEGAL_CUIT=
WORKUCO_LEGAL_ADDRESS=
WORKUCO_LEGAL_EMAIL=contacto.workuco@gmail.com
WORKUCO_DB_REGISTRY=
EOF
  chmod 600 "$ENV_FILE"
  NEW_ADMIN=1
fi

say "6/9 Servicio de WorkUco (systemd)"
cat > /etc/systemd/system/workuco.service <<EOF
[Unit]
Description=WorkUco
After=network-online.target
Wants=network-online.target

[Service]
User=workuco
Group=workuco
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now workuco
systemctl restart workuco

say "7/9 Caddy (HTTPS automático)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi
SERVER_IP="$(curl -fsS4 https://api.ipify.org || hostname -I | awk '{print $1}')"
cat > /etc/caddy/Caddyfile <<EOF
# HTTPS automático para el dominio (Caddy saca y renueva el certificado solo)
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:$PORT
}
www.$DOMAIN {
	redir https://$DOMAIN{uri} permanent
}
# Mientras el dominio no apunte al servidor, se puede probar por la IP (sin candado)
http://$SERVER_IP {
	encode gzip
	reverse_proxy 127.0.0.1:$PORT
}
EOF
systemctl enable --now caddy
systemctl reload caddy || systemctl restart caddy

say "8/9 Firewall, actualizaciones de seguridad y copias de seguridad"
ufw allow 22/tcp >/dev/null  # SSH (en la instalación mínima no viene el perfil "OpenSSH")
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true
install -m 755 "$APP_DIR/deploy/backup.sh" /usr/local/bin/workuco-backup
install -m 755 "$APP_DIR/deploy/actualizar.sh" /usr/local/bin/workuco-actualizar
cat > /etc/cron.d/workuco-backup <<EOF
# copia de seguridad diaria a las 4:30 (hora de Mendoza)
30 4 * * * root /usr/local/bin/workuco-backup >> /var/log/workuco-backup.log 2>&1
EOF

say "9/9 Comprobando"
sleep 2
if curl -fsS "http://127.0.0.1:$PORT/api/meta" >/dev/null; then echo "WorkUco responde en el puerto $PORT."; else echo "WorkUco no responde: mirá  journalctl -u workuco -n 50"; fi

echo
echo "====================================================================="
echo " Listo. Probalo ahora en:  http://$SERVER_IP"
echo " Cuando $DOMAIN apunte a esta IP, va a andar con candado en https://$DOMAIN"
if [ "${NEW_ADMIN:-0}" = "1" ]; then
  echo
  echo " Administración:  https://$DOMAIN/admin"
  echo "   Mail:   admin@$DOMAIN"
  echo "   Clave:  $ADMIN_PASS"
  echo "   (anotala en un lugar seguro; también está en $ENV_FILE)"
fi
echo
echo " Configuración:   nano $ENV_FILE   y después   systemctl restart workuco"
echo " Actualizar:      workuco-actualizar"
echo " Copia manual:    workuco-backup   (quedan en $BACKUP_DIR)"
echo " Ver errores:     journalctl -u workuco -n 50"
echo "====================================================================="
