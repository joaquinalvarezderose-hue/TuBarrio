# Configuración de Supabase para Password Reset

## URLs de Redirección Requeridas

Después de los cambios en el código, debes actualizar la configuración de Supabase Dashboard:

### En el Dashboard de Supabase:
1. Ve a **Authentication** (en el menú izquierdo)
2. Haz click en **URL Configuration**
3. En la sección **Site URL**, asegúrate que sea:
   - `https://tubarrio.vercel.app` (o tu dominio de producción)

4. En la sección **Redirect URLs** (Allowed), asegúrate que contenga:
   - `https://tubarrio.vercel.app` (producción)
   - `http://localhost:5173` (desarrollo local)
   - `https://tubarrio.vercel.app/` (con trailing slash, si aplica)

5. **Elimina** cualquier URL antigua como:
   - `https://tubarrio.vercel.app/#/reset-password` (ya no se necesita)

### Por qué estos cambios:

- **Antes**: El `redirectTo` incluía `#/reset-password`, lo que entraba en conflicto con el token que Supabase agregaba (`#access_token=...&type=recovery`)
- **Ahora**: El `redirectTo` es solo `window.location.origin`, y la app maneja el routing a `/reset-password` automáticamente detectando `type=recovery` en el hash

## Verificación

Una vez actualizado en Supabase:

1. Ir a `http://localhost:5173/#/login`
2. Click en "¿Olvidaste tu contraseña?"
3. Ingresar email y enviar
4. Abrir el link del email
5. Verificar que llega directamente a `http://localhost:5173/#/reset-password`
6. Completar el formulario y cambiar contraseña

## Archivos Modificados en este PR

- `screens/Login.tsx` - simplificado el redirectTo
- `App.tsx` - agregada lógica para detectar `type=recovery` y navegar a `/reset-password`
- `screens/ResetPassword.tsx` - mejorada robustez con fallback de sesión + toggle de visibility
