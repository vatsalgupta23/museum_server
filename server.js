// import 'dotenv/config';
// import express from 'express';
// import cors from 'cors';
// import { WebSocketServer } from 'ws';

// const app = express();
// app.use(cors());
// app.use(express.json());

// const PORT = process.env.PORT || 3000;
// const STARK_SHARED_SECRET = process.env.STARK_SHARED_SECRET || ""; // optional

// // --- Fake data store (map IP name -> exhibit) ---
// const exhibits = [
//     { id: 'ex_tundra', title: 'Tundra', intelligencePointName: 'Tundra', audioUrl: '...' },
//     { id: 'ex_skulls', title: 'Dinosaur Skulls', intelligencePointName: 'Dinosaur Skulls', audioUrl: '...' },
// ];
// const byPoint = new Map(exhibits.map(e => [e.intelligencePointName, e]));

// // --- WebSocket: app connects here to receive events in real-time ---
// const server = app.listen(PORT, () => console.log(`API on :${PORT}`));
// const wss = new WebSocketServer({ server });

// // Track connected app clients (optionally by session)
// const clients = new Set();

// wss.on('connection', (ws) => {
//     clients.add(ws);
//     ws.on('close', () => clients.delete(ws));
// });

// // Helper: broadcast to all app clients
// function broadcast(msg) {
//     const json = JSON.stringify(msg);
//     for (const ws of clients) {
//         try { ws.send(json); } catch { }
//     }
// }

// // --- (1) REQUIRED by Stark: receive RFID notifications (webhook) ---
// // Spec: POST /api/rfidnotifications with RfidTagNotification JSON. :contentReference[oaicite:1]{index=1}
// app.post('/api/rfidnotifications', (req, res) => {
//     // Optional bearer check (ask Stark to include your secret)
//     const auth = req.headers.authorization || '';
//     if (STARK_SHARED_SECRET && auth !== `Bearer ${STARK_SHARED_SECRET}`) {
//         return res.sendStatus(401);
//     }

//     const n = req.body || {};
//     const type = (n.NotificationType || '').toLowerCase();  // 'entrance' or 'exit' :contentReference[oaicite:2]{index=2}
//     const point = n.IntelligencePointName || n.ReadPointName; // name of read point/IP :contentReference[oaicite:3]{index=3}

//     console.log('[RFID]', type, n.Identifier, point, n.ReadTime);

//     const exhibit = byPoint.get(point);
//     if (type === 'entrance' && exhibit) {
//         // Tell the app to play audio for this exhibit (no REST, just WS)
//         broadcast({ type: 'PLAY_EXHIBIT', exhibitId: exhibit.id, title: exhibit.title, audioUrl: exhibit.audioUrl });
//     }
//     if (type === 'exit' && exhibit) {
//         broadcast({ type: 'STOP_EXHIBIT', exhibitId: exhibit.id });
//     }

//     // Per Stark spec: return only status code, no body. :contentReference[oaicite:4]{index=4}
//     return res.sendStatus(200);
// });

// // 0) Health check (HTTP)
// app.get('/healthz', (req, res) => res.status(200).json({ ok: true }));

// // 1) On every new WS connection, send a welcome message
// wss.on('connection', (ws) => {
//     clients.add(ws);
//     try { ws.send(JSON.stringify({ type: 'WELCOME', msg: 'WS connected' })); } catch { }
//     ws.on('close', () => clients.delete(ws));
// });

// // 2) Debug broadcast endpoint (HTTP -> WS)
// // curl this to simulate Stark telling you to play an exhibit
// app.post('/api/debug/broadcast', (req, res) => {
//     const { title = 'Tundra', type = 'PLAY_EXHIBIT', audioUrl } = req.body || {};
//     broadcast({
//         type,                         // 'PLAY_EXHIBIT' or 'STOP_EXHIBIT'
//         title,                        // must match a title your Flutter maps to audio
//         audioUrl: audioUrl || 'https://example.com/audio.mp3' // optional if streaming
//     });
//     return res.sendStatus(200);
// });


import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const STARK_SHARED_SECRET = process.env.STARK_SHARED_SECRET || ''; // optional

