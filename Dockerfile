FROM node:18-slim

# Install system dependencies (needed for better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY . .

# Create directory for config if it doesn't exist
RUN mkdir -p config

# Render injects PORT (default 10000); EXPOSE is documentation for the container
EXPOSE 10000

# Start the application
CMD ["npm", "start"]
