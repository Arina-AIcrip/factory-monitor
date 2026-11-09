FROM node:24-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production
ENV PORT=3008
EXPOSE 3008
USER node
CMD ["node", "server.mjs"]
