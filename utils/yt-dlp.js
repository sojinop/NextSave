const { execFile } = require('child_process');
const ytdlpPath = require('yt-dlp-static');

function fetchMediaInfo(url) {
  return new Promise((resolve, reject) => {
    const args = [
      '-J',
      '--no-playlist',
      '--no-warnings',
      '--no-call-home',
      '--skip-download',
      '--prefer-free-formats',
      url
    ];

    execFile(ytdlpPath, args, { maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const message = stderr || error.message || String(error);
        return reject(new Error(`yt-dlp execution failed: ${message}`));
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (parseError) {
        reject(new Error('Failed to parse yt-dlp JSON output.'));
      }
    });
  });
}

module.exports = { fetchMediaInfo };