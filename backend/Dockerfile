FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
RUN npm ci --workspace backend --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node backend/src ./backend/src
USER node
EXPOSE 3000
CMD ["node", "backend/src/server.js"]
