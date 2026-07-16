# GARCITA STORE Web

Proyecto listo para Railway con Express, MySQL, panel administrativo, productos editables, reportes y compras por WhatsApp.

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

El comando `npm start` levanta Express inmediatamente para que `/health` responda 200 en Railway. Despues intenta conectar MySQL en segundo plano, crea/actualiza tablas y sincroniza el admin inicial cuando las variables MySQL ya esten disponibles.

El panel admin solo permite entrar cuando MySQL esta conectado de verdad, para que pueda guardar productos, ventas y reportes.

El comando `npm run verify` revisa estructura, scripts, assets, `railway.json`, variables MySQL simuladas de Railway y el arranque sin base de datos.

Mas detalle en `PASOS-RAILWAY.md`.
