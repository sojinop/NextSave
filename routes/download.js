const express = require('express');
const axios = require('axios');
const { spawn } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const { detectPlatform, isSupportedUrl } = require('../utils/urlValidator');
const { fetchMediaInfo, checkYtDlp } = require('../utils/yt-dlp');
const { extractInstagramMedia } = require('../utils/instagramExtractor');

const router = express.Router();

router.post('/', async (req, res) => {
  const { url } = req.body;
  const requestId = Math.random().toString(36).substring(7);

  console.log(`[${requestId}] Processing download request for URL: ${url}`);

  if (!url || typeof url !== 'string') {
    console.log(`[${requestId}] Invalid request payload`);
    return res.status(400).json({ success: false, message: 'Invalid request payload.' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url.trim());
  } catch (error) {
    console.log(`[${requestId}] Invalid URL format: ${error.message}`);
    return res.status(400).json({ success: false, message: 'Please provide a valid URL.' });
  }

  if (!isSupportedUrl(parsedUrl)) {
    console.log(`[${requestId}] Unsupported URL: ${parsedUrl.hostname}`);
    return res.status(400).json({
      success: false,
      message: 'Unsupported URL. Supported platforms: YouTube, Instagram, Facebook, X/Twitter.'
    });
  }

  const platform = detectPlatform(parsedUrl);
  console.log(`[${requestId}] Detected platform: ${platform}`);

  try {
    let metadata;

    // Prefer yt-dlp (fetchMediaInfo) for all platforms including Instagram.
    // This restores the previous stable behavior where yt-dlp is the primary extractor.
    try {
      console.log(`[${requestId}] Attempting yt-dlp extraction...`);
      metadata = await fetchMediaInfo(parsedUrl.toString());
      console.log(`[${requestId}] yt-dlp extraction successful`);
    } catch (ytdlpError) {
      console.log(`[${requestId}] yt-dlp extraction failed: ${ytdlpError.message}`);
      // As a lightweight, production-safe fallback, try the Instagram-specific extractor only for Instagram URLs
      if (platform === 'Instagram') {
        try {
          console.log(`[${requestId}] Falling back to Instagram extractor...`);
          metadata = await extractInstagramMedia(parsedUrl.toString());
          console.log(`[${requestId}] Instagram extractor succeeded as fallback`);
        } catch (instagramError) {
          console.error(`[${requestId}] Both yt-dlp and Instagram extractor failed`);
          throw instagramError;
        }
      } else {
        throw ytdlpError;
      }
    }

    // If Instagram extractor returned only image thumbnail/formats and no video formats, try yt-dlp as fallback
    if (platform === 'Instagram' && metadata) {
      const metaFormats = Array.isArray(metadata.formats)
        ? metadata.formats
        : (Array.isArray(metadata.entries) && metadata.entries[0] && Array.isArray(metadata.entries[0].formats))
          ? metadata.entries[0].formats
          : [];

      const hasVideoFormat = Array.isArray(metaFormats) && metaFormats.some(f => {
        const ext = (f.ext || '').toLowerCase();
        const fmt = (f.format || '').toLowerCase();
        return ['mp4', 'webm', 'mov', 'mkv'].includes(ext) || fmt.includes('video');
      });

      if (!hasVideoFormat) {
        try {
          console.log(`[${requestId}] Instagram extractor returned no video formats, invoking yt-dlp fallback...`);
          const ytdlpMeta = await fetchMediaInfo(parsedUrl.toString());
          if (ytdlpMeta) {
            metadata = ytdlpMeta;
            console.log(`[${requestId}] yt-dlp fallback succeeded, formats: ${Array.isArray(metadata.formats) ? metadata.formats.length : (metadata.entries && metadata.entries[0] && metadata.entries[0].formats ? metadata.entries[0].formats.length : 0)}`);
          }
        } catch (e) {
          console.log(`[${requestId}] yt-dlp fallback failed: ${e.message}`);
        }
      }
    }

    if (!metadata) {
      throw new Error('No metadata returned from extractor');
    }

    console.log(`[${requestId}] Processing metadata...`);
    const video = Array.isArray(metadata.entries) ? metadata.entries[0] : metadata;

    const title = decodeHtmlEntities(video.title || 'Untitled');
    let thumbnail = extractBestThumbnail(video);

    let formats = Array.isArray(video.formats) ? video.formats : [];
    console.log(`[${requestId}] Total formats from metadata: ${formats.length}`);

    if (!thumbnail && formats.length) {
      const audioOrImageFormat = formats.find((format) => format.thumbnail || format.url);
      if (audioOrImageFormat) {
        thumbnail = audioOrImageFormat.thumbnail || audioOrImageFormat.url;
      }
    }

    if (thumbnail && isValidThumbnailUrl(thumbnail)) {
      thumbnail = `/api/thumbnail?url=${encodeURIComponent(thumbnail)}`;
    }

    // Filter out subtitle/caption formats, storyboards, DASH-only assets, and unsupported streams
    formats = formats.filter(f => {
      if (!f.url) return false;
      if (f.drm) return false;
      if (f.protocol?.startsWith('m3u8')) return false;
      if (f.protocol?.toLowerCase().includes('dash')) return false;
      if (f.ext === 'mhtml') return false;
      if (['srt', 'vtt', 'json3', 'srv1', 'srv2', 'srv3', 'ttml'].includes((f.ext || '').toLowerCase())) return false;
      if (/dash/i.test(f.format || '') || /video only/i.test(f.format || '')) return false;
      return true;
    });

    console.log(`[${requestId}] Formats after filtering: ${formats.length}`);

    const getFormatScore = (format) => {
      const height = parseInt(format.height, 10) || 0;
      const abr = parseInt(format.abr, 10) || 0;
      return height * 1000 + abr;
    };

    const isMergedMp4 = (format) => {
      const ext = (format.ext || '').toLowerCase();
      const formatText = (format.format || '').toLowerCase();
      const hasVideo = format.vcodec !== 'none' && !/audio only/i.test(formatText);
      const hasAudio = (typeof format.acodec === 'undefined' || format.acodec !== 'none') && !/video only/i.test(formatText);
      return ext === 'mp4' && hasVideo && hasAudio;
    };

    const isAudioOnly = (format) => {
      const ext = (format.ext || '').toLowerCase();
      const formatText = (format.format || '').toLowerCase();
      const audioOnlyHint = /audio only/i.test(formatText) || (format.vcodec === 'none' && format.acodec && format.acodec !== 'none');
      return audioOnlyHint && ['mp3', 'm4a', 'ogg', 'wav', 'aac'].includes(ext);
    };

    const hasAudioCodec = (format) => {
      return (typeof format.acodec === 'undefined' || format.acodec !== 'none') && format.acodec;
    };

    const mp4Candidates = formats
      .filter(isMergedMp4)
      .sort((a, b) => getFormatScore(b) - getFormatScore(a));

    // For audio: prioritize audio-only, then fallback to formats with audio track
    const audioCandidates = formats
      .filter((format) => isAudioOnly(format) || hasAudioCodec(format))
      .sort((a, b) => getFormatScore(b) - getFormatScore(a));

    const bestMp4 = mp4Candidates[0] || null;
    const bestAudio = audioCandidates[0] || null;

    const downloads = [];
    if (bestMp4) {
      downloads.push({
        id: bestMp4.format_id || `mp4_${bestMp4.height || 'best'}`,
        quality: bestMp4.height ? `${bestMp4.height}p` : 'Best',
        ext: 'mp4',
        filesize: typeof bestMp4.filesize === 'number' ? bestMp4.filesize : null,
        url: bestMp4.url,
        note: bestMp4.format_note || bestMp4.format || 'Best video with audio'
      });
    }
    if (bestAudio) {
      downloads.push({
        id: bestAudio.format_id || `mp3_${bestAudio.abr || 'audio'}`,
        quality: bestAudio.abr ? `${bestAudio.abr}kbps` : 'Audio',
        ext: 'mp3',
        srcExt: bestAudio.ext || '',
        filesize: typeof bestAudio.filesize === 'number' ? bestAudio.filesize : null,
        url: bestAudio.url,
        note: bestAudio.format_note || bestAudio.format || 'Audio track'
      });
    } else if (bestMp4) {
      // If no audio-only format found but best MP4 has audio, create MP3 from video
      downloads.push({
        id: `mp3_from_video_${bestMp4.format_id}`,
        quality: 'Audio',
        ext: 'mp3',
        srcExt: 'mp4',
        filesize: null,
        url: bestMp4.url,
        note: 'Audio extracted from video'
      });
    }

    console.log(`[${requestId}] Final download options: ${downloads.length}`);
    if (downloads.length > 0) {
      console.log(`[${requestId}] Top format: ${downloads[0].quality} ${downloads[0].ext}`);
    }

    if (!downloads.length) {
      console.warn(`[${requestId}] No downloadable formats found`);
      return res.status(422).json({
        success: false,
        message: 'Unable to extract downloadable media for this URL. Please try a different link.'
      });
    }

    let mediaType = 'Video';
    const hasVideo = downloads.some((item) => ['mp4', 'webm', 'mov', 'mkv'].includes(item.ext));
    const hasImage = downloads.some((item) => ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(item.ext));
    const hasAudio = downloads.some((item) => ['mp3', 'm4a', 'wav', 'ogg', 'aac'].includes(item.ext));

    if (hasVideo) {
      mediaType = 'Video';
    } else if (hasAudio && !hasVideo) {
      mediaType = 'Audio';
    } else if (hasImage && !hasVideo) {
      mediaType = 'Image';
    } else {
      const baseExt = (video.ext || '').toLowerCase();
      if (['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(baseExt)) {
        mediaType = 'Image';
      } else if (['mp3', 'm4a', 'wav', 'ogg'].includes(baseExt)) {
        mediaType = 'Audio';
      } else if (video.vcodec === 'none' && video.acodec !== 'none') {
        mediaType = 'Audio';
      } else if (video.vcodec === 'none' && video.acodec === 'none') {
        mediaType = 'Image';
      }
    }

    console.log(`[${requestId}] Response ready - Title: ${title}, Type: ${mediaType}, Formats: ${downloads.length}`);

    return res.json({
      success: true,
      platform,
      title,
      thumbnail,
      mediaType,
      downloads
    });
  } catch (error) {
    console.error(`[${requestId}] Error: ${error.message || error}`);
    console.error(`[${requestId}] Stack trace:`, error.stack);
    return res.status(500).json({
      success: false,
      message: 'Unable to process the link right now. Please try again later.'
    });
  }
});

function decodeHtmlEntities(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function isImageUrl(url) {
  return typeof url === 'string' && /\.(jpe?g|png|webp|gif|svg)(\?.*)?$/i.test(url);
}

function isValidThumbnailUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

function extractBestThumbnail(video) {
  // Priority 1: thumbnails array (most reliable)
  if (Array.isArray(video.thumbnails)) {
    for (let thumb of video.thumbnails) {
      if (thumb && thumb.url && isValidThumbnailUrl(thumb.url)) {
        return thumb.url;
      }
    }
  }
  // Priority 2: display_url (Instagram-specific)
  if (video.display_url && isValidThumbnailUrl(video.display_url)) {
    return video.display_url;
  }
  if (video.displayUrl && isValidThumbnailUrl(video.displayUrl)) {
    return video.displayUrl;
  }
  // Priority 3: thumbnail
  if (video.thumbnail && isValidThumbnailUrl(video.thumbnail)) {
    return video.thumbnail;
  }
  if (video.thumbnail_url && isValidThumbnailUrl(video.thumbnail_url)) {
    return video.thumbnail_url;
  }
  return null;
}

router.get('/thumbnail', async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ success: false, message: 'Missing thumbnail url' });
  }

  const decodedUrl = decodeURIComponent(url);
  if (!/^https?:\/\//i.test(decodedUrl)) {
    return res.status(400).json({ success: false, message: 'Invalid thumbnail url' });
  }

  try {
    const response = await axios({
      method: 'GET',
      url: decodedUrl,
      responseType: 'stream',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/605.1.15',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.instagram.com/'
      }
    });

    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    response.data.pipe(res);
  } catch (error) {
    console.error('Thumbnail proxy error:', error.message);
    res.status(500).json({ success: false, message: 'Unable to load thumbnail' });
  }
});

