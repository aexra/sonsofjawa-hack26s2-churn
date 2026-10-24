ARG BASE_REGISTRY=docker.io

FROM ${BASE_REGISTRY}/library/node:24-alpine AS build
ARG NPM_REGISTRY=https://registry.npmjs.org/
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --registry=${NPM_REGISTRY}
COPY . .
RUN npm run build

FROM ${BASE_REGISTRY}/nginxinc/nginx-unprivileged:stable-alpine
USER root
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf.template /etc/nginx/nginx.conf.template
COPY docker/entrypoint.sh /docker-entrypoint-custom.sh
RUN rm -f /etc/nginx/conf.d/default.conf \
    && chown -R nginx:nginx /usr/share/nginx/html /etc/nginx/conf.d
USER nginx
EXPOSE 8080
ENTRYPOINT ["/docker-entrypoint-custom.sh"]
