FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4250
COPY . .
EXPOSE 4250
VOLUME ["/app/data"]
CMD ["node", "server.js"]
