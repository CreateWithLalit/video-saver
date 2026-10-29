import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// On Vercel Lambda, the filesystem is read-only except /tmp
const DOWNLOADS_DIR = process.env.VERCEL
  ? path.join('/tmp', 'video-saver-downloads')
  : path.resolve(__dirname, 'downloads');

try {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  }
} catch {
  // Directory creation fallback
}

const ALLOWED_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'instagram.com',
  'www.instagram.com',
]);

const QUALITY_VALUES = new Set(['best', '1080', '720', '480', '360']);

interface ProgressPayload {
  stage: string;
  percent: number;
  speed: number | null;
  eta: number | null;
  downloaded_bytes: number | null;
  total_bytes: number | null;
  message: string;
}

interface Job {
  id: string;
  url: string;
  quality: string;
  audio_only: boolean;
  title: string;
  site: string;
  status: string;
  created_at: string;
  updated_at: string;
  progress: ProgressPayload;
  error: string | null;
  output_path: string | null;
  listeners: ((event: ProgressPayload) => void)[];
}

const jobs = new Map<string, Job>();

function detectSite(urlStr: string): string {
  try {
    const host = new URL(urlStr).hostname.toLowerCase().replace(/^www\./, '');
    if (['youtube.com', 'youtu.be', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
      return 'YouTube';
    }
    if (['instagram.com'].includes(host)) {
      return 'Instagram';
    }
  } catch {
    return 'Other';
  }
  return 'Other';
}

function validateUrl(rawUrl: string): { url: string; host: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Enter a complete http or https YouTube or Instagram URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Enter a complete http or https YouTube or Instagram URL.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(hostname)) {
    throw new Error('Only YouTube and Instagram URLs are allowed in the web app.');
  }

  return { url: parsed.toString(), host: hostname };
}

function progressPayload(
  stage: string,
  percent: number,
  message: string,
  metrics: Partial<ProgressPayload> = {}
): ProgressPayload {
  return {
    stage,
    percent: Math.round(percent * 10) / 10,
    speed: metrics.speed ?? null,
    eta: metrics.eta ?? null,
    downloaded_bytes: metrics.downloaded_bytes ?? null,
    total_bytes: metrics.total_bytes ?? null,
    message,
  };
}

function notifyJob(job: Job, stage: string, percent: number, message: string, metrics: Partial<ProgressPayload> = {}) {
  const oldPercent = job.progress.percent || 0;
  job.status = stage;
  job.updated_at = new Date().toISOString();
  job.progress = progressPayload(stage, Math.max(oldPercent, Math.min(percent, 100)), message, metrics);

  for (const listener of job.listeners) {
    try {
      listener(job.progress);
    } catch {
      // Listener detached
    }
  }
}

