const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the current directory
app.use(express.static(__dirname));

const rooms = {}; // roomCode => { players: {}, hostId: null, gameState: {} }

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('joinRoom', ({ roomCode, playerName, peerId }) => {
        socket.join(roomCode);
        
        if (!rooms[roomCode]) {
            rooms[roomCode] = { players: {}, hostId: socket.id };
        }

        rooms[roomCode].players[socket.id] = {
            id: socket.id,
            name: playerName,
            peerId: peerId,
            team: null // 'P1' or 'P2'
        };

        socket.roomCode = roomCode;

        // Notify room
        io.to(roomCode).emit('roomUpdate', {
            players: rooms[roomCode].players,
            hostId: rooms[roomCode].hostId
        });
    });

    // Voice signaling fallback (if needed)
    socket.on('signal', (data) => {
        io.to(data.to).emit('signal', {
            from: socket.id,
            signal: data.signal
        });
    });

    // Game state sync (Host sends to clients)
    socket.on('syncState', (state) => {
        if (rooms[socket.roomCode] && rooms[socket.roomCode].hostId === socket.id) {
            socket.to(socket.roomCode).emit('gameState', state);
        }
    });

    // Client inputs (Clients send to Host)
    socket.on('playerInput', (input) => {
        if (rooms[socket.roomCode]) {
            io.to(rooms[socket.roomCode].hostId).emit('clientInput', {
                clientId: socket.id,
                input: input
            });
        }
    });
    
    // Choose team
    socket.on('chooseTeam', (team) => {
        if (rooms[socket.roomCode] && rooms[socket.roomCode].players[socket.id]) {
            rooms[socket.roomCode].players[socket.id].team = team;
            io.to(socket.roomCode).emit('roomUpdate', {
                players: rooms[socket.roomCode].players,
                hostId: rooms[socket.roomCode].hostId
            });
        }
    });

    socket.on('disconnect', () => {
        const roomCode = socket.roomCode;
        if (roomCode && rooms[roomCode]) {
            delete rooms[roomCode].players[socket.id];
            
            // Reassign host if host left
            if (rooms[roomCode].hostId === socket.id) {
                const remainingIds = Object.keys(rooms[roomCode].players);
                if (remainingIds.length > 0) {
                    rooms[roomCode].hostId = remainingIds[0];
                } else {
                    delete rooms[roomCode];
                }
            }

            if (rooms[roomCode]) {
                io.to(roomCode).emit('roomUpdate', {
                    players: rooms[roomCode].players,
                    hostId: rooms[roomCode].hostId
                });
            }
        }
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Kabaddi Multiplayer Server running on http://localhost:${PORT}`);
});
