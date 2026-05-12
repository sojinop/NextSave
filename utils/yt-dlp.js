const { execFile } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const https = require('https');

let ytdlpPath = null;

async function ensureYtdlpBinary() {
  if (ytdlpPath) return ytdlpPath;

  const binDir = path.join(os.tmpdir(), 'ytdlp-cache');
  const binaryName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const binaryPath = path.join(binDir, binaryName);

  try {
    // Check if binary already exists and is executable
    await fs.access(binaryPath, fs.constants.F_OK);
    ytdlpPath = binaryPath;
    return binaryPath;
  } catch {
    // Binary doesn't exist, download it
    try {
      await fs.mkdir(binDir, { recursive: true });

      const platform = process.platform === 'win32' ? 'windows' :
                      process.platform === 'darwin' ? 'macos' : 'linux';
      const arch = process.arch === 'x64' ? 'x86_64' : process.arch;

      // Get latest release info from GitHub API
      const releaseUrl = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';

      const releaseInfo = await new Promise((resolve, reject) => {
        https.get(releaseUrl, {
          headers: {
            'User-Agent': 'Node.js yt-dlp downloader'
          }
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
        }).on('error', reject);
      });

      // Find the appropriate asset
      const assetName = platform === 'windows' ? `yt-dlp.exe` :
                       platform === 'macos' ? `yt-dlp_macos` : `yt-dlp_linux`;

      const asset = releaseInfo.assets.find(a => a.name === assetName);
      if (!asset) {
        throw new Error(`No suitable yt-dlp binary found for ${platform}`);
      }

      // Download the binary
      await new Promise((resolve, reject) => {
        const file = require('fs').createWriteStream(binaryPath);
        https.get(asset.browser_download_url, (res) => {
          res.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        }).on('error', (err) => {
          fs.unlink(binaryPath, () => {});
          reject(err);
        });
      });

      // Make binary executable on Unix systems
      if (process.platform !== 'win32') {
        await fs.chmod(binaryPath, 0o755);
      }

      ytdlpPath = binaryPath;
      return binaryPath;
    } catch (error) {
      throw new Error(`Failed to download yt-dlp binary: ${error.message}`);
    }
  }
}

async function fetchMediaInfo(url) {
  try {
    const binaryPath = await ensureYtdlpBinary();

    return new Promise((resolve, reject) => {
      execFile(binaryPath, [
        '-J',
        '--no-playlist',
        '--no-warnings',
        '--no-call-home',
        '--skip-download',
        '--prefer-free-formats',
        url
      ], { maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
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
  } catch (error) {
    throw new Error(`yt-dlp setup failed: ${error.message}`);
  }
}

module.exports = { fetchMediaInfo };