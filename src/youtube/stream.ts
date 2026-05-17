import { Router } from 'express';

const router = Router();

// List of public Invidious instances (fallbacks)
const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://invidious.jing.rocks',
  'https://iv.datura.network',
];

async function getAudioUrl(videoId: string): Promise<string | null> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${instance}/api/v1/videos/${videoId}`, {
        headers: { 'User-Agent': 'Radient/2.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;

      const data = await res.json();
      const formats = data.adaptiveFormats || [];

      // Find the best audio-only format
      const audioFormats = formats
        .filter((f: any) => f.type?.startsWith('audio/'))
        .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

      if (audioFormats.length > 0) {
        return audioFormats[0].url;
      }
    } catch (err: any) {
      console.warn(`[YouTube] Invidious instance ${instance} failed:`, err.message);
    }
  }
  return null;
}

// Redirect to the direct audio URL (simpler, less bandwidth on our server)
router.get('/:videoId', async (req, res) => {
  const { videoId } = req.params;

  if (!videoId || videoId.length < 5) {
    return res.status(400).send('Missing or invalid video ID');
  }

  try {
    const audioUrl = await getAudioUrl(videoId);

    if (!audioUrl) {
      return res.status(404).json({ error: 'No audio stream found for this video' });
    }

    // Redirect the client directly to the audio URL
    res.redirect(audioUrl);

  } catch (error: any) {
    console.error('[YouTube Stream Error]', error.message);
    if (!res.headersSent) {
      res.status(500).send('Failed to get audio stream');
    }
  }
});

export default router;
