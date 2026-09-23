const http = require('http');
http.get('http://localhost:3000/api/catalog/items', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data.substring(0, 200)));
}).on('error', err => console.log(err.message));
