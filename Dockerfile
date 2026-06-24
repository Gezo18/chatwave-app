FROM node:20-alpine

WORKDIR /app

# Copy server package files
COPY server/package*.json ./server/

# Install server dependencies
RUN cd server && npm install --production

# Copy client build
COPY client/dist ./client/dist

# Copy server code
COPY server/ ./server/

# Copy root package.json
COPY package.json ./

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "server/index.js"]