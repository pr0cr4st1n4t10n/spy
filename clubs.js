let currentUser = null;
let selectedClubId = null;

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
}

function getAvatarUrl(seed) {
    if (!seed) return 'https://api.dicebear.com/7.x/avataaars/svg?seed=default&backgroundColor=4db8ff';
    if (String(seed).startsWith('/uploads/')) return seed;
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}&backgroundColor=4db8ff`;
}

async function ensureAuth() {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
    const data = await res.json();
    if (!data.user) {
        window.location.href = '/login';
        return null;
    }
    return data.user;
}

async function loadMyClubs() {
    const list = document.getElementById('myClubsList');
    if (!list) return;
    list.innerHTML = '<div class="muted">Загрузка...</div>';

    const res = await fetch('/api/clubs/my', { credentials: 'same-origin' });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Ошибка загрузки моих клубов');

    const clubs = data.clubs || [];
    if (!clubs.length) {
        list.innerHTML = '<div class="muted">Пока нет клубов</div>';
        return;
    }

    list.innerHTML = '';
    clubs.forEach(c => {
        const item = document.createElement('div');
        item.className = 'club-item' + (c.id === selectedClubId ? ' active' : '');
        item.dataset.clubId = String(c.id);
        item.innerHTML = `
            <div class="row" style="justify-content:space-between;">
                <div style="min-width:0;">
                    <div class="club-name" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(c.name)}</div>
                    <div class="muted" style="font-size:0.85rem; margin-top:4px;">
                        участников: ${c.members_count ?? 0} • ваш рейтинг: ${c.my_rating ?? 0}
                    </div>
                </div>
                <div class="muted" style="font-size:0.85rem; white-space:nowrap;">${escapeHtml(c.role || '')}</div>
            </div>
            <div class="row" style="margin-top:10px; justify-content:flex-end;">
                ${c.role !== 'owner' ? `<button class="btn-outline-danger" data-action="leave" style="width:auto;"><i class="fas fa-sign-out-alt"></i> Выйти</button>` : ''}
                <button class="btn-small" data-action="details" style="width:auto;"><i class="fas fa-chart-line"></i> Детали</button>
            </div>
        `;

        item.addEventListener('click', (e) => {
            const detailsBtn = e.target.closest('button[data-action="details"]');
            if (detailsBtn) {
                void loadClubStats(c.id, item);
            } else if (e.target.closest('button[data-action="leave"]')) {
                void leaveClub(c.id);
            }
        });

        list.appendChild(item);
    });
}

async function loadAvailableClubs() {
    const list = document.getElementById('availableClubsList');
    if (!list) return;
    list.innerHTML = '<div class="muted">Загрузка...</div>';

    const res = await fetch('/api/clubs/list?limit=20', { credentials: 'same-origin' });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Ошибка загрузки клубов');

    const clubs = data.clubs || [];
    if (!clubs.length) {
        list.innerHTML = '<div class="muted">Нет клубов</div>';
        return;
    }

    list.innerHTML = '';
    clubs.forEach(c => {
        const item = document.createElement('div');
        item.className = 'club-item' + (c.id === selectedClubId ? ' active' : '');
        item.dataset.clubId = String(c.id);
        item.innerHTML = `
            <div style="display:flex; gap:10px; align-items:flex-start; justify-content:space-between;">
                <div style="min-width:0;">
                    <div class="club-name" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(c.name)}</div>
                    <div class="muted" style="font-size:0.85rem; margin-top:4px;">участников: ${c.members_count ?? 0}</div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
                    <button class="btn-small" data-action="details" style="width:auto;">
                        <i class="fas fa-chart-line"></i> Статистика
                    </button>
                    ${c.is_member ? `<div class="muted" style="font-size:0.85rem; align-self:center;">вы уже в клубе</div>` : `<button class="btn-small" data-action="join" style="width:auto;"><i class="fas fa-user-plus"></i> Вступить</button>`}
                </div>
            </div>
        `;

        item.addEventListener('click', (e) => {
            const btnJoin = e.target.closest('button[data-action="join"]');
            const btnDetails = e.target.closest('button[data-action="details"]');
            if (btnJoin) void joinClub(c.id);
            if (btnDetails) void loadClubStats(c.id, item);
        });

        list.appendChild(item);
    });
}

async function loadClubStats(clubId, clickedEl) {
    const clubDetails = document.getElementById('clubDetails');
    const wrap = document.getElementById('clubStatsWrap');
    if (!wrap || !clubDetails) return;

    selectedClubId = clubId;
    document.querySelectorAll('.club-item').forEach(x => x.classList.remove('active'));
    if (clickedEl) clickedEl.classList.add('active');

    wrap.innerHTML = '<div class="muted">Загрузка...</div>';
    clubDetails.textContent = 'Загрузка...';

    const res = await fetch(`/api/clubs/${clubId}/stats`, { credentials: 'same-origin' });
    const data = await res.json();
    if (!res.ok || data.error) {
        wrap.innerHTML = `<div class="muted">${escapeHtml(data.error || 'Нет доступа к статистике')}</div>`;
        clubDetails.textContent = 'Нет доступа';
        return;
    }

    const club = data.club;
    const totals = data.totals || {};

    clubDetails.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div>
                <div style="font-weight:900;font-size:1.1rem;">${escapeHtml(club.name)}</div>
                <div class="muted" style="font-size:0.85rem; margin-top:4px;">${club.description ? escapeHtml(club.description) : 'без описания'}</div>
            </div>
            <div class="muted" style="font-size:0.85rem;">команда рейтинг: ${totals.team_rating ?? 0}</div>
        </div>
    `;

    const ranking = data.ranking || [];
    const header = `
        <table class="table">
            <thead>
                <tr>
                    <th>Игрок</th>
                    <th>Роль</th>
                    <th>Игры</th>
                    <th>Победы шпиона</th>
                    <th>Победы мирного</th>
                    <th>Поражения</th>
                    <th>Рейтинг</th>
                </tr>
            </thead>
            <tbody>
    `;

    const rows = ranking.map((r, idx) => `
        <tr>
            <td>
                <div style="display:flex;gap:10px;align-items:center;">
                    <img src="${getAvatarUrl(r.avatar_seed || r.username)}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;border:2px solid rgba(77,184,255,0.35);">
                    <div>
                        <div style="font-weight:800;">#${idx + 1} ${escapeHtml(r.display_name || r.username)}</div>
                        <div class="muted" style="font-size:0.85rem;">@${escapeHtml(r.username)}</div>
                    </div>
                </div>
            </td>
            <td>${escapeHtml(r.role || '')}</td>
            <td>${r.games_played ?? 0}</td>
            <td>${r.games_won_as_spy ?? 0}</td>
            <td>${r.games_won_as_civilian ?? 0}</td>
            <td>${r.games_lost ?? 0}</td>
            <td style="font-weight:900; color:#4db8ff;">${r.rating ?? 0}</td>
        </tr>
    `).join('');

    const footer = `
            </tbody>
        </table>
    `;

    wrap.innerHTML = `
        <div class="row" style="margin-bottom:12px;">
            <div class="muted">Всего игр в клубе: <strong style="color:#4db8ff;">${totals.games_played ?? 0}</strong></div>
            <div class="muted">Победы шпиона: <strong style="color:#4cd964;">${totals.games_won_as_spy ?? 0}</strong></div>
            <div class="muted">Победы мирного: <strong style="color:#4db8ff;">${totals.games_won_as_civilian ?? 0}</strong></div>
        </div>
        ${header}${rows}${footer}
    `;
}

