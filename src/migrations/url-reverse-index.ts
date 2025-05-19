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
  kvInstance: typeof kv | null = null
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
async function migrateVercelKvData(kvInstance: typeof kv): Promise<void> {
  try {
    console.log('Starting Vercel KV migration...');

    let shortIdKeys: string[] = [];
    let count = 0;

    // Method 1: Try fetching all URL mappings via direct query
    console.log('Using direct approach with @vercel/kv...');

    try {
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

                // First ensure all keys are strings, then filter out our reverse index keys
                const stringKeys = batchKeys.map(k => String(k));
                const filteredKeys = stringKeys.filter(k => !k.startsWith('url:'));
                console.log(`Filtered to ${filteredKeys.length} keys after removing url: prefix keys`);
                keys.push(...filteredKeys);

                // Check if we're done
                if (String(cursor) === '0') {
                  done = true;
                }
              } else {
                console.log('Unexpected scan result format: array length < 2');
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
    }

    console.log(`Found total of ${shortIdKeys.length} potential URLs to check in Vercel KV`);

    if (shortIdKeys.length === 0) {
      console.log('No keys found to migrate. If you know there should be keys, check the Vercel KV API.');
      return;
    }

    // Process the found keys to create reverse mappings
    for (const key of shortIdKeys) {
      try {
        // Ensure we're working with a string key
        const shortId = String(key);
        console.log(`Checking key: ${shortId}`);

        // Get the URL mapping
        const mapping = await kvInstance.get<UrlMapping>(shortId);

        // Log the mapping type and structure for debugging
        console.log(`Mapping for ${shortId}: ${mapping ? 'found' : 'not found'}, type: ${typeof mapping}`);
        if (mapping) {
          console.log(`Has originalUrl: ${!!mapping.originalUrl}`);
        }

        if (mapping && mapping.originalUrl) {
          const urlHash = hashUrl(mapping.originalUrl);
          const reverseKey = `url:${urlHash}`;

          // Create the reverse mapping
          await kvInstance.set(reverseKey, shortId);
          console.log(`Created reverse mapping for ${reverseKey} ->  ${shortId} : ${mapping.originalUrl}`);
          count++;
        } else {
          console.log(`Skipping key ${shortId} - not a valid URL mapping`);
        }
      } catch (error) {
        console.error(`Error processing Vercel KV key ${key}:`, error);
      }
    }

    console.log(`Migration to Vercel KV completed successfully. Created ${count} reverse mappings.`);
  } catch (error) {
    console.error('Vercel KV migration error:', error);
    throw error;
  }
}
