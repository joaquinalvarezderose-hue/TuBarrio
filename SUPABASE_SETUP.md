# Configuración de Supabase para Password Reset

## URLs de Redirección Requeridas

La app usa `BrowserRouter` y maneja automáticamente el flujo de recuperación de contraseña. Para que funcione en producción y desarrollo, debes verificar/actualizar la configuración en el Dashboard de Supabase:

### En el Dashboard de Supabase:
1. Ve a **Authentication** (en el menú izquierdo)
2. Haz click en **URL Configuration**
3. En la sección **Site URL**, asegúrate que sea:
   - `https://www.tubarrioapp.com.ar` (producción con www)

4. En la sección **Redirect URLs** (Allowed), asegúrate que contenga **ambos**:
   - `https://www.tubarrioapp.com.ar` (producción)
   - `https://tubarrioapp.com.ar` (producción sin www)
   - `http://localhost:5173` (desarrollo local)

5. **Elimina** cualquier URL antigua como:
   - `https://tubarrio.vercel.app` (ya no se usa)
   - `https://tubarrio.vercel.app/#/reset-password` (ya no se necesita)

### Por qué estos cambios:

- La app cambió a **`BrowserRouter`** (en lugar de `HashRouter`), que interpreta las URLs correctamente sin conflictos de hash.
- El `redirectTo` en Login.tsx es `window.location.origin` (ej: `https://www.tubarrioapp.com.ar`), sin path ni hash.
- Supabase agrega `#access_token=...&type=recovery` a esa URL, y el evento `PASSWORD_RECOVERY` de Supabase dispara automáticamente una redirección a `/reset-password`.
- **Importante:** la whitelist de Redirect URLs en Supabase **debe** incluir el dominio exacto que el usuario tenga en su navegador; de lo contrario, Supabase rechaza el redirect silenciosamente.

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