async function createClub() {
    const errEl = document.getElementById('clubsError');
    const name = document.getElementById('createClubName')?.value?.trim() || '';
    const description = document.getElementById('createClubDescription')?.value?.trim() || '';
    if (!name) {
        if (errEl) {
            errEl.textContent = 'Введите название клуба';
            errEl.style.display = 'block';
        }
        return;
    }
    if (errEl) {
        errEl.textContent = '';
    }

    const res = await fetch('/api/clubs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
        credentials: 'same-origin'
    });
    const data = await res.json();
    if (!res.ok || data.error) {
        if (errEl) errEl.textContent = data.error || 'Ошибка создания';
        return;
    }

    document.getElementById('createClubName').value = '';
    document.getElementById('createClubDescription').value = '';
    await refreshLists();
}

async function joinClub(clubId) {
    const res = await fetch(`/api/clubs/${clubId}/join`, {
        method: 'POST',
        credentials: 'same-origin'
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Ошибка вступления');
    await refreshLists();
}

async function leaveClub(clubId) {
    const res = await fetch(`/api/clubs/${clubId}/leave`, { method: 'POST', credentials: 'same-origin' });
    const data = await res.json();
    if (!res.ok || data.error) {
        alert(data.error || 'Ошибка выхода');
        return;
    }
    selectedClubId = null;
    await refreshLists();
}

async function refreshLists() {
    await Promise.all([loadMyClubs(), loadAvailableClubs()]);
}

document.addEventListener('DOMContentLoaded', async () => {
    currentUser = await ensureAuth();
    if (!currentUser) return;

    document.getElementById('createClubBtn')?.addEventListener('click', async () => {
        try {
            await createClub();
        } catch (e) {
            const errEl = document.getElementById('clubsError');
            if (errEl) errEl.textContent = e?.message || 'Ошибка';
        }
    });

    await refreshLists();
});

