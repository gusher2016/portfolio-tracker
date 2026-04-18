FROM node:20-alpine

WORKDIR /app

# Install serve for static file serving
RUN npm install -g serve

COPY package*.json ./
RUN npm install

# Build the React app
RUN npm run build

# Expose port 80
EXPOSE 80

# Serve the built static files
CMD ["serve", "-s", "dist", "-l", "80"]