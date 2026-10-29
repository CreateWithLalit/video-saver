# Video Saver

A modern, responsive full-stack React web application for saving videos and audio from YouTube and Instagram.

## Features

- **Direct URL Input**: Paste YouTube or Instagram video and reel links with one-click clipboard support.
- **Video Inspection & Preview**: Fetches title, channel/uploader name, duration, and high-resolution thumbnail preview.
- **Quality Selector**: Choose your preferred video resolution (Best, 1080p, 720p, 480p, 360p) or extract audio only as an MP3 (320 kbps).
- **Real-Time Progress Streaming**: Monitored download progress with live percentage, download speed (MB/s), ETA calculation, and stage tracking via Server-Sent Events (SSE).
- **Device Downloads**: Save downloaded media directly to your local computer or phone with the "Save to device" button.
- **Download History**: Keep track of recent downloads and re-download completed files anytime during your session.

## Architecture & Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Lucide icons, Framer Motion.
- **Backend / Dev Server**: Express with Vite middleware in development, RESTful API and SSE endpoints for jobs and events.
- **Media Engine**: FFmpeg for media encoding, audio extraction, and packaging.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open `http://localhost:3000` in your browser.
