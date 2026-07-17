# Gaming Store Web + MySQL

Proyecto con tienda, login, roles y base de datos MySQL.

## Roles

- `admin`: controla todo: productos, ventas, ajustes y usuarios.
- `helper`: puede agregar, editar y borrar productos.
- `client`: compra, crea perfil y sus pedidos se guardan en la BD.

## Abrir local en VS Code

1. Abre la carpeta `GamingStoreWeb` en VS Code.
2. Revisa `.env`; ya viene preparado para `localhost`, puerto `3308` y base `pagina_panel`.
3. Instala dependencias:

```bash
npm install
```

4. Crea las tablas:

```bash
npm run setup-db
```

5. Inicia el servidor:

```bash
npm start
```

6. Abre:

```text
http://localhost:3000
```

## Usuarios iniciales

Se crean desde `.env` cuando inicia el servidor:

- Admin: `admin` / `Admin12345`
- Ayudante: `ayudante` / `Ayudante12345`

Cambia esas claves antes de subirlo a internet.

## Importante para subirlo online

Esta version ya no es solo HTML. Netlify Drop solo sube paginas estaticas; para MySQL necesitas:

- Un backend Node/Express, por ejemplo Render.
- Una base de datos MySQL, por ejemplo Railway MySQL o Aiven MySQL.
- Variables de entorno iguales a `.env.example`.

Render permite desplegar apps Node/Express con comandos como `npm install` y `npm start`.
Railway tiene plantilla MySQL con variables como `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD` y `MYSQLDATABASE`.
Aiven tambien ofrece MySQL administrado con plan gratis.

Lee el paso a paso completo en `PASOS-PARA-SUBIR-A-INTERNET.md`.
