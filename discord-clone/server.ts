// Custom server: Next.js and Socket.io share one HTTP server and port.
// App Router Route Handlers can't hold a WebSocket open, so the real-time
// layer lives here. Run with `npm run dev` / `npm start`, not `next dev`.
import { createServer } from 'node:http';

import { loadEnvConfig } from '@next/env';
import next from 'next';

const dev = process.env.NODE_ENV !== 'production';
// Load .env before anything reads NEXTAUTH_SECRET / DATABASE_URL.
loadEnvConfig(process.cwd(), dev);

const port = Number(process.env.PORT ?? 3000);
const hostname = 'localhost';
// Behind a reverse proxy set BIND_HOST=127.0.0.1 so the app port is never reachable from outside.
const bindHost = process.env.BIND_HOST || undefined;

async function main() {
  // Imported after loadEnvConfig: Prisma reads DATABASE_URL on first use.
  const { attachSocketServer } = await import('./src/lib/socket/server');
  const { startMusicBot } = await import('./src/bot');
  const { startVoicePresence } = await import('./src/services/voice-presence');

  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const httpServer = createServer((req, res) => void handle(req, res));
  attachSocketServer(httpServer);
  // After the socket server: the bot announces its state through it.
  await startMusicBot();
  startVoicePresence();

  httpServer.listen(port, bindHost, () => {
    console.log(`> Hazır: http://${bindHost ?? hostname}:${port} (${dev ? 'development' : 'production'})`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
