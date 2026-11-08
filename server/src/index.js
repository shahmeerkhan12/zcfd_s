import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { menu } from '../data-mock/menu.js';
import { seedDatabase } from './database/database.js';
import { orderRouter } from './modules/orders/routes.js';
import { suggestionsRouter } from './modules/suggestions/routes.js';
import { llmRouter } from './modules/llm/routes.js';
import { restaurantsRouter } from './modules/restaurants/routes.js';

seedDatabase(menu)


export function createApp() {
  const app = express();
  app.use(express.json({ limit: '10kb' }));
  app.use('/api/orders', orderRouter);
  app.use('/api/suggestions', suggestionsRouter);
  app.use('/api/llm', llmRouter);
  app.use('/api/restaurants', restaurantsRouter);
  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok', mode: 'demo' });
  });

  
  
 

  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApp()
  const port = Number(process.env.PORT) || 3000
  app.listen(port, () => {
    console.log(`Demo food delivery API listening on http://localhost:${port}`)
  })
}
