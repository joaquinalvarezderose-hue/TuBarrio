# Pasos manuales de seguridad — Acción requerida del usuario

Este documento describe los pasos que **NO puedo automatizar** desde Claude Code y que requieren acción manual tuya en dashboards externos o decisiones destructivas (push --force).

Todos los pasos están ordenados por urgencia.

---

## 🔴 PASO 1 — Rotar API Key de TestSprite (5 min)

**Por qué:** la clave `sk-user-O4d8aOhqpa2lI031p7DsOUZeVp7_175n61hd8muR0EdByJPZShsc5WkW13QQjzjhpQ1j4ZIhAtbrjmkB-OgKqImkhFPEUz9BJj-v93XJKhfHCYBBLbNC1i9Bx7Ch_Sfb7TQ` quedó en git history (commit que agregó `.mcp.json`). Aunque ya está en `.gitignore`, sigue siendo accesible vía `git log --all -- .mcp.json` por cualquiera que clone el repo.

**Cómo:**

1. Ir a https://www.testsprite.com/ y loguearse.
2. Settings → API Keys.
3. Buscar la key que empieza con `sk-user-O4d8aOhqpa2lI031p7...` y hacer click en **Revoke** (o **Delete**).
4. Generar una nueva key con **Create Key**.
5. Copiar la nueva key.
6. Pegarla en `.mcp.json` local (NO commitear).

```json
{
  "mcpServers": {
    "TestSprite": {
      "env": {
        "API_KEY": "sk-user-NUEVA-KEY-AQUI"
      }
    }
  }
}
```

7. Verificar que `.mcp.json` esté en `.gitignore` (✅ ya lo está).

---

## 🔴 PASO 2 — Aplicar migración SQL al proyecto Supabase

**Por qué:** los fixes RLS y `search_path` necesitan ejecutarse en la base de datos remota.

**Archivo:** [`supabase/migrations/20260514_security_hardening.sql`](../supabase/migrations/20260514_security_hardening.sql)

### Opción A — Vía Supabase CLI (recomendado)

```powershell
# Si todavía no tenés la CLI:
npm install -g supabase

# Loguearse:
npx supabase login

# Linkear el proyecto (una sola vez):
npx supabase link --project-ref bpgyqjfysapldrlnsoty

# Aplicar todas las migraciones pendientes:
npx supabase db push
```

### Opción B — Vía Dashboard de Supabase

1. Abrir https://supabase.com/dashboard/project/bpgyqjfysapldrlnsoty/sql/new
2. Copiar el contenido completo de `supabase/migrations/20260514_security_hardening.sql`.
3. Pegar en el SQL Editor.
4. Click **Run**.
5. Verificar el mensaje `NOTICE` al final: debería decir `partidos_select_abiertas=0, funciones_sin_path=0, marketplace_policies=4, grupos_policies=4`.

### Opción C — Con MCP (si querés que lo aplique yo)

Avisame y lo ejecuto con `mcp__claude_ai_Supabase__apply_migration`. **Es destructivo en el sentido de que cambia políticas en producción**, por eso prefiero confirmarte antes.

---

## 🔴 PASO 3 — Purgar `.mcp.json` del git history (15 min)

**⚠️ ATENCIÓN:** este paso **reescribe el git history** y obliga a todos los colaboradores a re-clonar el repo. Si trabajás solo en este repo, es seguro. Si hay colaboradores, **coordiná con ellos primero**.

### Opción A — git-filter-repo (moderno, recomendado)

```powershell
# 1. Instalar git-filter-repo
pip install git-filter-repo

# 2. Hacer backup primero (por si algo sale mal)
git clone --mirror . ../TuBarrio-backup.git

# 3. Purgar el archivo
git filter-repo --invert-paths --path .mcp.json --force

# 4. Re-agregar el remote (filter-repo lo borra por seguridad)
git remote add origin https://github.com/TU-USUARIO/TuBarrio.git

# 5. Push forzado
git push --force --all
git push --force --tags
```

### Opción B — BFG Repo Cleaner

