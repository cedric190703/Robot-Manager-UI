FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY pnpm-lock.yaml ./

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install

# Copy application code
COPY . .

# Expose port
EXPOSE 5173

# Run development server
CMD ["pnpm", "dev", "--host"]
