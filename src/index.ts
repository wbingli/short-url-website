import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { kv } from '@vercel/kv';
import dotenv from 'dotenv';

// Load environment variables in development
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
  console.log('Environment variables loaded from .env file');
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
    try {
      // Try to initialize KV
      kvInstance = kv;
      await kvInstance.ping();
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

    await kvInstance.set(shortId, newMapping);
    console.log('URL stored in KV:', shortId);

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
    try {
      kvInstance = kv;
      await kvInstance.ping();
    } catch (error: any) {
      return res.status(500).json({ error: 'Storage service not available', details: error?.message });
    }

    const mapping = await kvInstance.get<UrlMapping>(shortId);
    console.log('Retrieved URL mapping:', mapping);

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
