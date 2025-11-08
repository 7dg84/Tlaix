# Backend (Django)

Estructura mínima creada para un proyecto Django + DRF.

Archivos creados:

- manage.py: entrypoint de Django
- config/: configuración del proyecto (settings, urls, wsgi)
- api/: app con un modelo `Item`, serializers, views (ViewSet), urls y admin

Instalación rápida (Windows PowerShell):

```powershell
python -m venv .venv; \# crear virtualenv
.\.venv\Scripts\Activate.ps1; \# activar
pip install -r requirements.txt; \# instalar deps
python manage.py migrate; \# migrar DB
python manage.py runserver; \# levantar servidor
```

Notas:
- Cambia `SECRET_KEY` en `config/settings.py` antes de producción.
- Ajusta `DEBUG` y `ALLOWED_HOSTS` cuando despliegues.
