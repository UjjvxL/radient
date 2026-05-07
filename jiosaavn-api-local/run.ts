/**
 * Radient — JioSaavn API Runner
 * Starts the Hono app on port 3001 using @hono/node-server
 */
import { serve } from '@hono/node-server'
import { AlbumController, ArtistController, SearchController, SongController } from './src/modules/index.ts'
import { PlaylistController } from './src/modules/playlists/controllers/index.ts'
import { App } from './src/app.ts'

const app = new App([
  new SearchController(),
  new SongController(),
  new AlbumController(),
  new ArtistController(),
  new PlaylistController()
]).getApp()

const PORT = 3001

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`🎵 JioSaavn API running on http://localhost:${info.port}`)
})
