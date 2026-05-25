const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const js = fs.readFileSync('public/js/main.js', 'utf8');
const regex = /getElementById\(['"]([^'"]+)['"]\)/g;
const ids = Array.from(js.matchAll(regex)).map(m => m[1]);
const missing = ids.filter(id => !html.includes(`id="${id}"`));
console.log('Missing IDs:', [...new Set(missing)]);