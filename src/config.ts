import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  jiosaavnApi: 'http://localhost:3001',

  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID || 'a2a0f8d7cb0e4d879a3953e81654f5d0',
    redirectUri: process.env.SPOTIFY_REDIRECT_URI || 'https://radient-production.up.railway.app/auth/spotify/callback',
    scopes: ['playlist-read-private', 'playlist-read-collaborative', 'user-library-read'],
  },

  redis: {
    url: process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL || '',
    host: process.env.REDISHOST || process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDISPORT || process.env.REDIS_PORT || '6379'),
    password: process.env.REDISPASSWORD || process.env.REDIS_PASSWORD || '',
  },

  encryption: {
    key: process.env.TOKEN_ENCRYPTION_KEY || 'aaada91681d5186866369a9f097e0c415962ae819495cbca98bd73812e9699e8',
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
