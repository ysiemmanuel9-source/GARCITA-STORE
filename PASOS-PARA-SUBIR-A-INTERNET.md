# Pasos para subir Gaming Store a internet con MySQL

Esta pagina ya no es solo HTML. Para que cualquier persona entre desde internet y todo se guarde en base de datos, necesitas:

- Backend Node/Express online: Render.
- Base de datos MySQL online: Aiven MySQL free tier.
- Un repo en GitHub con la carpeta `GamingStoreWeb`.

## 1. Crear MySQL online en Aiven

1. Entra a `https://console.aiven.io`.
2. Crea cuenta o inicia sesion.
3. En `Services`, pulsa `Create service`.
4. Elige `MySQL`.
5. Elige `Free tier` si aparece disponible.
6. Crea el servicio y espera a que diga `Running`.
7. Entra al servicio y abre `Quick connect`.
8. Guarda estos datos:
   - Host
   - Port
   - User
   - Password
   - Database, normalmente `defaultdb`

## 2. Subir el proyecto a GitHub

1. Crea un repo nuevo en GitHub.
2. Sube todos los archivos de `GamingStoreWeb`.
3. No subas `.env` ni `node_modules`.

## 3. Crear la web en Render

1. Entra a `https://dashboard.render.com`.
2. Pulsa `New`.
3. Pulsa `Web Service`.
4. Conecta tu repo de GitHub.
5. Configura:
   - Language: `Node`
   - Build Command: `npm install`
   - Start Command: `npm run deploy-start`
6. En Environment Variables agrega:

```text
APP_URL=https://TU-PAGINA.onrender.com
JWT_SECRET=pon_una_clave_larga_privada
DB_HOST=host_de_aiven
DB_PORT=puerto_de_aiven
DB_USER=usuario_de_aiven
DB_PASSWORD=password_de_aiven
DB_NAME=defaultdb
DB_SSL=true
ADMIN_USERNAME=admin
ADMIN_PASSWORD=pon_una_clave_segura
HELPER_USERNAME=ayudante
HELPER_PASSWORD=pon_una_clave_segura
```

No pongas `PORT`; Render lo pone solo.

## 4. Abrir la pagina

Cuando Render termine, te dara un link como:

```text
https://gaming-store.onrender.com
```

Ese es el link que puedes pasar a cualquier persona.

## Importante

Go Live solo sirve para ver HTML local. No usa el servidor Node ni MySQL, por eso no sirve para una tienda real con login, carrito, admin y base de datos.
