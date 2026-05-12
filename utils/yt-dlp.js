const { spawn } = require('child_process');

function fetchMediaInfo(url) {
  return new Promise((resolve, reject) => {
    const ytDlp = process.platform === 'win32'
      ? 'yt-dlp.exe'
      : 'yt-dlp';

    const yt = spawn(ytDlp, [
      '-J',
      '--no-playlist',
      '--no-warnings',
      '--no-call-home',
      '--skip-download',
      url
    ]);

    let stdout = '';
    let stderr = '';

    yt.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    yt.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    yt.on('error', (error) => {
      reject(new Error(`yt-dlp execution failed: ${error.message}`));
    });

    yt.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(stderr || `yt-dlp exited with code ${code}`));
      }

      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error('Failed to parse yt-dlp output'));
      }
    });
  });
}

module.exports = { fetchMediaInfo };