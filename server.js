const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const downloadRouter = require('./routes/download');
const rateLimiter = require('./middleware/rateLimiter');
const { checkYtDlp } = require('./utils/yt-dlp');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/api/download', rateLimiter, downloadRouter);
app.use(express.static(path.join(__dirname, '/')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const server = app.listen(PORT, async () => {
  console.log(`\n=== Server starting ===`);
  console.log(`Server listening on http://localhost:${PORT}`);
  
  // Check yt-dlp availability
  try {
    const ytdlpAvailable = await checkYtDlp();
    if (ytdlpAvailable) {
      console.log(`✓ yt-dlp is available and ready`);
    } else {
      console.warn(`⚠ WARNING: yt-dlp is not available. Please install it.`);
      console.warn(`  Run: npm install yt-dlp --global`);
      console.warn(`  Or: pip install yt-dlp`);
    }
  } catch (error) {
    console.error(`✗ Error checking yt-dlp:`, error.message);
  }
  
  console.log(`=== Server ready ===\n`);
});
