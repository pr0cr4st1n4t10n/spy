const express = require('express');
const db = require('../database');

const router = express.Router();

function requireAuth(req, res) {
    if (!req.session.userId) return res.status(401).json({ error: 'Войдите в аккаунт' });
    return null;
}

function getClubRow(clubId) {
    return db.prepare('SELECT id, name, description, created_by, created_at FROM clubs WHERE id = ?').get(clubId);
}

function isMember(reqUserId, clubId) {
    return !!db.prepare(`
        SELECT 1
        FROM club_members
        WHERE club_id = ?
          AND user_id = ?
          AND accepted = 1
    `).get(clubId, reqUserId);
}

router.get('/list', (req, res) => {
    try {
        const authErr = requireAuth(req, res);
        if (authErr) return;

        const userId = req.session.userId;
        const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 20));

        const clubs = db.prepare(`
            SELECT
                c.id,
                c.name,
                c.description,
                c.created_at,
                c.created_by,
                (SELECT COUNT(*) FROM club_members cm2 WHERE cm2.club_id = c.id AND cm2.accepted = 1) AS members_count,
                CASE
                    WHEN EXISTS (
                        SELECT 1 FROM club_members cm WHERE cm.club_id = c.id AND cm.user_id = ? AND cm.accepted = 1
                    ) THEN 1 ELSE 0
                END AS is_member
            FROM clubs c
            ORDER BY c.created_at DESC
            LIMIT ?
        `).all(userId, limit);

        res.json({ clubs });
    } catch (err) {
        console.error('Ошибка clubs/list:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.get('/my', (req, res) => {
    try {
        const authErr = requireAuth(req, res);
        if (authErr) return;

        const userId = req.session.userId;

        const clubs = db.prepare(`
            SELECT
                c.id,
                c.name,
                c.description,
                c.created_at,
                cm.role,
                (SELECT COUNT(*) FROM club_members cm2 WHERE cm2.club_id = c.id AND cm2.accepted = 1) AS members_count,
                COALESCE(ms.rating, 0) AS my_rating
            FROM clubs c
            JOIN club_members cm ON cm.club_id = c.id AND cm.user_id = ? AND cm.accepted = 1
            LEFT JOIN club_member_stats ms ON ms.club_id = c.id AND ms.user_id = ?
            ORDER BY c.created_at DESC
        `).all(userId, userId);

        res.json({ clubs });
    } catch (err) {
        console.error('Ошибка clubs/my:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.post('/create', (req, res) => {
    try {
        const authErr = requireAuth(req, res);
        if (authErr) return;

        const userId = req.session.userId;
        const name = (req.body?.name || '').trim();
        const description = (req.body?.description || '').trim();

        if (name.length < 2 || name.length > 40) return res.status(400).json({ error: 'Название клуба 2-40 символов' });

        // UNIQUE(name) может кинуть ошибку - обработаем
        const existing = db.prepare('SELECT id FROM clubs WHERE LOWER(name) = LOWER(?)').get(name);
        if (existing) return res.status(400).json({ error: 'Клуб с таким названием уже существует' });

        const result = db.prepare(`
            INSERT INTO clubs (name, description, created_by)
            VALUES (?, ?, ?)
        `).run(name, description || null, userId);

        const clubId = result.lastInsertRowid;

        db.prepare(`
            INSERT INTO club_members (club_id, user_id, role, accepted)
            VALUES (?, ?, 'owner', 1)
        `).run(clubId, userId);

        db.prepare(`
            INSERT INTO club_member_stats (club_id, user_id, rating)
            VALUES (?, ?, 0)
        `).run(clubId, userId);

        res.json({ success: true, club: { id: clubId, name, description } });
    } catch (err) {
        console.error('Ошибка clubs/create:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.post('/:clubId/join', (req, res) => {
    try {
        const authErr = requireAuth(req, res);
        if (authErr) return;

        const userId = req.session.userId;
        const clubId = parseInt(req.params.clubId, 10);
        if (!clubId) return res.status(400).json({ error: 'Некорректный clubId' });

        const club = getClubRow(clubId);
        if (!club) return res.status(404).json({ error: 'Клуб не найден' });

        const exists = db.prepare(`
            SELECT 1 FROM club_members
            WHERE club_id = ? AND user_id = ? AND accepted = 1
        `).get(clubId, userId);
        if (exists) return res.status(400).json({ error: 'Вы уже в клубе' });

        db.prepare(`
            INSERT INTO club_members (club_id, user_id, role, accepted)
            VALUES (?, ?, 'member', 1)
        `).run(clubId, userId);

        db.prepare(`
            INSERT OR IGNORE INTO club_member_stats (club_id, user_id, rating)
            VALUES (?, ?, 0)
        `).run(clubId, userId);

        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка clubs/join:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.post('/:clubId/leave', (req, res) => {
    try {
        const authErr = requireAuth(req, res);
        if (authErr) return;

        const userId = req.session.userId;
        const clubId = parseInt(req.params.clubId, 10);
        if (!clubId) return res.status(400).json({ error: 'Некорректный clubId' });

        const membership = db.prepare(`
            SELECT role FROM club_members
            WHERE club_id = ? AND user_id = ? AND accepted = 1
        `).get(clubId, userId);

        if (!membership) return res.status(404).json({ error: 'Вы не состоите в клубе' });

        if (membership.role === 'owner') {
            return res.status(400).json({ error: 'Владелец не может выйти из клуба (MVP)' });
        }

        db.prepare('DELETE FROM club_members WHERE club_id = ? AND user_id = ? AND accepted = 1').run(clubId, userId);
        db.prepare('DELETE FROM club_member_stats WHERE club_id = ? AND user_id = ?').run(clubId, userId);

        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка clubs/leave:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

router.get('/:clubId/stats', (req, res) => {
    try {
        const authErr = requireAuth(req, res);
        if (authErr) return;

        const userId = req.session.userId;
        const clubId = parseInt(req.params.clubId, 10);

        if (!clubId) return res.status(400).json({ error: 'Некорректный clubId' });
        if (!isMember(userId, clubId)) return res.status(403).json({ error: 'Доступ только участникам клуба' });

        const club = getClubRow(clubId);
        if (!club) return res.status(404).json({ error: 'Клуб не найден' });

        const ranking = db.prepare(`
            SELECT
                u.id,
                u.username,
                u.display_name,
                u.avatar_seed,
                cm.role,
                ms.games_played,
                ms.games_won_as_spy,
                ms.games_won_as_civilian,
                ms.games_lost,
                ms.rating
            FROM club_members cm
            JOIN users u ON u.id = cm.user_id
            JOIN club_member_stats ms ON ms.club_id = cm.club_id AND ms.user_id = cm.user_id
            WHERE cm.club_id = ?
              AND cm.accepted = 1
            ORDER BY ms.rating DESC, u.display_name ASC
        `).all(clubId);

        const totals = db.prepare(`
            SELECT
                SUM(games_played) AS games_played,
                SUM(games_won_as_spy) AS games_won_as_spy,
                SUM(games_won_as_civilian) AS games_won_as_civilian,
                SUM(games_lost) AS games_lost,
                SUM(rating) AS team_rating
            FROM club_member_stats
            WHERE club_id = ?
        `).get(clubId);

        res.json({
            club: {
                id: club.id,
                name: club.name,
                description: club.description,
                created_at: club.created_at,
                created_by: club.created_by
            },
            totals: totals || {},
            ranking
        });
    } catch (err) {
        console.error('Ошибка clubs/stats:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;

