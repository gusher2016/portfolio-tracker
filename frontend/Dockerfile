FROM node:20-alpine

WORKDIR /app

# Install serve for static file serving
RUN npm install -g serve

# Copy package files
COPY package*.json ./

# Install dependencies - use CI=true to avoid interactive prompts
RUN npm ci --legacy-peer-deps

# Build the React app
RUN npm run build

# Expose port 80
EXPOSE 80

# Serve the built static files
CMD ["serve", "-s", "dist", "-l", "80"]