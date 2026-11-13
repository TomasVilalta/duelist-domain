import Fastify from "fastify";
import { WebSocketServer } from "ws";
import type { ClientMessage, ServerMessage } from "@duelist/shared";

const PORT = Number(process.env.PORT ?? 3001);

const app = Fastify({ logger: true });

app.get("/health", async () => ({ ok: true }));

const wss = new WebSocketServer({ noServer: true });

app.server.on("upgrade", (req, socket, head) => {
  if (req.url !== "/ws") return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString()) as ClientMessage;
    if (msg.type === "ping") {
      const reply: ServerMessage = { type: "pong", at: Date.now() };
      ws.send(JSON.stringify(reply));
    }
  });
});

await app.listen({ port: PORT, host: "0.0.0.0" });
