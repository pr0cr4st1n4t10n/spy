const express = require('express');
const db = require('../database');
const presence = require('../presence');

const router = express.Router();

function requireAuth(req, res) {
    if (!req.session.userId) return res.status(401).json({ error: 'Войдите в аккаунт' });
    return null;
}

function normalizeText(text) {
    const t = (text || '').trim();
    if (!t) return null;
    if (t.length > 500) return null;
    return t;
}

router.get('/conversations', (req, res) => {
    try {
        const authErr = requireAuth(req, res);
        if (authErr) return;

        const userId = req.session.userId;

        const friendRows = db.prepare(`
            SELECT CASE WHEN f.friend_id = ? THEN f.user_id ELSE f.friend_id END AS friend_id
            FROM friends f
            WHERE f.accepted = 1 AND (f.user_id = ? OR f.friend_id = ?)
        `).all(userId, userId, userId);

        const friendIds = friendRows.map(r => r.friend_id);
        if (!friendIds.length) return res.json({ conversations: [] });

        const conversations = [];

        for (const friendId of friendIds) {
            const [userA, userB] = friendId < userId ? [friendId, userId] : [userId, friendId];

            const friend = db.prepare(`
                SELECT id, username, display_name, avatar_seed
                FROM users
                WHERE id = ?
            `).get(friendId);

            if (!friend) continue;

            const conv = db.prepare(`
                SELECT id
                FROM direct_conversations
                WHERE user_a = ? AND user_b = ?
            `).get(userA, userB);

            if (!conv) {
                const p = presence.getPresence(friendId);
                conversations.push({
                    friend_id: friendId,
                    conversation_id: null,
                    friend,
                    last_message: null,
                    last_message_at: null,
                    unread_count: 0,
                    is_online: p.online,
                    last_seen: p.lastSeen
                });
                continue;
            }

            const last = db.prepare(`
                SELECT dm.id, dm.sender_id, dm.message, dm.created_at
                FROM direct_messages dm
                WHERE dm.conversation_id = ?
                ORDER BY dm.created_at DESC
                LIMIT 1
            `).get(conv.id);

            const unread = db.prepare(`
                SELECT COUNT(*) as c
                FROM direct_messages dm
                WHERE dm.conversation_id = ?
                  AND dm.sender_id != ?
                  AND dm.created_at > COALESCE(
                    (SELECT dmr.last_read_at
                     FROM direct_message_reads dmr
                     WHERE dmr.conversation_id = ? AND dmr.user_id = ?),
                    '1970-01-01'
                  )
            `).get(conv.id, userId, conv.id, userId).c;

            const p = presence.getPresence(friendId);
            conversations.push({
                friend_id: friendId,
                conversation_id: conv.id,
                friend,
                last_message: last ? { sender_id: last.sender_id, text: last.message, created_at: last.created_at } : null,
                last_message_at: last ? last.created_at : null,
                unread_count: unread || 0,
                is_online: p.online,
                last_seen: p.lastSeen
            });
        }

        conversations.sort((a, b) => {
            if (!a.last_message_at && !b.last_message_at) return 0;
            if (!a.last_message_at) return 1;
            if (!b.last_message_at) return -1;
            return new Date(b.last_message_at) - new Date(a.last_message_at);
        });

        res.json({ conversations });
    } catch (err) {
        console.error('Ошибка conversations:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.get('/dialog/:friendId/messages', (req, res) => {
    try {
        const authErr = requireAuth(req, res);
        if (authErr) return;

        const userId = req.session.userId;
        const friendId = parseInt(req.params.friendId, 10);
        const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 50));

        if (!friendId || friendId === userId) return res.status(400).json({ error: 'Некорректный friendId' });

        // Разрешаем только друзьям (принцип "чат друзей")
        const isFriend = db.prepare(`
            SELECT 1
            FROM friends
            WHERE accepted = 1
              AND ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
        `).get(userId, friendId, friendId, userId);

        if (!isFriend) return res.status(403).json({ error: 'Можно писать только друзьям' });

        const [userA, userB] = friendId < userId ? [friendId, userId] : [userId, friendId];

        const conv = db.prepare(`
            SELECT id
            FROM direct_conversations
            WHERE user_a = ? AND user_b = ?
        `).get(userA, userB);

        if (!conv) {
            const friend = db.prepare('SELECT id, username, display_name, avatar_seed FROM users WHERE id = ?').get(friendId);
            return res.json({
                conversation_id: null,
                friend: friend || null,
                messages: [],
                marked_read: false
            });
        }

        const messagesDesc = db.prepare(`
            SELECT
                dm.id,
                dm.sender_id,
                dm.message,
                dm.created_at,
                u.display_name,
                u.username,
                u.avatar_seed
            FROM direct_messages dm
            JOIN users u ON u.id = dm.sender_id
            WHERE dm.conversation_id = ?
            ORDER BY dm.created_at DESC
            LIMIT ?
        `).all(conv.id, limit);

        const messages = messagesDesc.reverse().map(m => ({
            id: m.id,
            sender_id: m.sender_id,
            text: m.message,
            created_at: m.created_at,
            sender_display_name: m.display_name || m.username,
            sender_username: m.username,
            sender_avatar_seed: m.avatar_seed || m.username
        }));

        // Mark as read when opening dialog
        db.prepare(`
            INSERT OR IGNORE INTO direct_message_reads (conversation_id, user_id, last_read_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `).run(conv.id, userId);
        db.prepare('UPDATE direct_message_reads SET last_read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND user_id = ?')
            .run(conv.id, userId);

        const friend = db.prepare(`
            SELECT id, username, display_name, avatar_seed
            FROM users
            WHERE id = ?
        `).get(friendId);

        res.json({
            conversation_id: conv.id,
            friend: friend || null,
            messages,
            marked_read: true
        });
    } catch (err) {
        console.error('Ошибка dialog messages:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Optional REST endpoint for "send" (UI может использовать socket, но этот endpoint полезен для fallback).
router.post('/dialog/:friendId/message', (req, res) => {
    try {
        const authErr = requireAuth(req, res);
        if (authErr) return;

        const userId = req.session.userId;
        const friendId = parseInt(req.params.friendId, 10);
        const text = normalizeText(req.body?.text);
        if (!friendId || friendId === userId) return res.status(400).json({ error: 'Некорректный friendId' });
        if (!text) return res.status(400).json({ error: 'Сообщение не может быть пустым (до 500 символов)' });

        const isFriend = db.prepare(`
            SELECT 1
            FROM friends
            WHERE accepted = 1
              AND ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
        `).get(userId, friendId, friendId, userId);
        if (!isFriend) return res.status(403).json({ error: 'Можно писать только друзьям' });

        const [userA, userB] = friendId < userId ? [friendId, userId] : [userId, friendId];

        let conv = db.prepare(`
            SELECT id
            FROM direct_conversations
            WHERE user_a = ? AND user_b = ?
        `).get(userA, userB);

        if (!conv) {
            const result = db.prepare(`
                INSERT INTO direct_conversations (user_a, user_b) VALUES (?, ?)
            `).run(userA, userB);
            conv = { id: result.lastInsertRowid };

            // Initialize read markers so the first message becomes unread for receiver.
            db.prepare(`
                INSERT OR IGNORE INTO direct_message_reads (conversation_id, user_id, last_read_at)
                VALUES (?, ?, datetime('now','-1 second'))
            `).run(conv.id, userA);
            db.prepare(`
                INSERT OR IGNORE INTO direct_message_reads (conversation_id, user_id, last_read_at)
                VALUES (?, ?, datetime('now','-1 second'))
            `).run(conv.id, userB);
        }

        const result = db.prepare(`
            INSERT INTO direct_messages (conversation_id, sender_id, message)
            VALUES (?, ?, ?)
        `).run(conv.id, userId, text);

        // Sender has read their own message immediately.
        db.prepare(`
            INSERT OR IGNORE INTO direct_message_reads (conversation_id, user_id, last_read_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `).run(conv.id, userId);
        db.prepare('UPDATE direct_message_reads SET last_read_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND user_id = ?')
            .run(conv.id, userId);

        const messageRow = db.prepare(`
            SELECT dm.id, dm.sender_id, dm.message, dm.created_at, u.display_name, u.username, u.avatar_seed
            FROM direct_messages dm
            JOIN users u ON u.id = dm.sender_id
            WHERE dm.id = ?
        `).get(result.lastInsertRowid);

        res.json({
            success: true,
            conversation_id: conv.id,
            message: {
                id: messageRow.id,
                sender_id: messageRow.sender_id,
                text: messageRow.message,
                created_at: messageRow.created_at,
                sender_display_name: messageRow.display_name || messageRow.username,
                sender_avatar_seed: messageRow.avatar_seed || messageRow.username
            }
        });
    } catch (err) {
        console.error('Ошибка send message:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;

