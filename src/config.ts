import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  jiosaavnApi: 'http://localhost:3001',

  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID || '',
    redirectUri: process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:3000/auth/spotify/callback',
    scopes: ['playlist-read-private', 'playlist-read-collaborative', 'user-library-read'],
  },

  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },

  encryption: {
    key: process.env.TOKEN_ENCRYPTION_KEY || '',
  },

  sync: {
    intervalMinutes: 60,       // How often to poll synced playlists
    maxConsecutiveFailures: 5,  // Disable sync after N failures
  },

  matching: {
    autoAcceptThreshold: 0.85,
    youtubeThreshold: 0.45,
    manualReviewThreshold: 0.40,
    batchSize: 10,
  },
};
