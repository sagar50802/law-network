import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import mongoose from 'mongoose';

import articleRoutes from './routes/articles.js';
import bannerRoutes from './routes/banners.js';
import consultancyRoutes from './routes/consultancy.js';
import newsRoutes from './routes/news.js';
import pdfRoutes from './routes/pdfs.js';
import podcastRoutes from './routes/podcast.js';
import videoRoutes from './routes/videos.js';

const app = express();

// middlewares
app.use(cors());
app.use(express.json());

// simple ping
app.get('/api/ping', (_req, res) => res.json({ ok: true }));

// attach routes
app.use('/api/articles', articleRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/consultancy', consultancyRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/pdfs', pdfRoutes);
app.use('/api/podcasts', podcastRoutes); // <-- now picks up your router code
app.use('/api/videos', videoRoutes);

// static uploads
app.use('/uploads', express.static(path.join(process.cwd(), 'server', 'uploads')));

// connect to Mongo
mongoose.connect(process.env.MONGO_URL || process.env.MONGODB_URI || '', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
