import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { createServer } from "http";
import express from "express";
import cors from "cors";
import { GameRoom } from "./rooms/GameRoom";

const app = express();
const port = Number(process.env.PORT) || 2567;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
});

// Custom room management endpoints (not /matchmake to avoid Colyseus conflict)
app.post("/api/create-room", async (req, res) => {
    try {
        const { username, sigil } = req.body;
        console.log(`Creating room for user: ${username}, sigil: ${sigil}`);

        const room = await matchMaker.createRoom("game", { username, sigil });
        console.log(`Room created: ${room.roomId}`);

        const reservation = await matchMaker.reserveSeatFor(room, { username, sigil });
        console.log(`Seat reserved: ${reservation.sessionId}`);

        res.json({
            success: true,
            reservation: {
                sessionId: reservation.sessionId,
                room: {
                    roomId: room.roomId,
                    processId: reservation.room.processId,
                    name: reservation.room.name,
                    sessionId: reservation.sessionId,
                },
            },
            roomCode: room.roomId.substring(0, 6).toUpperCase(),
        });
    } catch (error: any) {
        console.error("Create room error:", error);
        res.json({ success: false, error: error.message });
    }
});

// Join room by code endpoint
app.post("/api/join-room", async (req, res) => {
    try {
        const { roomCode, username, sigil } = req.body;
        console.log(`Joining room: ${roomCode}, user: ${username}`);

        // Find the room by checking all game rooms
        const rooms = await matchMaker.query({ name: "game" });
        console.log(`Found ${rooms.length} rooms`);

        const room = rooms.find(r => r.roomId.toUpperCase().startsWith(roomCode.toUpperCase()));

        if (!room) {
            return res.status(404).json({ success: false, error: "Room not found" });
        }

        const reservation = await matchMaker.reserveSeatFor(room, { username, sigil });
        res.json({
            success: true,
            reservation: {
                sessionId: reservation.sessionId,
                room: {
                    roomId: room.roomId,
                    processId: reservation.room.processId,
                    name: reservation.room.name,
                    sessionId: reservation.sessionId,
                },
            },
            roomCode: room.roomId.substring(0, 6).toUpperCase(),
        });
    } catch (error: any) {
        console.error("Join room error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// List available rooms
app.get("/api/rooms", async (req, res) => {
    try {
        const rooms = await matchMaker.query({ name: "game" });
        res.json({
            success: true,
            rooms: rooms.map(r => ({
                roomId: r.roomId,
                roomCode: r.roomId.substring(0, 6).toUpperCase(),
                clients: r.clients,
                maxClients: r.maxClients,
            })),
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create HTTP server
const httpServer = createServer(app);

// Create Colyseus server
const gameServer = new Server({
    transport: new WebSocketTransport({
        server: httpServer,
    }),
});

// Register game room
gameServer.define("game", GameRoom).enableRealtimeListing();

// Start server
httpServer.listen(port, () => {
    console.log(`🎮 RiftSpells server running on port ${port}`);
    console.log(`   WebSocket: ws://localhost:${port}`);
    console.log(`   HTTP API: http://localhost:${port}`);
    console.log(`   Create room: POST http://localhost:${port}/api/create-room`);
    console.log(`   Join room: POST http://localhost:${port}/api/join-room`);
    console.log(`   Room "game" is registered and ready!`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
    console.log("Shutting down server...");
    gameServer.gracefullyShutdown();
});
