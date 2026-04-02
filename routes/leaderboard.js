const express = require('express');
const db = require('../database');

const router = express.Router();

// Топ игроков по рейтингу
router.get('/', (req, res) => {
    try {
        const top = db.prepare(`
            SELECT u.id, u.username, u.display_name, u.avatar_seed,
                   COALESCE(s.rating, 0) as rating,
                   COALESCE(s.games_played, 0) as games_played,
                   COALESCE(s.games_won_as_spy, 0) + COALESCE(s.games_won_as_civilian, 0) as wins
            FROM users u
            LEFT JOIN user_stats s ON u.id = s.user_id
            WHERE u.deleted_at IS NULL
              AND u.is_banned = 0
            ORDER BY COALESCE(s.rating, 0) DESC
            LIMIT 50
        `).all();
        res.json({ top });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Топ клубов по суммарному рейтингу участников (команда = сумма рейтингов в клубе)
router.get('/clubs', (req, res) => {
    try {
        const clubs = db.prepare(`
            SELECT
                c.id,
                c.name,
                c.description,
                COALESCE(SUM(ms.rating), 0) AS team_rating,
                COUNT(DISTINCT cm.user_id) AS members_count,
                COALESCE(SUM(ms.games_played), 0) AS total_games
            FROM clubs c
            LEFT JOIN club_members cm ON cm.club_id = c.id AND cm.accepted = 1
            LEFT JOIN club_member_stats ms ON ms.club_id = c.id AND ms.user_id = cm.user_id
            GROUP BY c.id
            HAVING members_count > 0
            ORDER BY team_rating DESC, members_count DESC, c.name ASC
            LIMIT 50
        `).all();
        res.json({ clubs });
    } catch (err) {
        console.error('Ошибка leaderboard/clubs:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

module.exports = router;
