- [X] backend/serializers.py actualizar rows, data ya no se crea desde hay (Completado con RowTabData)
- [X] backend/permisions revisar y actualizar (Completado: CompleteDjangoObjectPermissions en CellValueViewSet)
- [X] backend/ cell value update delete (Completado sobre RowTabData con atomic delete y validación de tipos)
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
- [X] test validar que si creamos editamos un cell value, sea de acuerdo a al type de la column que pertenece (Completado: validate_and_format_cell_value y RowTabDataCRUDTestCase)
- [X] hacer un limit en el tabview para no realentizar las consultas, y manejarlo en el front end para consultar conforme se scrollea (Completado: row_limit/row_offset + infinite scroll con IntersectionObserver)
- [X] Crear un endpoint para subir varias filas y tabs al mismo tiempo (Completado: POST /api/tables/<table_id>/bulk/)
- [X] Eliminar tables, tabs, columns (Completado con ConfirmDeleteDialog y actualización de estado reactivo en Index y TableView)
- [ ] Dato datetime y time
- [ ] Permisos de ver el modulo de asistencia
- [X] Icono del calendario junto a nombre de la columna, para autorellenar con la fecha completa, dia, mes (número), mes (nombre), año (Completado en `AddColumnDialog`; ciclo con `date-fns` locale `es`; E2E 2026-10-26)
- [X] Redirección global al login ante cualquier 401 + `returnTo` + recarga de consultas tras autenticarse (Completado: interceptor, `ProtectedRoute`, aviso de sesión expirada; E2E 2026-10-26)
- [X] Icono para autorellenar hora
- [ ] Filtros en modo refision de orden
- [X] Editar name de row culumns tabs y tables (Completado: renombrado inline)
- [X] El modo revision en un modo por orden alfabetico ascendente o descendente y conforme a otras columnas y otro modo donde se pueda buscar el registro y editarlo (Plan: `docs/plans/2026-10-27-modo-revision-orden-busqueda.md`; QA: `docs/qa/2026-10-27-modo-revision-orden-busqueda.md`)
- [ ] Modo revision hacer mas grande el nombre de row o column que se esta revisando
- [ ] Permisos granulares en nuevo endpoint de la api de /cellvalues/
- [ ] Arrastrar para cambiar el orden de columns tabs y rows
- [ ] Editar nombre de columns yows y tabs
- [ ] Reeplaza el boton de editar el nombre por la accion de doble click sobre el nombre
- [ ] Al agregar una fila se duplica la confirmacion
- [ ] Replantear el funcionamiento de los permisos, roles, compartir, etc
    Permiso para crear tablas
    si puede crear una tabla, tiene todos los permisos sobre ella, para editar y ver todo
    Una tabla se puede compartir para solo ver o editar
    permiso para editar una tabla compartida
    permiso para añadir rows columns y tabs a una tabla compartida
    permiso para editar los valores de ciertas columns tal vez pueda ver todas las de un tab, pero no poder editar todas.
    No se pueden eliminar tablas que no son suyas, ni cambiar su nombre
    `` quiza sea bueno añadir un atributo owner para validar estos permisos ``
    Se puede compartir una tabla a usuarios sin auntenticacion, pero solo la podra ver, en el tab compartido

    table:
    c: permiso para crear
    r: permiso granular, creador y a quien compartio
    u: actualizar el nombre, descripcion e icono, solo el creador
    d: solo el creador

    tab:
    c: permiso para crear tabs en esa tabla si es compartida, sino si
    r: permiso para leer tabs de una tabla granular si es compartida, sino si
    u: solo si el creo ese tab si es compartida, sino si
    d: solo si el creo ese tab si es compartida, sino si

    rows:
    c: permiso para crear rows si es compartida, sino si
    r: puede ver todos los rows de la tabla si tiene permiso de ver la tabla
    u: permiso para actualizar los rows si es compartida, sino si
    d: permiso para eliminar los rows si es compartida, sino si

    columns:
    c: permiso para crear columns si es compartida, sino si
    r: puede ver todas las columns de el tab compartido, si es compartida, si es suya todos
    u: permiso para actualizar los nombres, puede actualizar los que creo, si es compartida, si es suya si
    d: permiso para borrar columnas, puede borrar las que creo, si es compartida, si es suya todos

    Permisos para el modulo de asistencia:
    solo un mienro con permisos especiales puede administrar los registros y relaciones, no puede modificar las asistencias.
    solo un checker, puede registrar asistencias, y ningun permiso mas.

- [ ] 