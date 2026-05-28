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
    list.innerHTML = '<div class="clubs-muted">Загрузка...</div>';

    const res = await fetch('/api/clubs/my', { credentials: 'same-origin' });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Ошибка загрузки моих клубов');

    const clubs = data.clubs || [];
    if (!clubs.length) {
        list.innerHTML = '<div class="clubs-muted">Пока нет клубов</div>';
        return;
    }

    list.innerHTML = '';
    clubs.forEach(c => {
        const item = document.createElement('div');
        item.className = 'club-item' + (c.id === selectedClubId ? ' active' : '');
        item.dataset.clubId = String(c.id);
        const roleClass = c.role === 'owner' ? 'owner' : '';
        const roleLabel = c.role === 'owner' ? 'Владелец' : (c.role === 'member' ? 'Участник' : escapeHtml(c.role || ''));
        item.innerHTML = `
            <div class="club-item-head">
                <div class="club-item-icon"><i class="fas fa-shield-alt"></i></div>
                <div class="club-item-body">
                    <div class="club-name">${escapeHtml(c.name)}</div>
                    <div class="club-item-meta">участников: ${c.members_count ?? 0} · ваш рейтинг: ${c.my_rating ?? 0}</div>
                </div>
                <span class="club-role-badge ${roleClass}">${roleLabel}</span>
            </div>
            <div class="club-item-actions">
                ${c.role !== 'owner' ? `<button type="button" class="clubs-btn-outline-danger" data-action="leave"><i class="fas fa-sign-out-alt"></i> Выйти</button>` : ''}
                <button type="button" class="clubs-btn-small" data-action="details"><i class="fas fa-chart-line"></i> Детали</button>
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
    list.innerHTML = '<div class="clubs-muted">Загрузка...</div>';

    const res = await fetch('/api/clubs/list?limit=20', { credentials: 'same-origin' });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Ошибка загрузки клубов');

    const clubs = data.clubs || [];
    if (!clubs.length) {
        list.innerHTML = '<div class="clubs-muted">Нет клубов</div>';
        return;
    }

    list.innerHTML = '';
    clubs.forEach(c => {
        const item = document.createElement('div');
        item.className = 'club-item' + (c.id === selectedClubId ? ' active' : '');
        item.dataset.clubId = String(c.id);
        item.innerHTML = `
            <div class="club-item-head">
                <div class="club-item-icon"><i class="fas fa-users"></i></div>
                <div class="club-item-body">
                    <div class="club-name">${escapeHtml(c.name)}</div>
                    <div class="club-item-meta">участников: ${c.members_count ?? 0}</div>
                </div>
            </div>
            <div class="club-item-actions">
                <button type="button" class="clubs-btn-small" data-action="details">
                    <i class="fas fa-chart-line"></i> Статистика
                </button>
                ${c.is_member
                    ? '<span class="clubs-muted" style="align-self:center;font-size:0.85rem;">вы в клубе</span>'
                    : '<button type="button" class="clubs-btn-small" data-action="join"><i class="fas fa-user-plus"></i> Вступить</button>'}
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

    wrap.innerHTML = '<div class="clubs-muted">Загрузка...</div>';
    clubDetails.innerHTML = '<div class="clubs-muted">Загрузка...</div>';

    const res = await fetch(`/api/clubs/${clubId}/stats`, { credentials: 'same-origin' });
    const data = await res.json();
    if (!res.ok || data.error) {
        wrap.innerHTML = '';
        clubDetails.innerHTML = `<div class="clubs-empty-state"><i class="fas fa-lock"></i><strong>Нет доступа</strong><span>${escapeHtml(data.error || 'Статистика недоступна')}</span></div>`;
        return;
    }

    const club = data.club;
    const totals = data.totals || {};

    clubDetails.innerHTML = `
        <div class="clubs-details-header">
            <div class="club-name-lg">${escapeHtml(club.name)}</div>
            <p class="clubs-muted" style="margin:0;">${club.description ? escapeHtml(club.description) : 'Без описания'}</p>
        </div>
    `;

    const ranking = data.ranking || [];
    const rows = ranking.map((r, idx) => `
        <tr>
            <td>
                <div style="display:flex;gap:10px;align-items:center;">
                    <img src="${getAvatarUrl(r.avatar_seed || r.username)}" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid rgba(77,184,255,0.35);">
                    <div>
                        <div style="font-weight:800;">#${idx + 1} ${escapeHtml(r.display_name || r.username)}</div>
                        <div class="clubs-muted" style="font-size:0.85rem;">@${escapeHtml(r.username)}</div>
                    </div>
                </div>
            </td>
            <td>${escapeHtml(r.role || '')}</td>
            <td>${r.games_played ?? 0}</td>
            <td>${r.games_won_as_spy ?? 0}</td>
            <td>${r.games_won_as_civilian ?? 0}</td>
            <td>${r.games_lost ?? 0}</td>
            <td style="font-weight:800;color:#4db8ff;">${r.rating ?? 0}</td>
        </tr>
    `).join('');

    wrap.innerHTML = `
        <div class="clubs-stats-pills">
            <div class="clubs-stat-pill">Рейтинг команды<strong>${totals.team_rating ?? 0}</strong></div>
            <div class="clubs-stat-pill">Всего игр<strong>${totals.games_played ?? 0}</strong></div>
            <div class="clubs-stat-pill">Победы шпиона<strong class="green">${totals.games_won_as_spy ?? 0}</strong></div>
            <div class="clubs-stat-pill">Победы мирных<strong>${totals.games_won_as_civilian ?? 0}</strong></div>
        </div>
        <div class="clubs-table-wrap">
            <table class="clubs-table">
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
                <tbody>${rows || '<tr><td colspan="7" class="clubs-muted">Нет данных</td></tr>'}</tbody>
            </table>
        </div>
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

