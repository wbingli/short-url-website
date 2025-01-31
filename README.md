# URL Shortener

A URL shortening service built with Express.js and TypeScript, deployed on Vercel with KV storage. This project was created as an experiment using VSCode + Cline + OpenRouter with the Anthropic Claude-3.5-sonnet model.

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
- Fallback to memory storage for local development
- TypeScript for type safety
- Express.js for the backend
- Simple, clean frontend interface

## Tech Stack
- TypeScript
- Express.js
- Vercel KV (Redis)
- Vercel for deployment

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

3. Create a `.env.local` file with your Vercel KV credentials:
```env
KV_URL=your_kv_url_here
KV_REST_API_URL=your_kv_rest_api_url_here
KV_REST_API_TOKEN=your_kv_rest_api_token_here
```

4. Start the development server:
```bash
npm run dev
```

The server will start at http://localhost:3000. If KV credentials are not configured, it will automatically fall back to in-memory storage for local development.

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
- Special thanks to the Cline VSCode extension for enabling seamless AI-assisted development (Haha, this is also written by Cline!)
