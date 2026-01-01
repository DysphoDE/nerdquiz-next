/**
 * NerdQuiz Custom Server
 * Next.js + Socket.io WebSocket Server
 * 
 * Diese Datei ist der Entry-Point für den Server.
 * Die gesamte Spiellogik ist in src/server/ ausgelagert.
 */

import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import next from 'next';
import 'dotenv/config';

// Server Module Imports
import { setupSocketHandlers } from './src/server/socketHandlers';
import * as questionLoader from './src/server/questionLoader';

// ============================================
// CONFIGURATION
// ============================================

const dev = process.env.NODE_ENV !== 'production';
const hostname = dev ? 'localhost' : '0.0.0.0';
const port = parseInt(process.env.PORT || '3001', 10);

// ============================================
// NEXT.JS APP
// ============================================

const app = next({ dev, hostname, port, turbopack: false });
const handle = app.getRequestHandler();

// ============================================
// START SERVER
// ============================================

app.prepare().then(async () => {
  const expressApp = express();
  const httpServer = createServer(expressApp);
  
  // Check database connection and load categories
  const dbConnected = await questionLoader.isDatabaseConnected();
  const categories = await questionLoader.getCategoryList();
  console.log(`\n📚 ${categories.length} Kategorien geladen ${dbConnected ? '(Supabase)' : '(JSON Fallback)'}\n`);

  // ============================================
  // SOCKET.IO SETUP
  // ============================================

  const io = new SocketServer(httpServer, {
    cors: {
      origin: dev 
        ? ['http://localhost:3000', 'http://localhost:3001'] 
        : process.env.CORS_ORIGIN?.split(',') || [],
      methods: ['GET', 'POST'],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Register all socket event handlers
  setupSocketHandlers(io);

  // ============================================
  // NEXT.JS REQUEST HANDLER
  // ============================================

  expressApp.all('/{*path}', (req: Request, res: Response) => {
    return handle(req, res);
  });

  // ============================================
  // START LISTENING
  // ============================================

  httpServer.listen(port, () => {
    console.log(`
╔══════════════════════════════════════════╗
║   🎮 NerdQuiz Server                     ║
║   📍 http://${hostname}:${port}               ║
║   🔌 WebSocket ready                     ║
╚══════════════════════════════════════════╝
    `);
  });
});
