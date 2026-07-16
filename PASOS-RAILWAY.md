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
ADMIN_USERNAME=admin
ADMIN_PASSWORD=pon_tu_clave_segura
```

Si Railway no copia automaticamente las variables del MySQL al servicio web, agregalas como referencias desde el servicio MySQL:

```env
MYSQLHOST=${{MySQL.MYSQLHOST}}
MYSQLPORT=${{MySQL.MYSQLPORT}}
MYSQLUSER=${{MySQL.MYSQLUSER}}
MYSQLPASSWORD=${{MySQL.MYSQLPASSWORD}}
MYSQLDATABASE=${{MySQL.MYSQLDATABASE}}
MYSQL_URL=${{MySQL.MYSQL_URL}}
```

Si tu servicio MySQL se llama distinto, cambia `MySQL` por el nombre real del servicio.

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

## 4. Entrar al panel

Cuando Railway termine el deploy:

- Pagina: `https://tu-app.up.railway.app`
- Panel: `https://tu-app.up.railway.app/admin.html`

Usa el usuario y clave que pusiste en `ADMIN_USERNAME` y `ADMIN_PASSWORD`.
