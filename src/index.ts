import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { kv } from '@vercel/kv';
import dotenv from 'dotenv';
import { createClient } from 'redis';

// Load environment variables in development
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
  console.log('Environment variables loaded from .env file');
}

// Initialize Redis client if using Docker
let redisClient: any = null;
if (process.env.KV_REST_API_URL && process.env.KV_REST_API_URL.startsWith('redis://')) {
  try {
    redisClient = createClient({
      url: process.env.KV_REST_API_URL
    });
    redisClient.connect().then(() => {
      console.log('Connected to Redis server');
    }).catch((err: any) => {
      console.error('Redis connection error:', err);
    });
  } catch (error) {
    console.error('Failed to initialize Redis client:', error);
  }
}

const app = express();
const port = process.env.PORT || 3000;

interface UrlMapping {
  originalUrl: string;
  shortId: string;
  createdAt: string;
}

// Middleware
app.use(express.json());

// Request logging middleware
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Generate short ID
function generateShortId(): string {
  return crypto.randomBytes(4).toString('hex');
}

// API endpoint to create short URL
app.post('/api/shorten', async (req: express.Request, res: express.Response) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    new URL(url); // Validate URL format
  } catch (err) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  try {
    let kvInstance;
    let useRedis = false;
    
    try {
      // Check if we should use Redis client
      if (redisClient && await redisClient.ping()) {
        console.log('Using Redis client for storage');
        useRedis = true;
      } else {
        // Try to initialize Vercel KV
        kvInstance = kv;
        await kvInstance.ping();
      }
    } catch (error: any) {
      console.warn('KV storage not available, falling back to memory storage:', error?.message);
      // Fallback to memory storage
      const urlDatabase: UrlMapping[] = [];
      const shortId = generateShortId();
      const newMapping: UrlMapping = {
        originalUrl: url,
        shortId,
        createdAt: new Date().toISOString()
      };
      urlDatabase.push(newMapping);
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : req.protocol;
      const shortUrl = `${protocol}://${req.get('host')}/s/${shortId}`;
      return res.json({ shortUrl });
    }

    const shortId = generateShortId();
    const newMapping: UrlMapping = {
      originalUrl: url,
      shortId,
      createdAt: new Date().toISOString()
    };

    if (useRedis) {
      await redisClient.set(shortId, JSON.stringify(newMapping));
      console.log('URL stored in Redis:', shortId);
    } else if (kvInstance) {
      await kvInstance.set(shortId, newMapping);
      console.log('URL stored in Vercel KV:', shortId);
    } else {
      console.log('No storage available, storing in memory only');
    }

    const protocol = process.env.NODE_ENV === 'production' ? 'https' : req.protocol;
    const shortUrl = `${protocol}://${req.get('host')}/s/${shortId}`;
    res.json({ shortUrl });
  } catch (error: any) {
    console.error('Error storing URL:', error);
    res.status(500).json({
      error: 'Failed to create short URL',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
  }
});

// Redirect endpoint
app.get('/s/:shortId', async (req: express.Request, res: express.Response) => {
  const { shortId } = req.params;

  try {
    let kvInstance;
    let useRedis = false;
    
    try {
      // Check if we should use Redis client
      if (redisClient && await redisClient.ping()) {
        console.log('Using Redis client for retrieval');
        useRedis = true;
      } else {
        // Try to initialize Vercel KV
        kvInstance = kv;
        await kvInstance.ping();
      }
    } catch (error: any) {
      return res.status(500).json({ error: 'Storage service not available', details: error?.message });
    }

    let mapping: UrlMapping | null = null;
    
    if (useRedis) {
      const rawMapping = await redisClient.get(shortId);
      if (rawMapping) {
        mapping = JSON.parse(rawMapping);
      }
      console.log('Retrieved URL mapping from Redis:', mapping);
    } else if (kvInstance) {
      mapping = await kvInstance.get<UrlMapping>(shortId);
      console.log('Retrieved URL mapping from Vercel KV:', mapping);
    } else {
      console.log('No storage service available');
    }

    if (!mapping) {
      return res.status(404).send('Short URL not found');
    }

    res.redirect(mapping.originalUrl);
  } catch (error: any) {
    console.error('Error retrieving URL:', error);
    res.status(500).json({
      error: 'Failed to retrieve URL',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
  }
});


const publicPath = path.join(process.cwd(), 'public');
console.log('Serving static files from:', publicPath);

// Serve static files
app.use(express.static(publicPath, {
  index: false, // Disable automatic serving of index.html
  dotfiles: 'deny',
  fallthrough: true // Enable falling through to next middleware
}));

// Serve index.html for root path
app.get('/', (_req: express.Request, res: express.Response) => {
  const indexPath = path.join(publicPath, 'index.html');
  console.log('Attempting to serve index.html from:', indexPath);

  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('Error serving index.html:', err);
      res.status(500).send('Error loading page');
    } else {
      console.log('Successfully served index.html');
    }
  });
});

// Handle 404s
app.use((_req: express.Request, res: express.Response) => {
  console.log('404 - Not Found');
  res.status(404).send('Not Found');
});

// For local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

// Export the Express app for Vercel
export default app;
