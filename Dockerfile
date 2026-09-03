FROM python:3.13-alpine AS build
WORKDIR /app

COPY mkdocs.yaml .
COPY docs ./docs

RUN pip install --no-cache-dir mkdocs-material

RUN mkdocs build --config-file mkdocs.yaml --site-dir /site

FROM nginx:alpine

COPY --from=build /site /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]