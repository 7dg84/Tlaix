- [ ] backend/serializers.py actualizar rows, data ya no se crea desde hay
- [ ] backend/permisions revisar y actualizar 
- [ ] backend/ cell value update delete
- [X] backend/ endpoint para visualizar tablas
- [ ] backend/ api de relacion de alumnos y tablas (revisar permisos) (cifrado de clave para seguridad)
- [ ] client/terminar pruebas para POC
- [x] Add row en react
- [x] Dato fecha en sistema (Completado)
- [ ] Dashboard de permisos
- [X] Modo revisión por fila/columna (Completado: overlay fullscreen, endpoints cellvalues, atajos de teclado, 92 tests backend + 30 tests frontend del modo revisión; 89 tests frontend en total con fecha/auth)
- [ ] Grupos de revisión
- [ ] Cliente Desktop
- [X] Cuando se crea una tabla nueva acualizar la lista de tablas 
- [X] Que se hace cuando se crea una columna si no hay tabs
- [X] Añadir filas desde la creacion (Completado con endpoint bulk y CreateTableDialog)
- [ ] Añadir filas desde archivo, solo csv, manejar archivos grandes y poder seleccionar la columna a importar
- [X] Cuando se inicie sesion, refrescar (Completado para 401/returnTo: recarga completa con `window.location.assign` y reejecución de consultas)
- [X] Actualizar texto, lo hace cada que se actualiza algo, retrazar con un timer, para no sobrecargar la bd, cuando el elemento deje de estar activo o un segundo despues (Completado con CellEditor debounce 1s + onBlur)
- [ ] test validar que si creamos editamos un cell value, sea de acuerdo a al type de la column que pertenece
- [X] hacer un limit en el tabview para no realentizar las consultas, y manejarlo en el front end para consultar conforme se scrollea (Completado: row_limit/row_offset + infinite scroll con IntersectionObserver)
- [X] Crear un endpoint para subir varias filas y tabs al mismo tiempo (Completado: POST /api/tables/<table_id>/bulk/)
- [X] Eliminar tables, tabs, columns (Completado con ConfirmDeleteDialog y actualización de estado reactivo en Index y TableView)
- [ ] Dato datetime y time
- [ ] Permisos de ver el modulo de asistencia
- [X] Icono del calendario junto a nombre de la columna, para autorellenar con la fecha completa, dia, mes (número), mes (nombre), año (Completado en `AddColumnDialog`; ciclo con `date-fns` locale `es`; E2E 2026-10-26)
- [X] Redirección global al login ante cualquier 401 + `returnTo` + recarga de consultas tras autenticarse (Completado: interceptor, `ProtectedRoute`, aviso de sesión expirada; E2E 2026-10-26)
- [ ] Icono para autorellenar hora
- [X] Verificación E2E real (modo revisión: 60 filas × 6 tipos; calendario/401: 2026-10-26)
Dataset temporal de 60 filas × 6 columnas (texto, entero, decimal, checkbox, lista de 12 opciones, fecha):

La columna carga los 60 registros (no solo los 50 visibles).
Filtro "rech" → Rechazado; buffer 12 → Finalizado; 99 → error sin avance.
Checkbox, texto, entero (1.5 rechazado, 5 guardado), decimal y fecha guardan y avanzan correctamente.
Fila Fila 01 recorre sus 6 columnas y termina en “Revisión completada”.
Fallo 502 → panel + reversión; Reintentar → 200 y avance. Fallo 403 → mensaje correcto; Salir sin guardar cierra.
X con cambio pendiente guarda y cierra; persistencia confirmada en los 6 tipos tras recargar.
- [X] E2E en navegador: login con credenciales inválidas muestra los toasts “Credenciales inválidas” y “Usuario no encontrado” con role="status"; 0 regiones de sonner en el DOM. (Verificado; el caso de calendario/401 muestra además «Credenciales incorrectas».)
- [ ] Filtros en modo refision de orden
- [ ] Editar name de row culumns tabs y tables
- [ ] El modo revision en un modo por orden alfabetico ascendente o descendente y conforme a otras columnas y otro modo donde se pueda buscar el registro y editarlo
- [ ] 