```powershell
# Descargar bfg.jar de https://rtyley.github.io/bfg-repo-cleaner/

# Clonar mirror
git clone --mirror https://github.com/TU-USUARIO/TuBarrio.git

# Limpiar
cd TuBarrio.git
java -jar bfg.jar --delete-files .mcp.json

# Limpiar y push
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force
```

### Verificación

```powershell
# Después del filter, esto debería estar vacío:
git log --all --diff-filter=A --name-only -- .mcp.json
```

---

## 🔴 PASO 4 — Cambiar política de contraseña en Supabase (2 min)

**Por qué:** actualmente el código permite contraseñas de 6 caracteres. OWASP recomienda 12+. Como la validación del cliente puede bypassearse, esto debe configurarse también en Supabase.

**Cómo:**

1. Abrir https://supabase.com/dashboard/project/bpgyqjfysapldrlnsoty/auth/policies
2. **Authentication → Policies → Password Policy**
3. Configurar:
   - **Minimum password length**: `12`
   - **Required characters**: marcar **Lower case**, **Upper case**, **Numbers**, **Special characters**
   - **Check for leaked passwords**: ON (chequea contra HaveIBeenPwned)
4. Click **Save**.

---

## 🟠 PASO 5 — Configurar CORS en Supabase (5 min)

**Por qué:** evitar que cualquier origen pueda hacer requests al proyecto Supabase.

1. https://supabase.com/dashboard/project/bpgyqjfysapldrlnsoty/settings/api
2. Buscar **CORS Origins** o **Allowed Origins**.
3. Agregar SOLO los dominios que efectivamente usen el proyecto:
   - `https://tudominio.com`
   - `https://www.tudominio.com`
   - `http://localhost:3000` (solo si necesitás desarrollo local)
4. **Remover** `*` si está presente.
5. **Save**.

---

## 🟠 PASO 6 — Configurar GitHub Secrets para CI/CD

Necesarios para que el workflow `.github/workflows/security.yml` funcione.

1. https://github.com/TU-USUARIO/TuBarrio/settings/secrets/actions
2. **New repository secret**, agregar:

| Nombre | Valor | Origen |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | `sbp_...` | Supabase Dashboard → Account → Access Tokens |
| `SUPABASE_DB_PASSWORD` | (el password de la BD) | Supabase Dashboard → Project Settings → Database |
| `SUPABASE_URL` | `https://bpgyqjfysapldrlnsoty.supabase.co` | Settings → API |
| `SUPABASE_ANON_KEY` | (anon key) | Settings → API |
| `SUPABASE_TEST_URL` | URL de branch de prueba | `supabase branches create test --persistent=false` |
| `SUPABASE_TEST_ANON_KEY` | anon key del branch | Settings → API del branch |
| `SNYK_TOKEN` (opcional) | snyk.io → Account → Auth Token | Snyk |

---

## 🟡 PASO 7 — Considerar eliminar `reset_password_test_user`

**Por qué:** función SECURITY DEFINER que resetea contraseñas de usuarios de testing. Si NO se usa en producción, debería borrarse.

```sql
-- En Supabase SQL Editor:
DROP FUNCTION IF EXISTS public.reset_password_test_user(text);
```

**Antes de borrar:** verificar que no esté siendo llamada desde código:

```powershell
# En tu repo:
grep -r "reset_password_test_user" .
```

Si no aparece en código del frontend, se puede borrar.

---

## Checklist de verificación post-aplicación

- [ ] TestSprite key rotada
- [ ] `.env.local` y `.mcp.json` siguen en `.gitignore`
- [ ] `git log --all -- .mcp.json` vacío (después de filter-repo)
- [ ] Migración `20260514_security_hardening.sql` aplicada (verificable con MCP `list_migrations`)
- [ ] Password policy en Supabase: 12 chars mínimo
- [ ] CORS en Supabase: solo dominios específicos
- [ ] GitHub Secrets configurados (al menos `SUPABASE_URL` + `SUPABASE_ANON_KEY`)
- [ ] Workflow GitHub Actions corriendo en próximo push

---

*Última actualización: 2026-05-14*
