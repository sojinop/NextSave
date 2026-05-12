const express = require('express');
const axios = require('axios');
const { detectPlatform, isSupportedUrl } = require('../utils/urlValidator');
const { fetchMediaInfo } = require('../utils/yt-dlp');

const router = express.Router();

router.post('/', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, message: 'Invalid request payload.' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url.trim());
  } catch (error) {
    return res.status(400).json({ success: false, message: 'Please provide a valid URL.' });
  }

  if (!isSupportedUrl(parsedUrl)) {
    return res.status(400).json({
      success: false,
      message: 'Unsupported URL. Supported platforms: YouTube, Instagram, Facebook, X/Twitter.'
    });
  }

  const platform = detectPlatform(parsedUrl);

  try {
    const metadata = await fetchMediaInfo(parsedUrl.toString());
    const video = Array.isArray(metadata.entries) ? metadata.entries[0] : metadata;

    const title = video.title || 'Untitled';
    const thumbnail = video.thumbnail || (video.thumbnails && video.thumbnails[0] && video.thumbnails[0].url) || null;

    const formats = Array.isArray(video.formats) ? video.formats : [];
    const downloads = formats
      .filter((format) => format.url && !format.drm && !format.protocol?.startsWith('m3u8'))
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

    if (!downloads.length) {
      return res.status(422).json({
        success: false,
        message: 'Unable to extract downloadable media for this URL. Please try a different link.'
      });
    }

    return res.json({
      success: true,
      platform,
      title,
      thumbnail,
      downloads
    });
  } catch (error) {
    console.error('Download API error:', error.message || error);
    return res.status(500).json({
      success: false,
      message: 'Unable to process the link right now. Please try again later.'
    });
  }
});

router.get('/file/:id', async (req, res) => {
  const { id } = req.params;
  const { url, title, ext } = req.query;

  if (!url || !title || !ext) {
    return res.status(400).json({ success: false, message: 'Missing required parameters.' });
  }

  try {
    // Decode the URL if it was encoded
    const decodedUrl = decodeURIComponent(url);

    // Set content type based on file extension
    const contentType = ext === 'mp4' ? 'video/mp4' :
                       ext === 'webm' ? 'video/webm' :
                       ext === 'mp3' ? 'audio/mpeg' :
                       ext === 'm4a' ? 'audio/mp4' :
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

    // Pipe the response stream to the client
    response.data.pipe(res);

    // Handle errors during streaming
    response.data.on('error', (error) => {
      console.error('Stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Download failed during streaming.' });
      }
    });

  } catch (error) {
    console.error('Download proxy error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Unable to download the file. Please try again.' });
    }
  }
});

module.exports = router;
