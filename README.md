# GARCITA STORE Web

Pagina conectada a MySQL con productos editables, panel administrativo, reportes y compras por WhatsApp.

## Abrir local

Haz doble clic en `INICIAR-SERVIDOR.cmd` y abre:

- Pagina principal: `http://localhost:3001`
- Panel administrativo: `http://localhost:3001/admin.html`

Las funciones de MySQL y el panel no funcionan con Go Live porque necesitan el servidor Node.

## Acceso inicial

- Usuario: el valor de `ADMIN_USERNAME` en `.env`.
- Contrasena: el valor de `ADMIN_PASSWORD` en `.env`.

Si no defines valores, el servidor usa `admin` y `Admin12345` para desarrollo.

## Base de datos

La base sugerida se llama `garcita_store_web`. Puedes cambiarla en `.env`.

Tablas principales:

- `products`: productos, fotos y opciones de compra.
- `users`: acceso del administrador.
- `sales`: solicitudes y estados de ventas.
- `analytics_events`: visitas, compras y clics hacia WhatsApp.
- `settings`: nombre de tienda, grupo y numero de WhatsApp.

## WhatsApp

- Grupo: `https://chat.whatsapp.com/DaEn2118QELDryq0jOH4U3`
- Compra directa: `+52 1 686 338 7186`
