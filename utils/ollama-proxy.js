// ollama-proxy.js
// Simple proxy server for debugging Ollama prompts and responses
// Usage: node ollama-proxy.js

const http = require('http');
const { URL } = require('url');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'localhost';
const OLLAMA_PORT = process.env.OLLAMA_PORT || 11434;
const PROXY_PORT = process.env.PROXY_PORT || 8080;

const ollamaUrl = `http://${OLLAMA_HOST}:${OLLAMA_PORT}`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, ollamaUrl);
  const options = {
    hostname: OLLAMA_HOST,
    port: OLLAMA_PORT,
    path: url.pathname + url.search,
    method: req.method,
    headers: req.headers,
  };

  let body = [];
  req.on('data', chunk => body.push(chunk));
  req.on('end', () => {
    body = Buffer.concat(body);
    if (body.length) {
      console.log('--- PROMPT ---');
      try {
        console.log(JSON.parse(body.toString()));
      } catch {
        console.log(body.toString());
      }
    }
    const ollamaReq = http.request(options, ollamaRes => {
      let responseBody = [];
      ollamaRes.on('data', chunk => responseBody.push(chunk));
      ollamaRes.on('end', () => {
        const fullResponse = Buffer.concat(responseBody);
        console.log('--- RESPONSE ---');
        try {
          console.log(JSON.parse(fullResponse.toString()));
        } catch {
          console.log(fullResponse.toString());
        }
        res.writeHead(ollamaRes.statusCode, ollamaRes.headers);
        res.end(fullResponse);
      });
    });
    ollamaReq.on('error', err => {
      console.error('Proxy error:', err);
      res.writeHead(502);
      res.end('Proxy error');
    });
    if (body.length) ollamaReq.write(body);
    ollamaReq.end();
  });
});

server.listen(PROXY_PORT, () => {
  console.log(`Ollama proxy listening on port ${PROXY_PORT}`);
  console.log(`Forwarding requests to ${ollamaUrl}`);
});
