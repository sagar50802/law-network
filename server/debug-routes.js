// server/debug-routes.js
const files = [
  'banners',
  'news',
  'articles',
  'submissions',
  'qr',
  'podcasts',
  'videos',
  'pdfs',
];

for (const f of files) {
  try {
    require('./routes/' + f);
    console.log('OK  →', f);
  } catch (e) {
    console.error('FAIL →', f, '-', e.message);
  }
}
