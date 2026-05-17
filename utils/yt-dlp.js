const youtubeDl = require('youtube-dl-exec');
const ffmpeg = require('ffmpeg-static');

async function fetchMediaInfo(url) {
  try {
    console.log(`[yt-dlp] Extracting metadata from: ${url}`);
    
    const result = await youtubeDl(url, {
      dumpJson: true,
      noPlaylist: true,
      skipDownload: true,
      preferFreeFormats: true,
      ffmpegLocation: ffmpeg
    });
    
    // youtube-dl-exec returns the parsed JSON directly when dumpJson is true
    console.log(`[yt-dlp] Successfully extracted: ${result?.title || 'unknown'}`);
    console.log(`[yt-dlp] Formats available: ${result?.formats?.length || 0}`);
    return result;
  } catch (error) {
    const message = error.stderr || error.message || String(error);
    console.error(`[yt-dlp] Error: ${message}`);
    throw new Error(`yt-dlp extraction failed: ${message}`);
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