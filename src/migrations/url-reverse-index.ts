import { kv } from '@vercel/kv';
import { createHash } from 'crypto';
import { UrlMapping } from '../types';

// Create a hash of the URL to use as a key in the reverse index
export function hashUrl(url: string): string {
  return createHash('md5').update(url).digest('hex');
}

/**
 * Migrate existing URL data to create reverse index mappings
 * @param useRedis Whether to use Redis client
 * @param redisClient The Redis client instance
 * @param kvInstance The Vercel KV instance
 */
export async function migrateUrlReverseIndex(
  useRedis: boolean, 
  redisClient: any = null, 
  kvInstance: any = null
): Promise<void> {
  try {
    console.log('Starting migration to create URL reverse index...');
    
    if (useRedis && redisClient) {
      await migrateRedisData(redisClient);
    } else if (kvInstance) {
      await migrateVercelKvData(kvInstance);
    }
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
}

/**
 * Migrate existing data from Redis
 */
async function migrateRedisData(redisClient: any): Promise<void> {
  try {
    // Get all keys (short IDs) from Redis
    const keys = await redisClient.keys('*');
    
    // Skip keys that look like they might be from the reverse index
    const shortIdKeys = keys.filter((key: string) => !key.startsWith('url:'));
    
    console.log(`Found ${shortIdKeys.length} URLs to migrate in Redis`);
    
    // For each short ID, create a reverse mapping
    for (const shortId of shortIdKeys) {
      const rawMapping = await redisClient.get(shortId);
      if (rawMapping) {
        try {
          const mapping = JSON.parse(rawMapping);
          if (mapping.originalUrl) {
            const urlHash = hashUrl(mapping.originalUrl);
            const reverseKey = `url:${urlHash}`;
            
            // Create the reverse mapping
            await redisClient.set(reverseKey, shortId);
            console.log(`Created reverse mapping for ${shortId}`);
          }
        } catch (error) {
          console.error(`Error processing key ${shortId}:`, error);
        }
      }
    }
    
    console.log('Migration to Redis completed successfully');
  } catch (error) {
    console.error('Redis migration error:', error);
    throw error;
  }
}

/**
 * Migrate existing data from Vercel KV using SCAN
 */
async function migrateVercelKvData(kvInstance: any): Promise<void> {
  try {
    console.log('Starting Vercel KV migration using SCAN...');
    
    let cursor = 0;
    let shortIdKeys: string[] = [];
    let count = 0;
    
    // Use SCAN to iterate through all keys
    do {
      // Each SCAN operation returns a cursor and a set of keys
      const scanResult = await kvInstance.scan(cursor);
      cursor = scanResult.cursor;
      
      // Filter out keys that look like reverse index keys
      const keys = scanResult.keys.filter((key: string) => !key.startsWith('url:'));
      shortIdKeys = shortIdKeys.concat(keys);
      
      console.log(`Scanned batch with cursor ${cursor}, found ${keys.length} URL keys`);
    } while (cursor !== 0);
    
    console.log(`Found total of ${shortIdKeys.length} URLs to migrate in Vercel KV`);
    
    // Process the found keys to create reverse mappings
    for (const shortId of shortIdKeys) {
      try {
        const mapping = await kvInstance.get<UrlMapping>(shortId);
        
        if (mapping && mapping.originalUrl) {
          const urlHash = hashUrl(mapping.originalUrl);
          const reverseKey = `url:${urlHash}`;
          
          // Create the reverse mapping
          await kvInstance.set(reverseKey, shortId);
          console.log(`Created reverse mapping for ${shortId}`);
          count++;
        }
      } catch (error) {
        console.error(`Error processing Vercel KV key ${shortId}:`, error);
      }
    }
    
    console.log(`Migration to Vercel KV completed successfully. Created ${count} reverse mappings.`);
  } catch (error) {
    console.error('Vercel KV migration error:', error);
    throw error;
  }
}