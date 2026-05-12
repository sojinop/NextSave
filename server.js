const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const downloadRouter = require('./routes/download');
const rateLimiter = require('./middleware/rateLimiter');

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

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
