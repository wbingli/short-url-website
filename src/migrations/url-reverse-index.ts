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
 * Migrate existing data from Vercel KV
 */
async function migrateVercelKvData(kvInstance: any): Promise<void> {
  try {
    console.log('Starting Vercel KV migration...');
    
    let shortIdKeys: string[] = [];
    let count = 0;
    
    // Try to use the best available method to get keys
    try {
      // First attempt: Try using listKeys if available (better method)
      if (typeof kvInstance.listKeys === 'function') {
        console.log('Using listKeys method for Vercel KV...');
        const keys = await kvInstance.listKeys();
        console.log(`listKeys returned: ${typeof keys}, isArray: ${Array.isArray(keys)}`);
        
        if (Array.isArray(keys)) {
          shortIdKeys = keys.filter(key => !key.startsWith('url:'));
          console.log(`Found ${shortIdKeys.length} potential URL keys using listKeys`);
        } else {
          console.log('listKeys did not return an array, falling back to scan');
          throw new Error('listKeys did not return an array');
        }
      } else {
        throw new Error('listKeys method not available');
      }
    } catch (error) {
      // Second attempt: Fall back to SCAN method
      console.log('Falling back to SCAN method for Vercel KV...', error);
      
      let cursor = 0;
      
      // Use SCAN to iterate through all keys
      do {
        try {
          // Log what we're doing to help debug
          console.log(`Scanning with cursor ${cursor}...`);
          
          // Call scan and inspect the result structure
          const scanResult = await kvInstance.scan(cursor);
          console.log('Scan result:', JSON.stringify(scanResult, null, 2).substring(0, 200) + '...');
          
          // Update cursor for next iteration
          cursor = scanResult.cursor;
          
          // Process the keys - handle different possible structures
          let batchKeys: string[] = [];
          
          if (!scanResult.keys) {
            console.log('No keys property found in scan result');
          } else if (Array.isArray(scanResult.keys)) {
            // Standard array of keys
            batchKeys = scanResult.keys.filter(key => typeof key === 'string' && !key.startsWith('url:'));
          } else if (typeof scanResult.keys === 'object') {
            // Maybe it's an object with keys
            batchKeys = Object.keys(scanResult.keys).filter(key => !key.startsWith('url:'));
          } else {
            console.log(`Unexpected keys type: ${typeof scanResult.keys}`);
          }
          
          // Add to our collection
          console.log(`Found ${batchKeys.length} potential URL keys in this batch`);
          shortIdKeys = shortIdKeys.concat(batchKeys);
        } catch (scanError) {
          console.error('Error during scan operation:', scanError);
          break; // Exit the loop if scan fails
        }
      } while (cursor !== 0);
    }
    
    console.log(`Found total of ${shortIdKeys.length} potential URLs to check in Vercel KV`);
    
    if (shortIdKeys.length === 0) {
      console.log('No keys found to migrate. If you know there should be keys, check the Vercel KV API.');
      return;
    }
    
    // Process the found keys to create reverse mappings
    for (const shortId of shortIdKeys) {
      try {
        console.log(`Checking key: ${shortId}`);
        const mapping = await kvInstance.get<UrlMapping>(shortId);
        
        if (mapping && mapping.originalUrl) {
          const urlHash = hashUrl(mapping.originalUrl);
          const reverseKey = `url:${urlHash}`;
          
          // Create the reverse mapping
          await kvInstance.set(reverseKey, shortId);
          console.log(`Created reverse mapping for ${shortId} -> ${mapping.originalUrl}`);
          count++;
        } else {
          console.log(`Skipping key ${shortId} - not a valid URL mapping`);
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