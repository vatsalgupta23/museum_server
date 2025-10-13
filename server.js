import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const STARK_SHARED_SECRET = process.env.STARK_SHARED_SECRET || ""; // optional

// --- Fake data store (map IP name -> exhibit) ---
const exhibits = [
    { id: 'ex_tundra', title: 'Tundra', intelligencePointName: 'Tundra', audioUrl: '...' },
    { id: 'ex_skulls', title: 'Dinosaur Skulls', intelligencePointName: 'Dinosaur Skulls', audioUrl: '...' },
];
const byPoint = new Map(exhibits.map(e => [e.intelligencePointName, e]));

// --- WebSocket: app connects here to receive events in real-time ---
const server = app.listen(PORT, () => console.log(`API on :${PORT}`));
const wss = new WebSocketServer({ server });

// Track connected app clients (optionally by session)
const clients = new Set();

wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('close', () => clients.delete(ws));
});

// Helper: broadcast to all app clients
function broadcast(msg) {
    const json = JSON.stringify(msg);
    for (const ws of clients) {
        try { ws.send(json); } catch { }
    }
}

// --- (1) REQUIRED by Stark: receive RFID notifications (webhook) ---
// Spec: POST /api/rfidnotifications with RfidTagNotification JSON. :contentReference[oaicite:1]{index=1}
app.post('/api/rfidnotifications', (req, res) => {
    // Optional bearer check (ask Stark to include your secret)
    const auth = req.headers.authorization || '';
    if (STARK_SHARED_SECRET && auth !== `Bearer ${STARK_SHARED_SECRET}`) {
        return res.sendStatus(401);
    }

    const n = req.body || {};
    const type = (n.NotificationType || '').toLowerCase();  // 'entrance' or 'exit' :contentReference[oaicite:2]{index=2}
    const point = n.IntelligencePointName || n.ReadPointName; // name of read point/IP :contentReference[oaicite:3]{index=3}

    console.log('[RFID]', type, n.Identifier, point, n.ReadTime);

    const exhibit = byPoint.get(point);
    if (type === 'entrance' && exhibit) {
        // Tell the app to play audio for this exhibit (no REST, just WS)
        broadcast({ type: 'PLAY_EXHIBIT', exhibitId: exhibit.id, title: exhibit.title, audioUrl: exhibit.audioUrl });
    }
    if (type === 'exit' && exhibit) {
        broadcast({ type: 'STOP_EXHIBIT', exhibitId: exhibit.id });
    }

    // Per Stark spec: return only status code, no body. :contentReference[oaicite:4]{index=4}
    return res.sendStatus(200);
});