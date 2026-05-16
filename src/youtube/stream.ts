import { Router } from 'express';
import ytdl from '@distube/ytdl-core';

const router = Router();

router.get('/:videoId', async (req, res) => {
  const { videoId } = req.params;

  if (!videoId) {
    return res.status(400).send('Missing video ID');
  }

  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Validate ID
    if (!ytdl.validateID(videoId) && !ytdl.validateURL(url)) {
      return res.status(400).send('Invalid video ID');
    }

    // Set headers for audio streaming
    res.header('Content-Type', 'audio/webm');
    res.header('Transfer-Encoding', 'chunked');

    // Get the stream
    const stream = ytdl(url, {
      filter: 'audioonly',
      quality: 'highestaudio',
      highWaterMark: 1 << 25 // 32MB buffer to prevent throttling
    });

    // Handle stream errors
    stream.on('error', (err) => {
      console.error('[YouTube Stream Error]', err);
      if (!res.headersSent) {
        res.status(500).send('Failed to stream audio');
      } else {
        res.end();
      }
    });

    // Pipe the audio stream to the client response
    stream.pipe(res);

  } catch (error: any) {
    console.error('[YouTube Stream Request Error]', error);
    if (!res.headersSent) {
      res.status(500).send('Internal Server Error');
    }
  }
});

export default router;
