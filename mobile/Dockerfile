# WorkBuddy Mobile（BFF + PWA）独立镜像
#   docker build -f mobile/Dockerfile -t workbuddy-mobile .
#   docker run --rm -p 127.0.0.1:7870:7870 -e WBM_CORE_URL=http://workbuddy:7864 workbuddy-mobile
FROM node:22-alpine AS web
WORKDIR /src/mobile/web
COPY mobile/web/package.json mobile/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY mobile/web/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    WBM_HOST=0.0.0.0 WBM_PORT=7870
WORKDIR /app
COPY mobile/requirements.txt mobile/requirements.txt
RUN pip install --no-cache-dir -r mobile/requirements.txt
COPY mobile/__init__.py mobile/main.py mobile/
COPY mobile/server mobile/server
COPY --from=web /src/mobile/web/dist mobile/web/dist
RUN useradd -r -u 10001 wbm && chown -R wbm /app
USER wbm
EXPOSE 7870
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request,sys;sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:7870/m/api/healthz').status==200 else 1)"
CMD ["python", "mobile/main.py"]
