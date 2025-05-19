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
 * Migrate existing data from Vercel KV by directly querying all keys
 */
async function migrateVercelKvData(kvInstance: any): Promise<void> {
  try {
    console.log('Starting Vercel KV migration...');
    
    let shortIdKeys: string[] = [];
    let count = 0;
    
    // Method 1: Try fetching all URL mappings via direct query
    console.log('Using direct approach with @vercel/kv...');
    
    try {
      // Based on the logs, it appears the scan returns an array where:
      // First element: Cursor or string identifier
      // Second element: Array of actual keys
      
      // We'll use our own simple implementation to get all keys
      let cursor: string | number = 0;
      
      const getAllKeys = async () => {
        const keys: string[] = [];
        let done = false;
        
        while (!done) {
          try {
            console.log(`Getting keys with cursor: ${cursor}`);
            
            // Use the raw command interface to execute SCAN
            const rawResult = await kvInstance.scan(cursor);
            console.log(`Raw scan result type: ${typeof rawResult}, isArray: ${Array.isArray(rawResult)}`);
            
            // Log first portion of the result to understand structure
            if (rawResult) {
              console.log('Scan result structure (first 500 chars):', 
                JSON.stringify(rawResult).substring(0, 500));
            }
            
            if (Array.isArray(rawResult)) {
              // Based on the log, rawResult seems to be [cursor, [keys]]
              if (rawResult.length >= 2) {
                // Next cursor
                cursor = rawResult[0];
                
                // Keys from this batch
                const batchKeys = Array.isArray(rawResult[1]) ? rawResult[1] : [];
                console.log(`Found ${batchKeys.length} keys in batch`);
                
                // Add keys that don't start with 'url:' (to skip our reverse index keys)
                const filteredKeys = batchKeys.filter(k => !k.startsWith('url:'));
                keys.push(...filteredKeys);
                
                // Check if we're done
                if (cursor === 0 || cursor === '0') {
                  done = true;
                }
              } else {
                console.log('Unexpected scan result format: array length < 2');
                done = true;
              }
            } else {
              // If not an array, try to extract cursor and keys differently
              // This is a fallback attempt that probably won't be needed based on logs
              console.log('Result not an array, trying to extract cursor and keys');
              
              if (rawResult && rawResult.cursor !== undefined) {
                cursor = rawResult.cursor;
                
                if (Array.isArray(rawResult.keys)) {
                  const filteredKeys = rawResult.keys.filter((k: string) => !k.startsWith('url:'));
                  keys.push(...filteredKeys);
                }
                
                if (cursor === 0 || cursor === '0') {
                  done = true;
                }
              } else {
                console.log('Could not extract cursor from result, stopping');
                done = true;
              }
            }
          } catch (e) {
            console.error('Error during key retrieval:', e);
            done = true;
          }
        }
        
        return keys;
      };
      
      shortIdKeys = await getAllKeys();
      console.log(`Retrieved ${shortIdKeys.length} keys total`);
    } catch (error) {
      console.error('Error using direct approach:', error);
      console.log('Falling back to manual key collection...');
      
      // If we failed to get keys automatically, create a manual list of potential IDs
      // This is a very naive approach, but at least allows some migration to happen
      
      shortIdKeys = [];
      for (let i = 0; i < 10000; i++) {
        // Check if IDs exist from 0000 to 9999
        const possibleId = i.toString().padStart(4, '0');
        try {
          const mapping = await kvInstance.get(possibleId);
          if (mapping && mapping.originalUrl) {
            shortIdKeys.push(possibleId);
          }
        } catch (e) {
          // Ignore errors for keys that don't exist
        }
      }
      
      console.log(`Retrieved ${shortIdKeys.length} keys using manual approach`);
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