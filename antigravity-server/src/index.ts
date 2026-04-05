import { serve } from '@hono/node-server';
import { app } from './app.js';

// dotenv (ローカル開発用)
// クラウド環境では環境変数がホスト側から注入されるため不要
try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch {
  // dotenv がない環境では無視
}

const port = Number(process.env.PORT ?? 3001);

console.log(`[antigravity-server] starting on port ${port}`);

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, () => {
  console.log(`[antigravity-server] ready → http://localhost:${port}`);
  console.log(`  GET http://localhost:${port}/health`);
  console.log(`  GET http://localhost:${port}/market-snapshot`);
});
