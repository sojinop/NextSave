const youtubeDl = require('youtube-dl-exec');

async function fetchMediaInfo(url) {
  try {
    return await youtubeDl(url, {
      dumpJson: true,
      noPlaylist: true,
      noWarnings: true,
      noCallHome: true,
      skipDownload: true,
      preferFreeFormats: true,
      referer: url,
      sourceAddress: '0.0.0.0'
    });
  } catch (error) {
    const message = error.stderr || error.message || String(error);
    throw new Error(`youtube-dl execution failed: ${message}`);
  }
}

module.exports = { fetchMediaInfo };