FROM mcr.microsoft.com/playwright:v1.50.1-noble

WORKDIR /app

# Copy package manifests
COPY package*.json ./

# Install npm dependencies (Playwright browsers & OS dependencies are already baked into this image)
RUN npm install

# Copy source code
COPY . .

# Set production environment and port
ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

CMD ["npm", "start"]
