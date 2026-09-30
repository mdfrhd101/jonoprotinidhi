import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/* One in-memory mongod per test file, using the locally installed binary (see vitest.config env). */
let server: MongoMemoryServer | null = null;

export async function startDb(): Promise<void> {
  server = await MongoMemoryServer.create({ instance: { dbName: 'jonoprotinidhi_test' } });
  await mongoose.connect(server.getUri());
  // make sure indexes (unique, partial) exist before tests rely on them
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}

export async function stopDb(): Promise<void> {
  await mongoose.disconnect();
  await server?.stop();
  server = null;
}

export async function clearDb(): Promise<void> {
  const cols = await mongoose.connection.db!.collections();
  await Promise.all(cols.map((c) => c.deleteMany({})));
}
