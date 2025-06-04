import dotenv from 'dotenv';
import { kv } from '@vercel/kv';
import { createClient } from 'redis';
import { migrateUrlReverseIndex } from '../src/migrations/url-reverse-index';

// Load environment variables from .env.local or .env
dotenv.config({ path: '.env.local' });
console.log('Environment variables loaded from .env.local file');

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

async function runMigration() {
  console.log('Starting URL reverse index migration...');
  
  try {
    let kvInstance;
    let useRedis = false;

    // Determine which storage to use
    try {
      if (redisClient && await redisClient.ping()) {
        console.log('Using Redis for migration');
        useRedis = true;
      } else {
        console.log('Using Vercel KV for migration');
        kvInstance = kv;
        await kvInstance.ping();
      }

      // Run the migration
      await migrateUrlReverseIndex(useRedis, redisClient, kvInstance);
      console.log('Migration completed successfully');
    } catch (error: any) {
      console.error('Failed to run migration:', error?.message);
    }
  } catch (error: any) {
    console.error('Error during migration:', error);
  } finally {
    // Close Redis connection if open
    if (redisClient && redisClient.isOpen) {
      await redisClient.quit();
      console.log('Redis connection closed');
    }
    
    // Exit the process when done
    process.exit(0);
  }
}

// Run the migration
runMigration();