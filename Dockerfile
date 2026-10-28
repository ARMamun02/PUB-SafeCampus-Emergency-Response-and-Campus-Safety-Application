FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node . .
# Data (SQLite database, uploads, secret) lives in /data. Mount a volume here to keep it between deploys.
RUN mkdir -p /data && chown -R node:node /data
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
