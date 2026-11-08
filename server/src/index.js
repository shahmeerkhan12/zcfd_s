import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { menu } from '../data-mock/menu.js';
import { seedDatabase } from './database/database.js';
import { orderRouter } from './modules/orders/routes.js';
import { suggestionsRouter } from './modules/suggestions/routes.js';
<<<<<<< HEAD
=======
import { llmRouter } from './modules/llm/routes.js';
import { restaurantsRouter } from './modules/restaurants/routes.js';
>>>>>>> 0ef0f656d58cf159f9148f5655e3a92243de1208

seedDatabase(menu)


export function createApp() {
  const app = express();
  app.use(express.json({ limit: '10kb' }));
  app.use('/api/orders', orderRouter);
<<<<<<< HEAD
  app.use('/api/suggestions', suggestionsRouter)
=======
  app.use('/api/suggestions', suggestionsRouter);
  app.use('/api/llm', llmRouter);
  app.use('/api/restaurants', restaurantsRouter);
>>>>>>> 0ef0f656d58cf159f9148f5655e3a92243de1208
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
