#!/bin/sh
set -e
# Apply database migrations and collectstatic, then start gunicorn
python manage.py migrate --noinput
python manage.py collectstatic --noinput
exec gunicorn config.wsgi:application --bind 0.0.0.0:8000
