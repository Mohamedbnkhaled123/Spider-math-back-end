import dns from 'dns';
import mongoose from 'mongoose';
import { env } from './env.config';

// Ensure rock-solid SRV record lookup on Windows and diverse ISP networks
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Gracefully bypass if restricted by runtime sandbox
}

/**
 * MongoDB Atlas Connection Pool Configuration for M0 Free Tier (512MB)
 * Serverless-optimized connection caching preventing connection exhaustion.
 */
interface MongooseConnectionCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

// Global variable cached across warm serverless function invocations
declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseConnectionCache | undefined;
}

let cached: MongooseConnectionCache = global.mongooseCache || { conn: null, promise: null };

if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

/**
 * Connects to MongoDB Atlas using a singleton cached connection.
 * Tuned strictly for M0 512MB cluster limits.
 */
export async function connectToDatabase(): Promise<typeof mongoose> {
  // Return existing active connection immediately
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const mongooseOptions: mongoose.ConnectOptions = {
      maxPoolSize: 10, // Strict cap for M0 connection economy
      minPoolSize: 1,  // Retain 1 warm connection for fast serverless responses
      serverSelectionTimeoutMS: 5000, // Fail fast after 5s if Atlas is unreachable
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      autoIndex: env.NODE_ENV !== 'production', // Disable runtime index creation in production
      bufferCommands: false // Disable Mongoose buffering; fail fast if DB is disconnected
    };

    mongoose.set('strictQuery', true);

    cached.promise = mongoose
      .connect(env.MONGODB_URI, mongooseOptions)
      .then((m) => {
        console.log(`✅ [MongoDB Atlas] Connected successfully to: ${m.connection.name} (PoolSize: 10, M0 Optimized)`);
        return m;
      })
      .catch((err) => {
        console.error('❌ [MongoDB Atlas] Connection Error:', err.message);
        cached.promise = null; // Reset promise so subsequent invocations can retry
        throw err;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

/**
 * Gracefully closes the MongoDB connection during process termination.
 */
export async function disconnectFromDatabase(): Promise<void> {
  if (cached.conn) {
    await mongoose.disconnect();
    cached.conn = null;
    cached.promise = null;
    console.log('🔌 [MongoDB Atlas] Disconnected gracefully.');
  }
}