// --- Exhibit map (maps Stark's point names to exhibits/audio) ---
const exhibits = [
    { id: 'ex_tundra', title: 'Tundra', intelligencePoint: 'Tundra' },
    { id: 'ex_skeletons', title: 'Skeletons', intelligencePoint: 'Skeletons' },
    { id: 'ex_boreal', title: 'Boreal forest', intelligencePoint: 'Boreal Forest'},
    { id: 'ex_alpine', title: 'Alpine', intelligencePoint: 'Alpine/Montane' },
    { id: 'ex_skulls', title: 'Dinosaur Skulls', intelligencePoint: 'Skulls' },
    { id: 'ex_casts', title: 'Casts', intelligencePoint: 'Casts' },
    { id: 'ex_east_entry', title: 'Habitat Hall', intelligencePoint: 'East Entrance' },
    { id: 'ex_west_entry', title: 'Habitat Hall', intelligencePoint: 'West Entrance' },
    { id: 'ex_desert', title: 'Desert', intelligencePoint: 'Desert' },
    { id: 'ex_grassland', title: 'Grassland', intelligencePoint: 'Grassland' },
    { id: 'ex_rainforest', title: 'Rainforest', intelligencePoint: 'Tropical Rain Forest' },
    { id: 'ex_deciduous', title: 'Deciduous', intelligencePoint: 'Eastern Deciduous' },

];
const byPoint = new Map(exhibits.map((e) => [e.intelligencePoint, e]));

// --- Start server ---
const server = app.listen(PORT, () => console.log(`✅ API running on :${PORT}`));

// --- WebSocket setup ---
const wss = new WebSocketServer({ server });
const clients = new Set();

// Single connection handler
wss.on('connection', (ws, req) => {
    clients.add(ws);
    console.log('[WS] Client connected from', req?.headers['x-forwarded-for'] || req?.socket?.remoteAddress);

    // ✅ Send welcome so Flutter chip shows "Connected"
    try {
        ws.send(JSON.stringify({ type: 'WELCOME', msg: 'WS connected' }));
    } catch (err) {
        console.error('[WS] Failed to send welcome:', err);
    }

    ws.on('close', () => {
        clients.delete(ws);
        console.log('[WS] Client disconnected');
    });
});

// (Optional) Log when upgrade happens
server.on('upgrade', (req) => {
    console.log('[WS] HTTP upgrade from', req.headers['x-forwarded-for'] || req.socket.remoteAddress);
});

// --- Broadcast helper ---
function broadcast(msg) {
    const json = JSON.stringify(msg);
    for (const ws of clients) {
        try {
            ws.send(json);
        } catch (e) {
            console.error('[WS] Send error:', e);
        }
    }
}

// --- Health check ---
app.get('/healthz', (req, res) => res.status(200).json({ ok: true }));

// --- Debug broadcast endpoint (manual test) ---
app.post('/api/debug/broadcast', (req, res) => {
    const { title = 'Tundra', type = 'PLAY_EXHIBIT', audioUrl } = req.body || {};
    broadcast({
        type,
        title,
        audioUrl: audioUrl || 'https://example.com/audio.mp3',
    });
    return res.sendStatus(200);
});

// --- Stark webhook: POST /api/rfidnotifications ---
app.post('/api/rfidnotifications', (req, res) => {
    // const auth = req.headers.authorization || '';
    // if (STARK_SHARED_SECRET && auth !== `Bearer ${STARK_SHARED_SECRET}`) {
    //     return res.sendStatus(401);
    // }
    console.log('📡 RFID RAW:', JSON.stringify(req.body, null, 2));

    const n = req.body || {};
    const type = (n.NotificationType || n.ReadType || '').toLowerCase();
    const identifier = n.Identifier || n.PrimaryIdentifier || ''; // 'entrance' or 'exit'
    const point = n.IntelligencePointName || n.ReadPointName || n.IntelligencePoint;

    const shortId = identifier.length >= 4
        ? identifier.slice(-4)
        : identifier;

    console.log('[RFID]', type, identifier,shortId, point, n.ReadTime);

    const exhibit = byPoint.get(point);
    if (type === 'entrance' && exhibit) {
        broadcast({
            type: 'PLAY_EXHIBIT',
            exhibitId: exhibit.id,
            title: exhibit.title,
            shortId,
        
        });
    }
    if (type === 'exit' && exhibit) {
        broadcast({
            type: 'STOP_EXHIBIT',
            exhibitId: exhibit.id,
            shortId,    
        });
    }

    return res.sendStatus(200); // Stark expects only status code
});

