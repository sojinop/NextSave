const { extractInstagramMedia } = require('./utils/instagramExtractor');
const { fetchMediaInfo } = require('./utils/yt-dlp');

const urls = [
  // A list of public reel/post URLs to try (may vary in availability)
  'https://www.instagram.com/reel/CqI9r4TJwMN/',
  'https://www.instagram.com/reel/Cv1Z0VvJk8b/',
  'https://www.instagram.com/p/CmP1y3GJ7h9/',
  'https://www.instagram.com/reel/Cr0X7uKJ2X9/',
  'https://www.instagram.com/reel/Cn8Qw2YJ5A1/'
];

(async () => {
  for (const u of urls) {
    console.log('\n--- Testing URL:', u, '---');
    try {
      const ig = await extractInstagramMedia(u);
      console.log('Extractor result summary:');
      console.log(' title:', ig.title);
      console.log(' thumbnail:', ig.thumbnail);
      console.log(' ext:', ig.ext);
      console.log(' formats:', ig.formats && ig.formats.length ? ig.formats.slice(0,5) : ig.formats);
      const hasVideo = Array.isArray(ig.formats) && ig.formats.some(f => /\.(mp4|webm|mov|mkv)/i.test(f.url) || ['mp4','webm','mov','mkv'].includes((f.ext||'').toLowerCase()));
      console.log(' extractor indicates video formats?', !!hasVideo);

      if (!hasVideo) {
        console.log('Trying yt-dlp fallback for URL...');
        try {
          const y = await fetchMediaInfo(u);
          console.log('yt-dlp title:', y.title);
          console.log('yt-dlp formats:', y.formats && y.formats.length);
          const yHasVideo = Array.isArray(y.formats) && y.formats.some(f => ['mp4','webm','mov','mkv'].includes((f.ext||'').toLowerCase()));
          console.log(' yt-dlp indicates video formats?', !!yHasVideo);
        } catch (e) {
          console.error(' yt-dlp fallback error:', e.message);
        }
      }
    } catch (e) {
      console.error('Extractor error:', e.message);
      console.log('Calling yt-dlp fallback after extractor error...');
      try {
        const y = await fetchMediaInfo(u);
        console.log('yt-dlp title:', y.title);
        console.log('yt-dlp formats:', y.formats && y.formats.length);
        const yHasVideo = Array.isArray(y.formats) && y.formats.some(f => ['mp4','webm','mov','mkv'].includes((f.ext||'').toLowerCase()));
        console.log(' yt-dlp indicates video formats?', !!yHasVideo);
      } catch (err) {
        console.error(' yt-dlp fallback error after extractor failure:', err.message);
      }
    }
  }
})();