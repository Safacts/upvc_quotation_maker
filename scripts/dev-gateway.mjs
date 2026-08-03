import http from "node:http";
import net from "node:net";

const FLUTTER_PORT = 8080;
const NEXT_PORT = 3100;
const GATEWAY_PORT = 3000;

function isFlutterPath(url) {
  const p = (url || "").split("?")[0];
  if (p === "/pwa-sw.js") return false;
  if (p === "/favicon.png" || p === "/manifest.json") return true;
  if (p === "/app" || p.startsWith("/app/")) return true;
  if (
    p.startsWith("/upvc/") ||
    p.startsWith("/dwds/") ||
    p.startsWith("/packages/") ||
    p.startsWith("/assets/") ||
    p.startsWith("/icons/") ||
    p.startsWith("/canvaskit/") ||
    p.startsWith("/.dart_tool/")
  )
    return true;
  if (/^\/[^/]+\.js$/.test(p)) return true;
  if (p.endsWith(".map")) return true;
  return false;
}

function isFlutterWs(url) {
  const p = (url || "").split("?")[0];
  if (p.startsWith("$dwdsSseHandler") || p === "/$dwdsSseHandler") return true;
  if (p === "/app" || p.startsWith("/app/")) return true;
  if (p.startsWith("/upvc/") || p.startsWith("/dwds/")) return true;
  return false;
}

function targetFor(url) {
  return isFlutterPath(url) ? FLUTTER_PORT : NEXT_PORT;
}

const server = http.createServer((req, res) => {
  const p = (req.url || "").split("?")[0];

  // Intercept and destroy any stale service workers from previous projects (e.g., CRA/Vite)
  if (p === "/service-worker.js" || p === "/sw.js") {
    res.writeHead(200, {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
    });
    res.end(`
      self.addEventListener('install', () => self.skipWaiting());
      self.addEventListener('activate', () => {
        self.registration.unregister();
        self.clients.matchAll({ type: 'window' }).then(clients => {
          for (const client of clients) client.navigate(client.url);
        });
      });
    `);
    return;
  }

  const port = targetFor(req.url);
  const proxyReq = http.request(
    {
      host: "127.0.0.1",
      port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${port}` },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );
  proxyReq.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end(`dev-gateway: upstream :${port} error: ${err.message}`);
  });
  req.on("error", () => proxyReq.destroy());
  req.pipe(proxyReq);
});

server.on("upgrade", (req, socket, head) => {
  const port = isFlutterWs(req.url) ? FLUTTER_PORT : NEXT_PORT;
  const upstream = net.connect(port, "127.0.0.1", () => {
    let data = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const key = req.rawHeaders[i];
      const value = req.rawHeaders[i + 1];
      if (key.toLowerCase() === "host") {
        data += `Host: 127.0.0.1:${port}\r\n`;
      } else {
        data += `${key}: ${value}\r\n`;
      }
    }
    data += "\r\n";
    upstream.write(data);
    if (head && head.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

server.listen(GATEWAY_PORT, "127.0.0.1", () => {
  console.log(`[gateway] http://localhost:${GATEWAY_PORT} -> Next :${NEXT_PORT} / Flutter :${FLUTTER_PORT}`);
});
