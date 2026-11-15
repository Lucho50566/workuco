# Publicar WorkUco en el Cloud Server de DonWeb

Servidor: Ubuntu 24.04 (instalación mínima), 1 vCPU, 1 GB de RAM. IP: `66.97.47.201`.
Dominio: `workuco.com.ar` (registrado en DonWeb, DNS en Cloudflare).

## 1. Entrar al servidor (desde tu Windows)

Abrí **PowerShell** y escribí (la contraseña de root es la que te dio DonWeb; al escribirla no se ve nada, es normal):

```
ssh root@66.97.47.201
```

La primera vez pregunta si confiás en el servidor: escribí `yes`.

## 2. Instalar todo con un comando

Ya adentro del servidor:

```
curl -fsSL https://raw.githubusercontent.com/Lucho50566/workuco/main/deploy/instalar.sh -o instalar.sh && bash instalar.sh
```

Tarda unos minutos. Al final muestra:
- el link para probar por la IP: `http://66.97.47.201`
- **la clave de administración** (anotala; también queda en `/etc/workuco.env`).

Qué deja instalado: Node 24, WorkUco como servicio (se reinicia solo si se cae o si se reinicia el servidor),
Caddy con HTTPS automático, firewall (sólo SSH, 80 y 443), 1 GB de swap, actualizaciones de seguridad automáticas
y una copia de seguridad diaria (4:30) de la base y de las fotos en `/var/backups/workuco` (guarda 14 días).

## 3. Apuntar el dominio (cuando workuco.com.ar esté activo en DonWeb y en Cloudflare)

En Cloudflare → workuco.com.ar → **DNS → Registros → Añadir registro**:

| Tipo | Nombre | Contenido | Proxy |
|---|---|---|---|
| A | `@` | `66.97.47.201` | **Solo DNS** (nube gris) |
| A | `www` | `66.97.47.201` | **Solo DNS** (nube gris) |

En unos minutos `https://workuco.com.ar` anda con candado (Caddy saca el certificado solo).
Más adelante se puede pasar a nube naranja: antes, en Cloudflare **SSL/TLS → Full (strict)**.

## 4. Completar la configuración

```
nano /etc/workuco.env
```

Completá: `WORKUCO_CONTACT_WA` (tu WhatsApp), los datos legales (`WORKUCO_LEGAL_NAME`, `WORKUCO_LEGAL_CUIT`,
`WORKUCO_LEGAL_ADDRESS`, `WORKUCO_DB_REGISTRY` cuando inscribas la base en la AAIP) y, cuando tengas Resend con el
dominio verificado, `RESEND_API_KEY`. Guardá con Ctrl+O, Enter, Ctrl+X y reiniciá:

```
systemctl restart workuco
```

## 5. Día a día

| Para | Comando (en el servidor) |
|---|---|
| Traer la última versión (con copia antes) | `workuco-actualizar` |
| Copia de seguridad ahora | `workuco-backup` |
| Ver si anda | `systemctl status workuco` |
| Ver errores | `journalctl -u workuco -n 50` |
| Reiniciar | `systemctl restart workuco` |

**Bajar las copias a tu compu** (desde PowerShell en Windows), por ejemplo una vez por semana:

```
scp -r root@66.97.47.201:/var/backups/workuco C:\Users\%USERNAME%\Desktop\workuco-copias
```

**Avisos si se cae**: en uptimerobot.com (gratis) creá un monitor HTTP a `https://workuco.com.ar/api/meta`.

## 6. Restaurar una copia

```
systemctl stop workuco
gunzip -c /var/backups/workuco/workuco-AAAA-MM-DD_HHMM.sqlite.gz > /var/lib/workuco/workuco.sqlite
rm -f /var/lib/workuco/workuco.sqlite-wal /var/lib/workuco/workuco.sqlite-shm
tar -xzf /var/backups/workuco/uploads-AAAA-MM-DD_HHMM.tar.gz -C /var/lib/workuco
chown -R workuco:workuco /var/lib/workuco
systemctl start workuco
```

## 7. Llevar los datos que ya cargaste en tu compu (opcional)

Si querés que el servidor arranque con los avisos que cargaste localmente (por ejemplo los del canal de
WhatsApp), desde PowerShell en la carpeta del proyecto:

```
scp data\workuco.sqlite root@66.97.47.201:/var/lib/workuco/workuco.sqlite
scp -r data\uploads root@66.97.47.201:/var/lib/workuco/
```

y en el servidor: `chown -R workuco:workuco /var/lib/workuco && systemctl restart workuco`.
(Si en tu compu hay datos de demostración mezclados, mejor empezar con la base vacía y volver a cargar lo real.)
