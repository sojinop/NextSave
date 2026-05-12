const { spawn } = require('child_process');

function fetchMediaInfo(url) {
  return new Promise((resolve, reject) => {

    const yt = spawn('npx', [
      'yt-dlp',
      '-J',
      '--no-playlist',
      '--no-warnings',
      url
    ]);

    let stdout = '';
    let stderr = '';

    yt.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    yt.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    yt.on('error', (error) => {
      reject(new Error(`yt-dlp execution failed: ${error.message}`));
    });

    yt.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(stderr || `yt-dlp exited with code ${code}`));
      }

      try {
        const json = JSON.parse(stdout);
        resolve(json);
      } catch (error) {
        reject(new Error('Failed to parse yt-dlp output.'));
      }
    });
  });
}

module.exports = { fetchMediaInfo };