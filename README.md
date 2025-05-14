# URL Shortener

A URL shortening service built with Express.js and TypeScript, deployed on Vercel with KV storage. This project was created to verify current AI and coding agent features, using VSCode + [Cline](https://github.com/cline/cline) + [OpenRouter](https://openrouter.ai/) with the Anthropic Claude-3.5-sonnet model.

## Development Stats
- **Development Time**: ~1 hour
- **AI Model**: anthropic/claude-3.5-sonnet via OpenRouter
- **Token Usage**:
  - Input: 6.7M tokens
  - Output: 22K tokens
- **Cost**: $6 total

## Features
- Shorten long URLs to concise, shareable links
- Persistent storage using Vercel KV (Redis)
- Uses local Redis for Docker deployment or in-memory storage for simple local development
- TypeScript for type safety
- Express.js for the backend
- Simple, clean frontend interface
- Automatic health checks via Vercel Cron Jobs

## Tech Stack
- TypeScript
- Express.js
- Vercel KV (Redis)
- Vercel for deployment
- Vercel Cron Jobs for monitoring

## Local Development

1. Clone the repository:
```bash
git clone https://github.com/wbingli/short-url-website.git
cd short-url-website
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The server will start at http://localhost:3000. It will automatically use in-memory storage for local development.

## Running with Docker

To run this project using Docker, follow the steps below:

### Prerequisites

- Ensure Docker and Docker Compose are installed on your system.
- No environment variables are required. The application will automatically use the local Redis container.

### Build and Run

1. Build and start the services using Docker Compose:

```bash
docker-compose up --build
```

2. Access the application at [http://localhost:3000](http://localhost:3000).

### Services and Ports

- **App Service**: Exposes port `3000` for the application.
- **Redis Service**: Exposes port `6379` for the Redis database.

### Notes

- The `app` service is built using the provided `Dockerfile` and runs in development mode.
- The `redis` service uses the official Redis image and persists data in a Docker volume.
- The docker-compose configuration includes all necessary environment variables to connect to the Redis container.

## Production Deployment

1. Deploy to Vercel:
```bash
vercel deploy --prod
```

2. Set up Vercel KV:
   - Go to your Vercel dashboard
   - Navigate to Storage tab
   - Create a new KV database
   - The environment variables will be automatically added to your project

3. Enable Cron Jobs:
   - Vercel will automatically set up the cron job based on the vercel.json configuration
   - The health check will run every 15 minutes to monitor the application
   - The health check is environment-aware and will test against the production URL when deployed
   - No additional setup is required

## Development Process
This project was developed using:
- VSCode as the IDE
- Cline extension for AI assistance
- OpenRouter for accessing Claude-3.5-sonnet
- Vercel for deployment and KV storage

The entire development process, from initial setup to deployment, was completed in about an hour with the help of AI assistance. The AI model helped with:
- Project structure setup
- Code implementation
- Error handling
- Deployment configuration
- Documentation

## License
MIT

Copyright (c) 2024

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Acknowledgments
- Built with assistance from Anthropic's Claude-3.5-sonnet model via OpenRouter
- Deployed on Vercel with KV storage
- Special thanks to the Cline VSCode extension for enabling seamless AI-assisted development