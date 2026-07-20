FROM node:20-alpine

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache libc6-compat

# Copy dependency configs
COPY package.json package-lock.json ./

# Install all dependencies (dev included for compiling TS)
RUN npm ci

# Copy application source
COPY . .

# Next.js telemetry disabled during build
ENV NEXT_TELEMETRY_DISABLED=1

# Compile/Build the Next.js application
RUN npm run build

# Expose Next.js default port
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Start command
CMD ["npm", "start"]
