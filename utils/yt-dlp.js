const youtubeDl = require('youtube-dl-exec');
const ffmpeg = require('ffmpeg-static');

const MAX_YTDLP_RETRIES = 3;
const YOUTUBE_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchMediaInfo(url, attempt = 1) {
  try {
    console.log(`[yt-dlp] Extracting metadata from: ${url} (attempt ${attempt})`);

    const result = await youtubeDl(url, {
      dumpJson: true,
      noPlaylist: true,
      skipDownload: true,
      preferFreeFormats: true,
      ffmpegLocation: ffmpeg,
      userAgent: YOUTUBE_USER_AGENT,
      httpHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
      },
      extractorArgs: {
        youtube: [
          'player_client=web_html5',
          'player_client=web'
        ]
      },
      noWarnings: true,
      noCheckCertificate: true,
      noCallHome: true,
      quiet: true
    });

    console.log(`[yt-dlp] Successfully extracted: ${result?.title || 'unknown'}`);
    console.log(`[yt-dlp] Formats available: ${result?.formats?.length || 0}`);
    return result;
  } catch (error) {
    const stderr = error.stderr || '';
    const message = error.message || '';
    const combined = `${stderr} ${message}`;
    const isRateLimit = /429|Too Many Requests|rate limit|quota|blocked/i.test(combined);
    const isServerError = /HTTP Error [5]\d{2}|503|502|504|timed out|timeout/i.test(combined);
    const shouldRetry = attempt < MAX_YTDLP_RETRIES && (isRateLimit || isServerError);

    console.error(`[yt-dlp] Error on attempt ${attempt}: ${combined.trim()}`);

    if (shouldRetry) {
      const delayMs = 1000 * attempt;
      console.warn(`[yt-dlp] Retrying after ${delayMs}ms due to ${isRateLimit ? 'rate limit/429' : 'server error'}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return fetchMediaInfo(url, attempt + 1);
    }

    const failureMessage = stderr || message || String(error);
    throw new Error(`yt-dlp extraction failed: ${failureMessage}`);
  }
}

// Check if yt-dlp is available
async function checkYtDlp() {
  try {
    const result = await youtubeDl('--version', {});
    console.log(`[yt-dlp] Version check: ${result}`);
    return true;
  } catch (error) {
    console.error(`[yt-dlp] Not available: ${error.message}`);
    return false;
  }
}

module.exports = { fetchMediaInfo, checkYtDlp };