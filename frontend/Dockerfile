FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm ci --workspace frontend --include=dev
COPY frontend ./frontend
ARG APP_VERSION=v2
ENV VITE_APP_VERSION=$APP_VERSION
RUN npm run build --workspace frontend

FROM nginx:1.28-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080
