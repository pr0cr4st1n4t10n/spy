// In-memory presence tracking for socket.io connections.
// Used for messenger statuses (online/offline).

const userSockets = new Map(); // userId -> Set(socketId)
const userPresence = new Map(); // userId -> { online: boolean, lastSeen: number | null }

function addSocket(userId, socketId) {
    const existing = userSockets.get(userId) || new Set();
    const wasOnline = userPresence.get(userId)?.online ?? false;

    existing.add(socketId);
    userSockets.set(userId, existing);

    userPresence.set(userId, {
        online: true,
        lastSeen: userPresence.get(userId)?.lastSeen ?? null
    });

    return !wasOnline;
}

function removeSocket(userId, socketId) {
    const set = userSockets.get(userId);
    if (!set) return false;

    set.delete(socketId);

    if (set.size === 0) {
        userSockets.delete(userId);
        userPresence.set(userId, {
            online: false,
            lastSeen: Date.now()
        });
        return true; // went offline
    }

    return false; // still online from other socket(s)
}

function getSocketsByUserId(userId) {
    const set = userSockets.get(userId);
    if (!set) return [];
    return Array.from(set);
}

function getPresence(userId) {
    const p = userPresence.get(userId);
    if (!p) return { online: false, lastSeen: null };
    return { online: !!p.online, lastSeen: p.lastSeen ?? null };
}

function getOnlineUsers() {
    const res = [];
    for (const [userId, p] of userPresence.entries()) {
        if (p?.online) res.push(userId);
    }
    return res;
}

module.exports = {
    addSocket,
    removeSocket,
    getSocketsByUserId,
    getPresence,
    getOnlineUsers
};

