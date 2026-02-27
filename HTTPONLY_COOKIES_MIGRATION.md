# Migración a HTTPOnly Cookies

## Resumen
Se ha implementado una migración de tokens almacenados en localStorage a HTTPOnly cookies para mayor seguridad.

## Cambios Realizados

### Backend (Django/DRF)

#### 1. Configuración en `backend/config/settings.py`
- ✅ `CORS_ALLOW_CREDENTIALS = True` - Permite cookies en solicitudes CORS
- ✅ Configuración de cookies HTTPOnly con SameSite=Lax
- ✅ Expiración de cookies en 7 días

#### 2. Autenticación personalizada en `backend/api/views.py`
- ✅ Nueva clase `CookieTokenAuthentication` que lee tokens desde cookies
- ✅ Mantiene compatibilidad con autenticación por header Authorization
- ✅ Aplicada a todos los endpoints autenticados

#### 3. Vistas de autenticación actualizadas
- ✅ **Login**: Envía token en HTTPOnly cookie (no en respuesta JSON)
- ✅ **Logout**: Elimina la cookie HTTPOnly
- ✅ **User**: Actualizada para usar CookieTokenAuthentication
- ✅ Todos los viewsets usan CookieTokenAuthentication

### Frontend (React/TypeScript)

#### 1. API Configuration
- ✅ `src/api/users.ts` - Configurado `withCredentials: true`
- ✅ `src/api/tables.ts` - Configurado `withCredentials: true`
- ✅ `logoutApi()` - Actualizado para no requerir token

#### 2. AuthContext en `src/context/AuthContext.tsx`
- ✅ Removido `token` del contexto
- ✅ Removido localStorage para token (mantiene username por ahora)
- ✅ **Login**: Token ahora se guarda automáticamente en cookie
- ✅ **Logout**: No necesita token, se elimina por backend
- ✅ Verificación de sesión al montar el componente

## Ventajas de Seguridad

1. **XSS Protection**: El token no es accesible a través de JavaScript (HTTPOnly)
2. **CSRF Protection**: SameSite=Lax mitiga ataques CSRF
3. **Automatización**: Las cookies se envían automáticamente con cada solicitud
4. **Expiración**: Las cookies expiran automáticamente después de 7 días

## Paso a Producción

Para producción, realiza estos cambios en `backend/config/settings.py`:

```python
# En settings.py
SESSION_COOKIE_SECURE = True      # Solo HTTPS
AUTH_TOKEN_COOKIE_SECURE = True   # Solo HTTPS
DEBUG = False                      # Desactiva modo debug
```

También actualiza los CORS_ALLOWED_ORIGINS con tus dominios de producción.

## Testing de la Implementación

### Test de Login
```bash
curl -X POST http://localhost:8000/api/user/login/ \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}' \
  -v
```
Busca en headers: `Set-Cookie: auth_token=...`

### Test de Solicitud Autenticada
```bash
curl http://localhost:8000/api/user/ \
  -H "Cookie: auth_token=<token_aqui>" \
  -v
```

### Test desde Frontend
La cookie se envía automáticamente con `withCredentials: true`

## Reversión (si es necesario)

Para volver a localStorage:
1. Remover `withCredentials: true` de axios
2. Remover `CORS_ALLOW_CREDENTIALS` de settings
3. Volver al código anterior de AuthContext y views.py

## Archivos Modificados

- `backend/config/settings.py`
- `backend/api/views.py`
- `frontend/tabula-dash-flow/src/context/AuthContext.tsx`
- `frontend/tabula-dash-flow/src/api/users.ts`
- `frontend/tabula-dash-flow/src/api/tables.ts`

## Próximos Pasos (Recomendados)

1. ✅ Implementar refresh token para mayor seguridad
2. ✅ Agregar CSRF protection con tokens
3. ✅ Implementar rate limiting en endpoints de auth
4. ✅ Agregar logs de auditoría para intentos de login
