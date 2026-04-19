FROM node:20-alpine

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Install serve for static file serving
RUN npm install -g serve

# Copy all source files including index.html
COPY . .

# Build the React app
RUN npm run build

# Expose port 80
EXPOSE 80

# Serve the built static files
CMD ["serve", "-s", "dist", "-l", "80"]