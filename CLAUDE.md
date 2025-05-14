# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a URL shortener service built with Express.js and TypeScript. It allows users to shorten long URLs into concise, shareable links. The application can be deployed to Vercel with KV storage or run locally with Docker using Redis.

## Development Commands

### Setup
```bash
# Install dependencies
npm install
```

### Development
```bash
# Start development server with ts-node (uses in-memory storage by default)
npm run dev
```

### Building
```bash
# Compile TypeScript to JavaScript
npm run build
```

### Running
```bash
# Run the compiled application
npm start
```

### Docker Development
```bash
# Build and start both app and Redis containers
docker-compose up --build
```

### Deployment
```bash
# Deploy to Vercel
vercel deploy --prod
```

## Architecture

### Storage Providers
The application has a tiered storage approach:
1. **Vercel KV**: Used in production when deployed to Vercel
2. **Redis**: Used when running with Docker (connection specified via environment variables)
3. **In-memory Fallback**: Used when neither Vercel KV nor Redis is available (development mode)

### Key Components

- **Express Server**: Handles HTTP requests and serves the static frontend
- **URL Shortening Logic**: Generates short IDs using crypto.randomBytes
- **Storage Abstraction**: Automatically detects and uses the appropriate storage backend
- **Frontend**: Simple HTML/CSS/JS interface for shortening URLs

### API Endpoints

- `POST /api/shorten`: Creates a short URL from a long URL
- `GET /s/:shortId`: Redirects to the original URL
- `GET /api/health`: Health check endpoint for monitoring

## Environment Variables

- `NODE_ENV`: Set to 'production' in production environments
- `PORT`: The port to run the server on (defaults to 3000)
- `KV_REST_API_URL`: URL for the KV storage (Vercel KV or Redis)
- `KV_REST_API_TOKEN`: Token for authenticating with the KV storage

## File Structure

- `src/index.ts`: Main application file with Express setup and URL shortening logic
- `src/api/health.ts`: Health check endpoint for monitoring
- `public/index.html`: Frontend interface for the URL shortener
- `Dockerfile` & `compose.yaml`: Docker configuration for local development with Redis
- `vercel.json`: Vercel deployment configuration with cron job setup