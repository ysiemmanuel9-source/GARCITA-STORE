# Subir GARCITA STORE a Railway

## 1. Crear servicios

1. Crea un proyecto en Railway.
2. Agrega un servicio desde este codigo.
3. Agrega un servicio de base de datos MySQL en el mismo proyecto.

Railway MySQL entrega estas variables: `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE` y `MYSQL_URL`.

## 2. Variables del servicio web

En el servicio web configura:

```env
NODE_ENV=production
JWT_SECRET=pon_un_texto_largo_y_secreto
ADMIN_USERNAME=Garcita9
ADMIN_PASSWORD=GarcitaStore
ADMIN_EMAIL=mg4563690@gmail.com
```

IMPORTANTE: que los dos cuadros esten conectados en el canvas no siempre mete las variables dentro del servicio web. En Railway, el servicio web debe tener variables de referencia al servicio MySQL.

En la pestana `Variables` del servicio web `GARCITA-STORE`, pega estas referencias:

```env
MYSQL_URL=${{MySQL.MYSQL_URL}}
MYSQLHOST=${{MySQL.MYSQLHOST}}
MYSQLPORT=${{MySQL.MYSQLPORT}}
MYSQLUSER=${{MySQL.MYSQLUSER}}
MYSQLPASSWORD=${{MySQL.MYSQLPASSWORD}}
MYSQLDATABASE=${{MySQL.MYSQLDATABASE}}
```

Si tu servicio MySQL se llama distinto, cambia `MySQL` por el nombre real del servicio.

Para que lleguen correos reales de verificacion, comprobantes y PIN/KEY, agrega las variables SMTP de tu correo o proveedor:

```env
GMAIL_USER=tu_correo@gmail.com
GMAIL_APP_PASSWORD=tu_clave_de_app_de_16_caracteres
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=tu_correo@gmail.com
SMTP_PASSWORD=tu_clave_de_app_de_16_caracteres
SMTP_FROM=tu_correo@gmail.com
```

IMPORTANTE: `GMAIL_APP_PASSWORD` debe ser una clave de app de Google, no tu contrasena normal. Si no configuras Gmail/SMTP, las compras y recargas no se rompen: el sistema guarda los correos en la tabla `email_outbox`, pero no puede enviarlos automaticamente.

Tambien puedes usar otro proveedor con `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` y `SMTP_FROM`.

Despues de agregar o corregir variables, haz `Deploy` o `Redeploy` del servicio web. Railway aplica las variables a la siguiente ejecucion del servicio.

## 3. Start command

No necesitas escribir SQL manualmente. El proyecto ya trae:

```bash
npm start
```

Ese comando ejecuta:

```bash
node server.js
```

Express inicia primero y responde `/health` con 200 aunque MySQL todavia no este enlazado. Luego el servidor intenta conectar MySQL en segundo plano; cuando la conexion este disponible, crea la base si tiene permiso, crea todas las tablas, agrega el admin inicial y carga los productos de GARCITA STORE.

El archivo `railway.json` fuerza `npm start` y usa `/health` como healthcheck.

## 4. Saldo, recargas y comprobantes

Los clientes crean cuenta, verifican su correo y ven su saldo en la pagina. Las recargas por transferencia STP, OXXO y Binance quedan pendientes hasta que admin revise el comprobante y pulse aprobar. Al aprobar, el saldo se agrega en MySQL con registro de auditoria.

Las compras se descuentan del saldo, generan comprobante y PIN/KEY, y dan 15 MX de bono al cliente. El comprobante se envia al cliente y tambien a `ADMIN_EMAIL`.

## 5. Entrar al panel

Cuando Railway termine el deploy:

- Pagina: `https://tu-app.up.railway.app`
- Panel: `https://tu-app.up.railway.app/admin.html`

Usa el usuario y clave que pusiste en `ADMIN_USERNAME` y `ADMIN_PASSWORD`.

Credenciales por defecto de este ZIP:

- Usuario: `Garcita9`
- Contrasena: `GarcitaStore`

Para confirmar que MySQL llego al servicio web, abre:

```text
https://tu-app.up.railway.app/health
```

Debe salir `database.status` como `ready` o `connecting`, y `mysqlEnvPresent.MYSQL_URL` o `mysqlEnvPresent.MYSQLHOST` en `true`. Si salen en `false`, Railway todavia no esta inyectando las variables al servicio web.
