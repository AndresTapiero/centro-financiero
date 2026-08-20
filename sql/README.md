# Esquema y políticas

⚠️ **El esquema de la base no está versionado aquí.** Vive solo en el panel de Supabase.

Esto significa que hoy no hay forma de:
- reconstruir la base desde cero si algo se pierde,
- revisar en un PR un cambio de esquema,
- ni **verificar que RLS esté activo** en las siete tablas `fin_*`.

Ese último punto importa: la clave publicable de Supabase está en el cliente
(`js/auth-arranque.js`), que es lo normal y esperado **siempre que RLS esté activo**.
Sin RLS, cualquiera con esa clave podría leer los datos de cualquier usuario.

## Pendiente (B23)

1. Confirmar en Supabase → Authentication → Policies que las siete tablas tienen
   RLS habilitado y una política por `user_id = auth.uid()`:
   `fin_accounts`, `fin_movimientos`, `fin_pendientes`, `fin_metas`,
   `fin_presupuesto_topes`, `fin_configuracion`, y la de suscripciones si aplica.
2. Exportar el esquema y las políticas a `sql/esquema.sql` y versionarlo:
   ```
   supabase db dump --schema public -f sql/esquema.sql
   ```

## Archivos

- `limpiar-titulos-suscripciones.sql` — script puntual, ya aplicado.
