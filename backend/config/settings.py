"""Django settings for minimal project created by Copilot assistant."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'replace-this-with-a-secure-secret-in-production')

DEBUG = os.environ.get('DJANGO_DEBUG', '1') == '1'

# ALLOWED_HOSTS: parse comma-separated env var DJANGO_ALLOWED_HOSTS
_allowed_hosts = os.environ.get('DJANGO_ALLOWED_HOSTS', '')
if _allowed_hosts:
    ALLOWED_HOSTS = [h.strip() for h in _allowed_hosts.split(',') if h.strip()]
else:
    ALLOWED_HOSTS = ['*'] if DEBUG else []

# CORS_ALLOWED_ORIGINS: accept comma-separated 'CORS_ALLOWED_ORIGINS' or single 'CORS_ALLOWED_ORIGIN'
_cors_raw = os.environ.get('CORS_ALLOWED_ORIGINS', '') or os.environ.get('CORS_ALLOWED_ORIGIN', '')
if _cors_raw:
    CORS_ALLOWED_ORIGINS = [o.strip().rstrip('/') for o in _cors_raw.split(',') if o.strip()]
else:
    CORS_ALLOWED_ORIGINS = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:8080",
    ]

# CSRF_TRUSTED_ORIGINS: comma-separated list (must include scheme)
_csrf_raw = os.environ.get('CSRF_TRUSTED_ORIGINS', '')
if _csrf_raw:
    CSRF_TRUSTED_ORIGINS = [o.strip().rstrip('/') for o in _csrf_raw.split(',') if o.strip()]
else:
    CSRF_TRUSTED_ORIGINS = []

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'rest_framework.authtoken',
    'api',
    'students',
    'personal',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

if DEBUG:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db3.sqlite3',
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': os.environ.get('DB_ENGINE', 'django.db.backends.postgresql'),
            'NAME': os.environ.get('POSTGRES_DB', 'tlaix'),
            'USER': os.environ.get('POSTGRES_USER', 'tlaix'),
            'PASSWORD': os.environ.get('POSTGRES_PASSWORD', 'tlaixpassword'),
            'HOST': os.environ.get('POSTGRES_HOST', 'db'),
            'PORT': os.environ.get('POSTGRES_PORT', '5432'),
        }
    }

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
# Directory where `collectstatic` will gather static files for production
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Additional static files directories (optional)
STATICFILES_DIRS = [
    BASE_DIR / 'static',
]

# Use WhiteNoise to serve static files in production
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Media settings
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# HTTPOnly Cookie Configuration
CORS_ALLOW_CREDENTIALS = True

# Session configuration for HTTPOnly cookies
SESSION_COOKIE_AGE = 86400 * 7  # 7 days
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = False  # Set to True in production with HTTPS
SESSION_COOKIE_SAMESITE = 'Lax'

# Custom auth token cookie settings
AUTH_TOKEN_COOKIE_NAME = 'auth_token'
AUTH_TOKEN_COOKIE_HTTPONLY = True
AUTH_TOKEN_COOKIE_SECURE = False  # Set to True in production with HTTPS
AUTH_TOKEN_COOKIE_SAMESITE = 'Lax'
AUTH_TOKEN_COOKIE_AGE = 86400 * 7  # 7 days