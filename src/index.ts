import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { kv } from '@vercel/kv';
import dotenv from 'dotenv';
import { createClient } from 'redis';
import healthCheckHandler from './api/health';
import { getStats } from './api/stats';
import { hashUrl } from './migrations/url-reverse-index';
import { UrlMapping } from './types';

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

// UrlMapping interface moved to src/types.ts

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

// Helper function to get storage configuration
async function getStorageConfig() {
  let useRedis = false;
  let kvInstance;

  try {
    // Check if we should use Redis client
    if (redisClient && await redisClient.ping()) {
      console.log('Using Redis client for storage');
      useRedis = true;
      return { useRedis, redisClient, kvInstance: null };
    } else {
      // Try to initialize Vercel KV
      kvInstance = kv;
      await kvInstance.ping();
      return { useRedis: false, redisClient: null, kvInstance };
    }
  } catch (error: any) {
    console.warn('KV storage not available:', error?.message);
    return { useRedis: false, redisClient: null, kvInstance: null };
  }
}

// Migration and hashing functions moved to src/migrations/url-reverse-index.ts

// Simple authentication middleware for admin endpoints
function adminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  
  // Get admin credentials from environment variables
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  // Determine if this is an API request or HTML page request
  const isApiRequest = req.path.startsWith('/api/');
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
    if (isApiRequest) {
      return res.status(401).json({ error: 'Authentication required' });
    } else {
      // For HTML pages, send text response to trigger browser auth dialog
      return res.status(401).send('Unauthorized');
    }
  }
  
  try {
    const base64Credentials = authHeader.split(' ')[1];
    if (!base64Credentials) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
      if (isApiRequest) {
        return res.status(401).json({ error: 'Invalid authorization header' });
      } else {
        return res.status(401).send('Unauthorized');
      }
    }
    
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const colonIndex = credentials.indexOf(':');
    
    if (colonIndex === -1) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
      if (isApiRequest) {
        return res.status(401).json({ error: 'Invalid credentials format' });
      } else {
        return res.status(401).send('Unauthorized');
      }
    }
    
    const username = credentials.substring(0, colonIndex);
    const password = credentials.substring(colonIndex + 1);
    
    if (username === adminUsername && password === adminPassword) {
      next();
    } else {
      res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
      if (isApiRequest) {
        return res.status(401).json({ error: 'Invalid credentials' });
      } else {
        return res.status(401).send('Unauthorized');
      }
    }
  } catch (error) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
    if (isApiRequest) {
      return res.status(401).json({ error: 'Authentication failed' });
    } else {
      return res.status(401).send('Unauthorized');
    }
  }
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

    // Check if this URL has already been shortened
    const urlHash = hashUrl(url);
    const reverseKey = `url:${urlHash}`;
    let shortId;
    let isExisting = false;

    if (useRedis) {
      // Check if URL exists in Redis reverse index
      shortId = await redisClient.get(reverseKey);
      isExisting = !!shortId;
      
      if (!isExisting) {
        // Generate new shortId and store mappings
        shortId = generateShortId();
        const newMapping: UrlMapping = {
          originalUrl: url,
          shortId,
          createdAt: new Date().toISOString()
        };
        
        // Store both the forward mapping (shortId -> URL data) and reverse mapping (URL hash -> shortId)
        await redisClient.set(shortId, JSON.stringify(newMapping));
        await redisClient.set(reverseKey, shortId);
        console.log('New URL stored in Redis:', shortId);
      } else {
        console.log('Found existing short URL in Redis:', shortId);
      }
    } else if (kvInstance) {
      // Check if URL exists in Vercel KV reverse index
      shortId = await kvInstance.get(reverseKey);
      isExisting = !!shortId;
      
      if (!isExisting) {
        // Generate new shortId and store mappings
        shortId = generateShortId();
        const newMapping: UrlMapping = {
          originalUrl: url,
          shortId,
          createdAt: new Date().toISOString()
        };
        
        // Store both the forward mapping (shortId -> URL data) and reverse mapping (URL hash -> shortId)
        await kvInstance.set(shortId, newMapping);
        await kvInstance.set(reverseKey, shortId);
        console.log('New URL stored in Vercel KV:', shortId);
      } else {
        console.log('Found existing short URL in Vercel KV:', shortId);
      }
    } else {
      console.log('No storage available, storing in memory only');
      shortId = generateShortId();
    }

    const protocol = process.env.NODE_ENV === 'production' ? 'https' : req.protocol;
    const shortUrl = `${protocol}://${req.get('host')}/s/${shortId}`;
    res.json({ 
      shortUrl,
      isExisting: isExisting || false
    });
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

// Health check API endpoint - delegate to the Vercel handler
app.get('/api/health', (req, res) => {
  healthCheckHandler(req as any, res as any);
});

// Stats API endpoint for admin dashboard
app.get('/api/stats', adminAuth, async (req, res) => {
  try {
    const storage = await getStorageConfig();
    await getStats(req, res, storage);
  } catch (error: any) {
    console.error('Error in stats endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
  }
});

// Serve admin.html for admin path (requires authentication)
app.get('/admin', adminAuth, (_req: express.Request, res: express.Response) => {
  const adminPath = path.join(publicPath, 'admin.html');
  console.log('Attempting to serve admin.html from:', adminPath);

  res.sendFile(adminPath, (err) => {
    if (err) {
      console.error('Error serving admin.html:', err);
      res.status(500).send('Error loading admin page');
    } else {
      console.log('Successfully served admin.html');
    }
  });
});

// Handle 404s
app.use((_req: express.Request, res: express.Response) => {
  console.log('404 - Not Found');
  res.status(404).send('Not Found');
});

// Migration has been moved to a separate script
// Run it with: npm run migrate

// For local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

// Export the Express app for Vercel
export default app;
