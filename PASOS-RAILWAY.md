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

## 4. Entrar al panel

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