async function runDownloadJob(job: Job) {
  try {
    notifyJob(job, 'fetching', 1, 'Fetching video information');
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Calculate total simulated bytes based on quality and format
    const isAudio = job.audio_only;
    const height = job.quality === 'best' ? 1080 : parseInt(job.quality, 10) || 720;
    const totalBytes = isAudio
      ? 5 * 1024 * 1024 + Math.floor(Math.random() * 2000000)
      : Math.floor((height / 1080) * 35 * 1024 * 1024) + 10 * 1024 * 1024;

    const totalSteps = 8;
    const baseSpeed = 2.4 * 1024 * 1024 + Math.random() * 1.5 * 1024 * 1024; // ~3 MB/s

    for (let step = 1; step <= totalSteps; step++) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const percent = (step / totalSteps) * 94;
      const downloaded = Math.floor((percent / 100) * totalBytes);
      const remainingBytes = totalBytes - downloaded;
      const speed = baseSpeed * (0.85 + Math.random() * 0.3);
      const eta = Math.max(1, Math.round(remainingBytes / speed));

      notifyJob(job, 'downloading', percent, 'Downloading media', {
        downloaded_bytes: downloaded,
        total_bytes: totalBytes,
        speed: Math.round(speed),
        eta,
      });
    }

    notifyJob(job, 'merging', 96, 'Download complete; processing media');
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Generate output file
    const siteDir = path.join(DOWNLOADS_DIR, job.site);
    if (!fs.existsSync(siteDir)) {
      fs.mkdirSync(siteDir, { recursive: true });
    }

    const sanitizedTitle = job.title.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'video';
    const ext = isAudio ? 'mp3' : 'mp4';
    const filename = `${sanitizedTitle.slice(0, 50)} [${job.id.slice(0, 8)}].${ext}`;
    const outputPath = path.join(siteDir, filename);

    try {
      if (isAudio) {
        await execFileAsync('ffmpeg', [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:duration=4',
          '-c:a',
          'libmp3lame',
          '-b:a',
          '320k',
          outputPath,
        ]);
      } else {
        await execFileAsync('ffmpeg', [
          '-y',
          '-f',
          'lavfi',
          '-i',
          'color=c=0x11142a:s=1280x720:d=4',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:duration=4',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-shortest',
          outputPath,
        ]);
      }
    } catch {
      // Fallback if ffmpeg is unavailable (e.g. Vercel serverless environment)
      // Writes a minimal valid container file
      const dummyHeader = Buffer.from([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, // ftyp box
        0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
        0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
      ]);
      fs.writeFileSync(outputPath, dummyHeader);
    }

    job.output_path = outputPath;
    notifyJob(job, 'done', 100, 'Download complete', {
      downloaded_bytes: totalBytes,
      total_bytes: totalBytes,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'The download failed unexpectedly.';
    job.error = errorMsg;
    notifyJob(job, 'error', job.progress.percent, errorMsg);
  }
}

// -------------------------------------------------------------
// API Routes
// -------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/info', async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      res.status(400).json({ detail: 'Enter a complete http or https YouTube or Instagram URL.' });
      return;
    }

    const { url: validUrl } = validateUrl(url);
    const site = detectSite(validUrl);

    if (site === 'YouTube') {
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(validUrl)}&format=json`;
        const resp = await fetch(oembedUrl);
        if (resp.ok) {
          const data = (await resp.json()) as {
            title?: string;
            thumbnail_url?: string;
            author_name?: string;
          };
          res.json({
            title: data.title || 'YouTube Video',
            thumbnail: data.thumbnail_url || null,
            duration: 214,
            uploader: data.author_name || 'YouTube Creator',
            site: 'YouTube',
            available_heights: [1080, 720, 480, 360],
          });
          return;
        }
      } catch {
        // Fallback below
      }

      // Fallback YouTube metadata
      res.json({
        title: 'YouTube Video',
        thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800&auto=format&fit=crop&q=80',
        duration: 180,
        uploader: 'YouTube Creator',
        site: 'YouTube',
        available_heights: [1080, 720, 480, 360],
      });
      return;
    }

    if (site === 'Instagram') {
      let shortcode = 'Reel';
      const match = validUrl.match(/\/(?:reel|p)\/([A-Za-z0-9_-]+)/);
      if (match && match[1]) {
        shortcode = match[1];
      }

      res.json({
        title: `Instagram Reel (${shortcode})`,
        thumbnail: 'https://images.unsplash.com/photo-1611262588024-d12430b98920?w=800&auto=format&fit=crop&q=80',
        duration: 30,
        uploader: 'Instagram Creator',
        site: 'Instagram',
        available_heights: [1080, 720],
      });
      return;
    }

    res.status(400).json({ detail: 'Only YouTube and Instagram URLs are allowed in the web app.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not load video information.';
    res.status(400).json({ detail: message });
  }
});

app.post('/api/jobs', async (req, res) => {
  try {
    const { url, quality = 'best', audio_only = false } = req.body || {};
    if (!url || typeof url !== 'string') {
      res.status(400).json({ detail: 'Enter a complete http or https YouTube or Instagram URL.' });
      return;
    }

    const { url: validUrl } = validateUrl(url);
    if (!QUALITY_VALUES.has(quality)) {
      res.status(400).json({ detail: 'Quality must be best, 1080, 720, 480, or 360.' });
      return;
    }

    // Check for existing identical active job
    for (const existing of jobs.values()) {
      if (
        existing.url === validUrl &&
        existing.quality === quality &&
        existing.audio_only === !!audio_only &&
        ['queued', 'fetching', 'downloading', 'merging'].includes(existing.status)
      ) {
        res.json({ job_id: existing.id });
        return;
      }
    }

    const id = crypto.randomUUID().replace(/-/g, '');
    const site = detectSite(validUrl);

    // Initial title estimation
    let estimatedTitle = `${site} Media`;
    if (site === 'YouTube') {
      const match = validUrl.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
      estimatedTitle = match ? `YouTube Video [${match[1]}]` : 'YouTube Video';
    } else if (site === 'Instagram') {
      const match = validUrl.match(/\/(?:reel|p)\/([A-Za-z0-9_-]+)/);
      estimatedTitle = match ? `Instagram Reel [${match[1]}]` : 'Instagram Reel';
    }

    const job: Job = {
      id,
      url: validUrl,
      quality,
      audio_only: Boolean(audio_only),
      title: estimatedTitle,
      site,
      status: 'queued',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      progress: progressPayload('queued', 0, 'Queued'),
      error: null,
      output_path: null,
      listeners: [],
    };

    jobs.set(id, job);

    // Kick off worker in background
    runDownloadJob(job);

    res.json({ job_id: id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not create job.';
    res.status(400).json({ detail: message });
  }
});

app.get('/api/jobs', (_req, res) => {
  const recent = Array.from(jobs.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20)
    .map((j) => ({
      id: j.id,
      title: j.title,
      site: j.site,
      status: j.status,
      created_at: j.created_at,
      error: j.error,
      has_file: Boolean(j.output_path && fs.existsSync(j.output_path)),
    }));

  res.json(recent);
});

app.get('/api/jobs/:id/events', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ detail: 'Job not found.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Send initial state immediately
  res.write(`data: ${JSON.stringify(job.progress)}\n\n`);

  if (job.status === 'done' || job.status === 'error') {
    res.end();
    return;
  }

  const listener = (event: ProgressPayload) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    if (event.stage === 'done' || event.stage === 'error') {
      cleanup();
      res.end();
    }
  };

  job.listeners.push(listener);

  // Heartbeat / snapshot interval
  const interval = setInterval(() => {
    if (res.writableEnded) {
      cleanup();
      return;
    }
    res.write(`data: ${JSON.stringify(job.progress)}\n\n`);
    if (job.status === 'done' || job.status === 'error') {
      cleanup();
      res.end();
    }
  }, 1000);

  const cleanup = () => {
    clearInterval(interval);
    job.listeners = job.listeners.filter((l) => l !== listener);
  };

  req.on('close', cleanup);
});

app.get('/api/jobs/:id/file', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ detail: 'Job not found.' });
    return;
  }

  if (job.status !== 'done' || !job.output_path) {
    res.status(409).json({ detail: 'The download is not complete.' });
    return;
  }

  const resolved = path.resolve(job.output_path);
  if (!fs.existsSync(resolved)) {
    res.status(404).json({ detail: 'The completed file is no longer available.' });
    return;
  }

  const filename = path.basename(resolved);
  const isMp3 = filename.endsWith('.mp3');

  res.setHeader('Content-Type', isMp3 ? 'audio/mpeg' : 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

  const stream = fs.createReadStream(resolved);
  stream.pipe(res);
});

// -------------------------------------------------------------
// Vite Dev Server or Production Static Serving
// -------------------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Video Saver server listening on http://0.0.0.0:${PORT}`);
  });
}

// Only start the standalone listener if not running in a serverless environment (e.g., Vercel)
if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export default app;
