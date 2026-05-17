const express = require('express');
const axios = require('axios');
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
    let thumbnail = video.thumbnail || (video.thumbnails && video.thumbnails[0] && video.thumbnails[0].url) || null;

    let formats = Array.isArray(video.formats) ? video.formats : [];
    console.log(`[${requestId}] Total formats from metadata: ${formats.length}`);

    if (!thumbnail && formats.length) {
      const imageFormat = formats.find((format) => /\.(jpe?g|png|webp|gif|svg)(\?.*)?$/i.test(format.url));
      if (imageFormat) {
        thumbnail = imageFormat.url;
      }
    }

    // Filter out subtitle/caption formats and storyboards
    formats = formats.filter(f => {
      // Skip if no URL
      if (!f.url) return false;
      // Skip if DRM protected
      if (f.drm) return false;
      // Skip m3u8 streams
      if (f.protocol?.startsWith('m3u8')) return false;
      // Skip storyboard formats (these are MHTML storyboards)
      if (f.ext === 'mhtml') return false;
      // Skip subtitle/caption formats
      if (['srt', 'vtt', 'json3', 'srv1', 'srv2', 'srv3', 'ttml'].includes(f.ext)) return false;
      // Keep anything else (audio, video, or other downloadable formats)
      return true;
    });

    console.log(`[${requestId}] Formats after filtering: ${formats.length}`);

    const downloads = formats
      .map((format) => {
        const quality = format.height ? `${format.height}p` : format.abr ? `${format.abr}kbps` : format.format || 'best';
        const ext = format.ext || 'mp4';

        return {
          id: format.format_id || `${ext}_${quality}`,
          quality,
          ext,
          filesize: typeof format.filesize === 'number' ? format.filesize : null,
          url: format.url,
          note: format.format_note || format.format || ''
        };
      })
      .filter((format, index, all) => {
        const label = `${format.quality}_${format.ext}`;
        return all.findIndex((item) => `${item.quality}_${item.ext}` === label) === index;
      })
      .sort((a, b) => {
        const aScore = parseInt(a.quality, 10) || 0;
        const bScore = parseInt(b.quality, 10) || 0;
        return bScore - aScore;
      })
      .slice(0, 8);

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

router.get('/file/:id', async (req, res) => {
  const { id } = req.params;
  const { url, title, ext } = req.query;
  const requestId = Math.random().toString(36).substring(7);

  console.log(`[${requestId}] Download file request - ID: ${id}, Ext: ${ext}`);

  if (!url || !title || !ext) {
    console.log(`[${requestId}] Missing required parameters`);
    return res.status(400).json({ success: false, message: 'Missing required parameters.' });
  }

  try {
    // Decode the URL if it was encoded
    const decodedUrl = decodeURIComponent(url);
    console.log(`[${requestId}] Starting download from: ${decodedUrl.substring(0, 100)}...`);

    // Set content type based on file extension
    const contentType = ext === 'mp4' ? 'video/mp4' :
                       ext === 'webm' ? 'video/webm' :
                       ext === 'mp3' ? 'audio/mpeg' :
                       ext === 'm4a' ? 'audio/mp4' :
                       ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
                       ext === 'png' ? 'image/png' :
                       'application/octet-stream';

    // Sanitize filename - remove special characters that could cause issues
    const sanitizedTitle = title.replace(/[^a-zA-Z0-9\s\-_]/g, '').replace(/\s+/g, '_').trim();
    const filename = `${sanitizedTitle}.${ext}`;

    // Set headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

    // Stream the file from the source URL with proper options
    const response = await axios({
      method: 'GET',
      url: decodedUrl,
      responseType: 'stream',
      timeout: 60000, // 60 second timeout for large files
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': decodedUrl
      }
    });

    console.log(`[${requestId}] Stream started, file size: ${response.headers['content-length'] || 'unknown'}`);

    // Pipe the response stream to the client
    response.data.pipe(res);

    // Handle errors during streaming
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
