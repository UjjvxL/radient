import { serve } from '@hono/node-server'
import app from './src/server.ts'

const port = 3001
console.log(`JioSaavn API local instance starting on http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port
})
