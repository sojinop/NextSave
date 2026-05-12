const ytdlp = require('yt-dlp-exec');

async function fetchMediaInfo(url) {
  try {
    const result = await ytdlp(url, {
      dumpJson: true,
      noPlaylist: true,
      noWarnings: true,
      noCallHome: true,
      skipDownload: true,
      quiet: true,
      preferFreeFormats: true,
      referer: url,
      sourceAddress: '0.0.0.0'
    });

    if (typeof result === 'string') {
      return JSON.parse(result);
    }

    return result;
  } catch (error) {
    const message = error.stderr || error.message || String(error);
    throw new Error(`yt-dlp execution failed: ${message}`);
  }
}

module.exports = { fetchMediaInfo };