router.get('/file/:id', async (req, res) => {
  const { id } = req.params;
  const { url, title, ext, srcExt } = req.query;
  const requestId = Math.random().toString(36).substring(7);

  console.log(`[${requestId}] Download file request - ID: ${id}, Ext: ${ext}, srcExt: ${srcExt || 'unknown'}`);

  if (!url || !title || !ext) {
    console.log(`[${requestId}] Missing required parameters`);
    return res.status(400).json({ success: false, message: 'Missing required parameters.' });
  }

  try {
    const decodedUrl = decodeURIComponent(url);
    const sourceExt = (srcExt || '').toLowerCase();
    console.log(`[${requestId}] Starting download from: ${decodedUrl.substring(0, 100)}...`);

    const contentType = ext === 'mp4' ? 'video/mp4' :
                       ext === 'webm' ? 'video/webm' :
                       ext === 'mp3' ? 'audio/mpeg' :
                       ext === 'm4a' ? 'audio/mp4' :
                       ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
                       ext === 'png' ? 'image/png' :
                       'application/octet-stream';

    const sanitizedTitle = title.replace(/[^a-zA-Z0-9\s\-_]/g, '').replace(/\s+/g, '_').trim();
    const filename = `${sanitizedTitle}.${ext}`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

    if (ext === 'mp3' && sourceExt !== 'mp3') {
      await streamAudioAsMp3(decodedUrl, res, requestId);
      return;
    }

    const response = await axios({
      method: 'GET',
      url: decodedUrl,
      responseType: 'stream',
      timeout: 60000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': decodedUrl
      }
    });

    console.log(`[${requestId}] Stream started, file size: ${response.headers['content-length'] || 'unknown'}`);
    response.data.pipe(res);
    response.data.on('error', (error) => {
      console.error(`[${requestId}] Stream error:`, error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Download failed during streaming.' });
      }
    });
  } catch (error) {
    console.error(`[${requestId}] Download proxy error: ${error.message}`);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Unable to download the file. Please try again.' });
    }
  }
});

