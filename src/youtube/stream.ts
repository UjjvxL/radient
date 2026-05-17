import { Router, Request, Response } from 'express';
// @ts-ignore
import ytdl from '@distube/ytdl-core';

const router = Router();

router.get('/:videoId', async (req: Request, res: Response) => {
  const { videoId } = req.params;

  if (!videoId || videoId.length < 5) {
    return res.status(400).send('Missing or invalid video ID');
  }

  const url = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    // Get video info and find the best audio-only format
    const info = await ytdl.getInfo(url, {
      requestOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        }
      }
    });

    const formats = ytdl.filterFormats(info.formats, 'audioonly');
    if (!formats || formats.length === 0) {
      return res.status(404).json({ error: 'No audio stream found for this video' });
    }

    // Pick highest quality audio
    const best = formats.sort((a: any, b: any) => (b.audioBitrate || 0) - (a.audioBitrate || 0))[0];
    
    // Redirect directly to the CDN URL — zero server bandwidth used
    if (best.url) {
      return res.redirect(best.url);
    }

    return res.status(404).json({ error: 'No audio URL found' });

  } catch (error: any) {
    console.error('[YouTube Stream Error]', error.message);
    if (!res.headersSent) {
      res.status(500).send('Failed to get audio stream: ' + error.message);
    }
  }
});

export default router;
