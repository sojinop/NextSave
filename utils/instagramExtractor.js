const axios = require('axios');

// Try to load optional Instagram scrapers
let dlcore, instaGrab, igUrl;
try {
  dlcore = require('sadaslk-dlcore');
} catch (e) {
  dlcore = null;
}
try {
  // bochilteam scraper is default export
  const scraperModule = require('@bochilteam/scraper-instagram');
  instaGrab = scraperModule.default || scraperModule;
} catch (e) {
  instaGrab = null;
}
try {
  igUrl = require('instagram-get-url');
} catch (e) {
  igUrl = null;
}

// Instagram URL extraction with multiple fallback strategies
async function extractInstagramMedia(url) {
  try {
    console.log(`[Instagram] Attempting to extract from: ${url}`);
    
    // Extract the shortcode from Instagram URL
    const match = url.match(/instagram\.com\/(p|reel|tv|stories)\/([a-zA-Z0-9_-]+)/);
    if (!match) {
      throw new Error('Invalid Instagram URL format');
    }

    const code = match[2];
    const type = match[1];
    console.log(`[Instagram] Media code: ${code}, type: ${type}`);

    // Try dlcore scraper first (sadaslk-dlcore)
    if (dlcore && typeof dlcore.instagram === 'function') {
      try {
        console.log(`[Instagram] Trying dlcore scraper...`);
        const result = await dlcore.instagram(url);
        if (result && (result.url || result.thumbnail)) {
          const parsed = parseInstagramResult(result, code);
          if (parsed.thumbnail) {
            return parsed;
          }
          console.log(`[Instagram] dlcore result has no preview thumbnail, continuing fallback...`);
        }
      } catch (error) {
        console.log(`[Instagram] dlcore failed: ${error.message}`);
      }
    }

    // Try bochilteam scraper
    if (instaGrab && typeof instaGrab === 'function') {
      try {
        console.log(`[Instagram] Trying bochilteam scraper...`);
        const result = await instaGrab(url);
        if (result && (result.url || result.data)) {
          const parsed = parseInstagramResult(result, code);
          if (parsed.thumbnail) {
            return parsed;
          }
          console.log(`[Instagram] bochilteam result has no preview thumbnail, continuing fallback...`);
        }
      } catch (error) {
        console.log(`[Instagram] bochilteam scraper failed: ${error.message}`);
      }
    }

    // Try instagram-get-url
    if (igUrl && typeof igUrl === 'function') {
      try {
        console.log(`[Instagram] Trying instagram-get-url...`);
        const result = await igUrl(url);
        if (result && result.url) {
          const parsed = parseInstagramResult(result, code);
          if (parsed.thumbnail) {
            return parsed;
          }
          console.log(`[Instagram] instagram-get-url result has no preview thumbnail, continuing fallback...`);
        }
      } catch (error) {
        console.log(`[Instagram] instagram-get-url failed: ${error.message}`);
      }
    }

    // Try oEmbed endpoint (more robust)
    try {
      console.log(`[Instagram] Trying oEmbed endpoint...`);
      return await tryOEmbed(url, code);
    } catch (error) {
      console.log(`[Instagram] oEmbed failed: ${error.message}`);
    }

    // Try meta tags as last resort
    try {
      console.log(`[Instagram] Trying HTML meta tags...`);
      return await tryMetaTags(url, code);
    } catch (error) {
      console.log(`[Instagram] Meta tags failed: ${error.message}`);
    }

    throw new Error('All Instagram extraction methods failed');
    
  } catch (error) {
    console.error(`[Instagram] Extraction failed: ${error.message}`);
    throw new Error(`Instagram extraction failed: ${error.message}`);
  }
}

