const express = require('express');
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

module.exports = router;
