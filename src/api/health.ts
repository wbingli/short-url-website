import { VercelRequest, VercelResponse } from '@vercel/node';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { kv } from '@vercel/kv';
import { createClient } from 'redis';

// Interface for URL mapping (matching the one in index.ts)
interface UrlMapping {
  originalUrl: string;
  shortId: string;
  createdAt: string;
}

/**
 * Health check handler that tests basic URL shortener functionality
 * This creates a test URL, fetches it, and validates the redirect
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const health = {
    status: 'healthy',
    storage: 'available',
    timestamp: new Date().toISOString(),
    shortUrlCreated: false,
    shortUrlRetrieved: false,
    redirectWorks: false,
    redirectEndpoint: '',
    environment: process.env.NODE_ENV || 'development',
    errors: [] as string[]
  };

  try {
    // 1. Initialize storage client (same logic as main application)
    let kvInstance: any = null;
    let redisClient: any = null;
    let useRedis = false;

    try {
      // Check if we should use Redis client
      if (process.env.KV_REST_API_URL && process.env.KV_REST_API_URL.startsWith('redis://')) {
        redisClient = createClient({
          url: process.env.KV_REST_API_URL
        });

        await redisClient.connect();
        await redisClient.ping();
        useRedis = true;
      } else {
        // Try to initialize Vercel KV
        kvInstance = kv;
        await kvInstance.ping();
      }
    } catch (error: any) {
      health.storage = 'unavailable';
      health.status = 'unhealthy';
      health.errors.push(`Storage error: ${error.message}`);
      return res.status(500).json(health);
    }

    // 2. Generate a test short ID and configure the test URL based on environment
    const testId = `test-${crypto.randomBytes(4).toString('hex')}`;

    // Configure test URL based on environment
    let testUrl = 'http://localhost:3000';

    // In production, test the actual production site URL
    if (process.env.NODE_ENV === 'production') {
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'https://short-url-website.vercel.app';
      testUrl = `${baseUrl}/health-check?t=${Date.now()}`;
    }

    // 3. Test the URL shortening API
    try {
      // Create a short URL using the API functionality directly
      const host = process.env.NODE_ENV === 'production'
        ? process.env.VERCEL_URL || 'short-url-website.vercel.app'
        : `localhost:${process.env.PORT || 3000}`;

      // Create the mapping manually (similar to the /api/shorten endpoint)
      const mapping: UrlMapping = {
        originalUrl: testUrl,
        shortId: testId,
        createdAt: new Date().toISOString()
      };

      // Store the URL mapping
      if (useRedis && redisClient) {
        await redisClient.set(testId, JSON.stringify(mapping));
      } else if (kvInstance) {
        await kvInstance.set(testId, mapping);
      } else {
        throw new Error('No storage available');
      }

      health.shortUrlCreated = true;
    } catch (error: any) {
      health.shortUrlCreated = false;
      health.status = 'unhealthy';
      health.errors.push(`Failed to create short URL: ${error.message}`);
      return res.status(500).json(health);
    }

    // 4. Verify the URL retrieval works
    try {
      let retrievedMapping: UrlMapping | null = null;

      if (useRedis && redisClient) {
        const rawMapping = await redisClient.get(testId);
        if (rawMapping) {
          retrievedMapping = JSON.parse(rawMapping);
        }
      } else if (kvInstance) {
        retrievedMapping = await kvInstance.get(testId) as UrlMapping | null;
      }

      if (!retrievedMapping || retrievedMapping.originalUrl !== testUrl) {
        throw new Error('Retrieved URL does not match stored URL');
      }

      health.shortUrlRetrieved = true;

      // Test the redirect endpoint with an actual HTTP request
      try {
        const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
        const host = process.env.NODE_ENV === 'production'
          ? process.env.VERCEL_URL || 'short-url-website.vercel.app'
          : `localhost:${process.env.PORT || 3000}`;

        const redirectUrl = `${protocol}://${host}/s/${testId}`;
        health.redirectEndpoint = redirectUrl;

        const response = await fetch(redirectUrl, {
          method: 'HEAD',
          redirect: 'manual'
        });

        // Verify we get a redirect response (status 301, 302, 303, 307, or 308)
        const isRedirect = response.status >= 300 && response.status < 400;
        if (!isRedirect) {
          throw new Error(`Expected redirect status, got ${response.status}`);
        }

        // Verify it's redirecting to the right place
        const location = response.headers.get('location');
        if (!location || !location.includes(testUrl.split('?')[0])) {
          throw new Error('Redirect location does not match expected URL');
        }

        health.redirectWorks = true;
      } catch (error: any) {
        health.redirectWorks = false;
        health.errors.push(`Failed to test redirect: ${error.message}`);
        // Don't fail the overall health check just because the HTTP request failed
        // It might be because we're running in a serverless environment that can't make requests to itself
      }
    } catch (error: any) {
      health.shortUrlRetrieved = false;
      health.storage = 'unavailable';
      health.status = 'unhealthy';
      health.errors.push(`Failed to retrieve test URL: ${error.message}`);
    }

    // 5. Clean up the test data
    try {
      if (useRedis && redisClient) {
        await redisClient.del(testId);
        await redisClient.quit();
      } else if (kvInstance) {
        await kvInstance.del(testId);
      }
    } catch (error: any) {
      // We don't mark the service as unhealthy just because cleanup failed
      health.errors.push(`Failed to clean up test data: ${error.message}`);
    }

    // 6. Return the health status
    const statusCode = health.status === 'healthy' ? 200 : 500;

    // Only include errors in development or if explicitly requested
    if (process.env.NODE_ENV === 'production' && !req.query.debug) {
      const sanitizedHealth = { ...health };
      delete (sanitizedHealth as any).errors;
      return res.status(statusCode).json(sanitizedHealth);
    }

    return res.status(statusCode).json(health);
  } catch (error: any) {
    health.status = 'unhealthy';
    health.errors.push(`Unexpected error: ${error.message}`);

    // Only include errors in development or if explicitly requested
    if (process.env.NODE_ENV === 'production' && !req.query.debug) {
      const sanitizedHealth = { ...health };
      delete (sanitizedHealth as any).errors;
      return res.status(500).json(sanitizedHealth);
    }

    return res.status(500).json(health);
  }
}
