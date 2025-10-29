import { Request, Response } from 'express';
import { UrlMapping } from '../types';

/**
 * Get statistics about the URL shortener service
 * This endpoint retrieves various metrics about the service
 */
export async function getStats(
  req: Request,
  res: Response,
  storage: {
    useRedis: boolean;
    redisClient: any;
    kvInstance: any;
  }
): Promise<void> {
  try {
    const { useRedis, redisClient, kvInstance } = storage;

    let totalUrls = 0;
    let recentUrls: UrlMapping[] = [];
    let urlsLast24Hours = 0;
    let urlsLast7Days = 0;
    let storageType = 'unknown';

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    if (useRedis && redisClient) {
      storageType = 'redis';
      // Get all keys from Redis
      const keys = await redisClient.keys('*');
      // Filter out reverse index keys (they start with 'url:')
      const shortIdKeys = keys.filter((key: string) => !key.startsWith('url:'));
      totalUrls = shortIdKeys.length;

      // Get all URL mappings and sort by creation date
      const mappings: UrlMapping[] = [];
      for (const shortId of shortIdKeys) {
        const rawMapping = await redisClient.get(shortId);
        if (rawMapping) {
          try {
            const mapping = JSON.parse(rawMapping);
            if (mapping.originalUrl) {
              mappings.push(mapping);
              
              const createdAt = new Date(mapping.createdAt).getTime();
              if (createdAt >= oneDayAgo) {
                urlsLast24Hours++;
              }
              if (createdAt >= sevenDaysAgo) {
                urlsLast7Days++;
              }
            }
          } catch (error) {
            console.error(`Error parsing mapping for ${shortId}:`, error);
          }
        }
      }

      // Sort by creation date (newest first) and take last 10
      mappings.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      recentUrls = mappings.slice(0, 10);

    } else if (kvInstance) {
      storageType = 'vercel-kv';
      
      try {
        // Use SCAN to get all keys from Vercel KV
        let cursor: string | number = 0;
        const allKeys: string[] = [];
        
        while (true) {
          const result: any = await kvInstance.scan(cursor);
          
          if (Array.isArray(result) && result.length >= 2) {
            cursor = result[0];
            const batchKeys = Array.isArray(result[1]) ? result[1] : [];
            const stringKeys = batchKeys.map(k => String(k));
            const filteredKeys = stringKeys.filter(k => !k.startsWith('url:'));
            allKeys.push(...filteredKeys);
            
            if (String(cursor) === '0') {
              break;
            }
          } else {
            break;
          }
        }

        totalUrls = allKeys.length;

        // Get all URL mappings
        const mappings: UrlMapping[] = [];
        for (const shortId of allKeys) {
          try {
            const mapping: any = await kvInstance.get(shortId);
            if (mapping && mapping.originalUrl) {
              mappings.push(mapping);
              
              const createdAt = new Date(mapping.createdAt).getTime();
              if (createdAt >= oneDayAgo) {
                urlsLast24Hours++;
              }
              if (createdAt >= sevenDaysAgo) {
                urlsLast7Days++;
              }
            }
          } catch (error) {
            console.error(`Error getting mapping for ${shortId}:`, error);
          }
        }

        // Sort by creation date (newest first) and take last 10
        mappings.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        recentUrls = mappings.slice(0, 10);

      } catch (error) {
        console.error('Error scanning Vercel KV:', error);
      }
    } else {
      storageType = 'in-memory';
      // No persistent storage available
      totalUrls = 0;
    }

    res.json({
      success: true,
      stats: {
        totalUrls,
        urlsLast24Hours,
        urlsLast7Days,
        recentUrls: recentUrls.map(url => ({
          shortId: url.shortId,
          originalUrl: url.originalUrl,
          createdAt: url.createdAt
        })),
        storageType,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
  }
}
