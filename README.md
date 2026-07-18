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
6. Para que los codigos de verificacion, comprobantes y aprobaciones lleguen por correo, configura Gmail OAuth2:
   `GMAIL_USER`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `GOOGLE_REFRESH_TOKEN`.

El comando `npm start` levanta Express inmediatamente para que `/health` responda 200 en Railway. Despues intenta conectar MySQL en segundo plano, crea/actualiza tablas y sincroniza el admin inicial cuando las variables MySQL ya esten disponibles.

El panel admin solo permite entrar cuando MySQL esta conectado de verdad, para que pueda guardar productos, ventas y reportes.

Las recargas por transferencia, OXXO y Binance se guardan como pendientes hasta que admin revise el comprobante y las apruebe. Esa es la forma segura porque esos metodos no avisan automaticamente a la pagina sin una API/webhook externo. Remitly abre WhatsApp directo para trato manual.

El correo usa Nodemailer con Gmail OAuth2. No usa contrasena de aplicacion. El servidor obtiene un `accessToken` automaticamente con `googleapis` y lo entrega al transporte `service: "gmail"` con `auth.type = "OAuth2"`.

El comando `npm run verify` revisa estructura, scripts, assets, `railway.json`, variables MySQL simuladas de Railway y el arranque sin base de datos.

Mas detalle en `PASOS-RAILWAY.md`.
