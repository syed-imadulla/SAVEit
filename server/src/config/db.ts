import mongoose from 'mongoose';

const DEFAULT_MONGO_URI = 'mongodb://localhost:27017/saveit';

export async function connectToDatabase(customUri?: string): Promise<typeof mongoose> {
  const uri = customUri || process.env.MONGO_URI || DEFAULT_MONGO_URI;

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log(`[Database] MongoDB connected successfully to: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (err) {
    console.error('[Database] MongoDB connection error:', err);
    throw err;
  }
}

export async function disconnectFromDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('[Database] MongoDB disconnected gracefully.');
  }
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
