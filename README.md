# GARCITA STORE Web

Proyecto listo para Railway con Express, MySQL, panel administrativo, productos editables, reportes, clientes, saldo, recargas con comprobante y compras pagadas con saldo.

## Railway

1. Sube este proyecto a GitHub.
2. En Railway crea un proyecto desde ese repositorio.
3. Agrega un servicio MySQL en el mismo proyecto.
4. En el servicio web `GARCITA-STORE`, abre `Variables` y agrega referencias al servicio `MySQL`:
   `MYSQL_URL=${{MySQL.MYSQL_URL}}`,
   `MYSQLHOST=${{MySQL.MYSQLHOST}}`,
   `MYSQLPORT=${{MySQL.MYSQLPORT}}`,
   `MYSQLUSER=${{MySQL.MYSQLUSER}}`,
   `MYSQLPASSWORD=${{MySQL.MYSQLPASSWORD}}`,
   `MYSQLDATABASE=${{MySQL.MYSQLDATABASE}}`.
5. Define:
   `NODE_ENV=production`, `JWT_SECRET`, `ADMIN_USERNAME=Garcita9`, `ADMIN_PASSWORD=GarcitaStore`.
6. Para que los codigos de verificacion, comprobantes y aprobaciones lleguen por correo, usa una de estas dos opciones:
   `RESEND_API_KEY` + `EMAIL_FROM=onboarding@resend.dev`, o Gmail API con `GMAIL_API_CLIENT_ID`, `GMAIL_API_CLIENT_SECRET`, `GMAIL_API_REFRESH_TOKEN` y `GMAIL_API_USER`.

El comando `npm start` levanta Express inmediatamente para que `/health` responda 200 en Railway. Despues intenta conectar MySQL en segundo plano, crea/actualiza tablas y sincroniza el admin inicial cuando las variables MySQL ya esten disponibles.

El panel admin solo permite entrar cuando MySQL esta conectado de verdad, para que pueda guardar productos, ventas y reportes.

Las recargas por transferencia, OXXO y Binance se guardan como pendientes hasta que admin revise el comprobante y las apruebe. Esa es la forma segura porque esos metodos no avisan automaticamente a la pagina sin una API/webhook externo. Remitly abre WhatsApp directo para trato manual.

El correo no usa conexiones de correo tradicionales. Usa APIs HTTPS: Resend o Gmail API. Si configuras Gmail API, el sistema puede enviar desde tu cuenta de Gmail sin depender de puertos bloqueados en Railway.

El comando `npm run verify` revisa estructura, scripts, assets, `railway.json`, variables MySQL simuladas de Railway y el arranque sin base de datos.

Mas detalle en `PASOS-RAILWAY.md`.