function parseInstagramResult(result, code) {
  console.log(`[Instagram] Parsing result...`);

  const formats = [];
  let title = 'Instagram Media';
  let thumbnail = null;

  const maybeSetThumbnail = (url) => {
    if (!thumbnail && isImageUrl(url)) {
      thumbnail = url;
    }
  };

  const addFormat = (url, format, ext, formatId) => {
    if (!url) return;
    const normalizedExt = ext || (isVideoUrl(url) ? 'mp4' : isImageUrl(url) ? 'jpg' : 'mp4');
    const normalizedFormat = format || (normalizedExt === 'jpg' ? 'Image' : 'Video');

    formats.push({
      format_id: formatId || `${normalizedExt}_${formats.length}`,
      ext: normalizedExt,
      url: url,
      format: normalizedFormat
    });

    if (isImageUrl(url)) {
      maybeSetThumbnail(url);
    }
  };

  const hasVideoFormat = () => formats.some((item) => ['mp4', 'webm', 'mov', 'mkv'].includes(item.ext));
  const typeHint = typeof result.type === 'string' ? result.type.toLowerCase() : '';

  const decodedCaption = decodeHtmlEntities(result.caption || result.title || '');
  if (decodedCaption) {
    title = decodedCaption;
  }

  if (result.data && Array.isArray(result.data)) {
    result.data.forEach((item, i) => {
      if (!item.url) return;
      const itemType = typeof item.type === 'string' ? item.type.toLowerCase() : '';
      const ext = itemType === 'video'
        ? 'mp4'
        : itemType === 'image'
          ? 'jpg'
          : isImageUrl(item.url)
            ? 'jpg'
            : isVideoUrl(item.url)
              ? 'mp4'
              : 'mp4';

      addFormat(item.url, itemType === 'video' ? 'Video' : 'Image', ext, `data_${i}`);

      if (item.thumbnail && isImageUrl(item.thumbnail)) {
        maybeSetThumbnail(item.thumbnail);
      }
    });
  }

  if (result.url) {
    const url = result.url;
    const urlLooksLikeImage = isImageUrl(url);
    const urlLooksLikeVideo = isVideoUrl(url);
    const isVideo = typeHint === 'video' || urlLooksLikeVideo;
    const isImage = typeHint === 'image' || urlLooksLikeImage;

    if (!(urlLooksLikeImage && hasVideoFormat())) {
      addFormat(url, isVideo ? 'Video' : isImage ? 'Image' : 'Media', isImage ? 'jpg' : 'mp4', '0');
    }

    if (result.thumbnail && isImageUrl(result.thumbnail)) {
      thumbnail = result.thumbnail;
    } else if (!thumbnail && urlLooksLikeImage) {
      thumbnail = url;
    }
  }

  if (result.thumbnail && isImageUrl(result.thumbnail)) {
    thumbnail = result.thumbnail;
  }

  if (!thumbnail) {
    const imageFormat = formats.find((item) => isImageUrl(item.url));
    if (imageFormat) {
      thumbnail = imageFormat.url;
    }
  }

  if (formats.length === 0) {
    throw new Error('Could not extract media URL from Instagram result');
  }

  return {
    id: code,
    title: title.substring(0, 100),
    thumbnail: thumbnail,
    ext: formats[0].ext,
    formats: formats
  };
}

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

function isVideoUrl(url) {
  return typeof url === 'string' && /\.(mp4|webm|mov|mkv)(\?.*)?$/i.test(url);
}

async function tryOEmbed(url, code) {
  const oembed = `https://www.instagram.com/oembed/?url=${encodeURIComponent(url)}`;
  
  const response = await axios({
    method: 'GET',
    url: oembed,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json'
    },
    timeout: 10000
  });

  // Accept any valid oEmbed response with either thumbnail_url or html
  if (response.data?.thumbnail_url || response.data?.html) {
    const thumbnail = response.data.thumbnail_url || extractThumbnailFromHTML(response.data.html);
    if (!thumbnail) {
      throw new Error('No thumbnail in oEmbed response');
    }

    return {
      id: code,
      title: response.data?.title || 'Instagram Media',
      thumbnail: thumbnail,
      ext: 'jpg',
      formats: [{
        format_id: '0',
        ext: 'jpg',
        url: thumbnail,
        format: 'Thumbnail'
      }]
    };
  }
  throw new Error('oEmbed response invalid or incomplete');
}

function extractThumbnailFromHTML(html) {
  if (!html) return null;
  const match = html.match(/src="([^"]*instagram[^"]*)"/) || html.match(/src="([^"]*\.(jpg|png|webp))/i);
  return match ? match[1] : null;
}

async function tryMetaTags(url, code) {
  const response = await axios({
    method: 'GET',
    url: url,
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.instagram.com/'
    },
    timeout: 10000
  });

  const titleMatch = response.data.match(/<meta property="og:title" content="([^"]+)"/);
  const imageMatch = response.data.match(/<meta property="og:image" content="([^"]+)"/);
  const videoMatch = response.data.match(/<meta property="og:video" content="([^"]+)"/);

  const title = titleMatch?.[1] || 'Instagram Media';
  const thumbnail = imageMatch?.[1];
  const videoUrl = videoMatch?.[1];

  if (!thumbnail && !videoUrl) {
    throw new Error('Could not extract media from HTML');
  }

  const formats = [];
  if (videoUrl) {
    formats.push({
      format_id: '0',
      ext: 'mp4',
      height: 720,
      width: 1280,
      url: videoUrl,
      format: 'Video'
    });
  }
  if (thumbnail) {
    formats.push({
      format_id: videoUrl ? '1' : '0',
      ext: 'jpg',
      height: 1080,
      width: 1080,
      url: thumbnail,
      format: 'Image'
    });
  }

  return {
    id: code,
    title: title.substring(0, 100),
    thumbnail: thumbnail || videoUrl,
    ext: videoUrl ? 'mp4' : 'jpg',
    formats: formats
  };
}

module.exports = { extractInstagramMedia };
