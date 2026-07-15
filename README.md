# GARCITA STORE Web

Proyecto listo para Railway con Express, MySQL, panel administrativo, productos editables, reportes y compras por WhatsApp.

## Railway

1. Sube este proyecto a GitHub.
2. En Railway crea un proyecto desde ese repositorio.
3. Agrega un servicio MySQL en el mismo proyecto.
4. En el servicio web, enlaza o copia las variables del servicio MySQL:
   `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE`, `MYSQL_URL`.
5. Define:
   `NODE_ENV=production`, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.

El comando `npm start` crea/actualiza base de datos, crea tablas, sincroniza admin inicial y levanta la pagina.

El comando `npm run verify` revisa estructura, scripts, assets, `railway.json` y variables MySQL simuladas de Railway.

Mas detalle en `PASOS-RAILWAY.md`.