async function streamAudioAsMp3(sourceUrl, res, requestId) {
  try {
    const ffmpegProcess = spawn(ffmpeg, [
      '-i', 'pipe:0',
      '-f', 'mp3',
      '-codec:a', 'libmp3lame',
      '-q:a', '4',
      'pipe:1'
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    ffmpegProcess.on('error', (error) => {
      console.error(`[${requestId}] FFmpeg error:`, error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Audio conversion failed.' });
      }
    });

    const response = await axios({
      method: 'GET',
      url: sourceUrl,
      responseType: 'stream',
      timeout: 60000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': sourceUrl
      }
    });

    response.data.pipe(ffmpegProcess.stdin);
    res.setHeader('Content-Type', 'audio/mpeg');
    ffmpegProcess.stdout.pipe(res);

    ffmpegProcess.stderr.on('data', (chunk) => {
      console.log(`[${requestId}] FFmpeg: ${chunk.toString().trim()}`);
    });

    ffmpegProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`[${requestId}] FFmpeg exited with code ${code}`);
      }
    });
  } catch (error) {
    console.error(`[${requestId}] Audio conversion proxy error: ${error.message}`);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Unable to convert audio to MP3.' });
    }
  }
}

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    const ytdlpAvailable = await checkYtDlp();
    res.json({
      success: true,
      status: 'healthy',
      ytdlp: ytdlpAvailable ? 'available' : 'unavailable',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

module.exports = router;
