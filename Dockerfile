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

# Expose the port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
