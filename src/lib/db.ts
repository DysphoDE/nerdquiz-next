/**
 * Prisma Client Singleton
 * 
 * In Next.js mit Hot Reload würde bei jedem Reload eine neue
 * Prisma-Instanz erstellt werden. Dieses Pattern verhindert das.
 * 
 * Prisma 7 erfordert einen Adapter für direkte DB-Verbindungen.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: pg.Pool | undefined;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.warn('⚠️ DATABASE_URL not set, Prisma will not be available');
    // Return a mock client that throws on use
    return null as unknown as PrismaClient;
  }

  const pool = globalForPrisma.pool ?? new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.pool = pool;
  }
  
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production' && prisma) {
  globalForPrisma.prisma = prisma;
}

export default prisma;

