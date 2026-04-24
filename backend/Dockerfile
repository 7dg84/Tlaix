FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

WORKDIR /app

# system deps
RUN apt-get update \
    && apt-get install -y build-essential libpq-dev gcc musl-dev --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/
RUN pip install --upgrade pip \
    && pip install -r requirements.txt \
    && pip install gunicorn psycopg2-binary

# copy project
COPY . /app/

# make entrypoint executable
RUN chmod +x /app/entrypoint.sh

EXPOSE 8000
CMD ["/app/entrypoint.sh"]
