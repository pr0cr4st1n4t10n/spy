/**
 * Единая шапка как на главной: авторизация, уведомления, поиск, «О сайте».
 * Подключать после header.js на страницах с разметкой #authLinks (как в index.html).
 */
(function () {
    function escapeHtmlForDisplay(text) {
        const div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    function getHeaderAvatarUrl(seed) {
        if (!seed) return 'https://api.dicebear.com/7.x/avataaars/svg?seed=default&backgroundColor=4db8ff';
        const s = String(seed);
        if (s.startsWith('/uploads/')) return s;
        return 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(s) + '&backgroundColor=4db8ff';
    }

    function initInfoModal() {
        const infoBtn = document.getElementById('infoAboutSiteBtn');
        const infoModal = document.getElementById('infoAboutSiteModal');
        const closeInfo = document.getElementById('closeInfoAboutSiteBtn');
        if (!infoBtn || !infoModal) return;
        infoBtn.addEventListener('click', () => infoModal.classList.add('active'));
        if (closeInfo) closeInfo.addEventListener('click', () => infoModal.classList.remove('active'));
        infoModal.addEventListener('click', (e) => {
            if (e.target === infoModal) infoModal.classList.remove('active');
        });
    }

    function initHeaderUserSearch() {
        const headerSearch = document.getElementById('headerSearch');
        const headerSearchResults = document.getElementById('headerSearchResults');
        if (!headerSearch || !headerSearchResults) return;
        let searchTimeout;
        headerSearch.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            const q = headerSearch.value.trim();
            if (q.length < 2) {
                headerSearchResults.style.display = 'none';
                headerSearchResults.innerHTML = '';
                return;
            }
            searchTimeout = setTimeout(async () => {
                try {
                    const res = await fetch('/api/profile/search?q=' + encodeURIComponent(q));
                    const data = await res.json();
                    headerSearchResults.innerHTML = '';
                    if (data.users && data.users.length > 0) {
                        data.users.forEach(u => {
                            const a = document.createElement('a');
                            a.href = '/profile/' + u.id;
                            a.style.cssText = 'display: flex; align-items: center; gap: 12px; padding: 10px 12px; color: inherit; text-decoration: none; border-bottom: 1px solid rgba(255,255,255,0.06);';
                            a.innerHTML = '<img src="' + getHeaderAvatarUrl(u.avatar_seed || u.username) + '" style="width:36px;height:36px;border-radius:50%;object-fit:cover;"><div><strong>' + escapeHtmlForDisplay(u.display_name || u.username) + '</strong><br><small style="color:#888">@' + escapeHtmlForDisplay(u.username) + '</small></div>';
                            headerSearchResults.appendChild(a);
                        });
                        headerSearchResults.style.display = 'block';
                    } else {
                        headerSearchResults.innerHTML = '<div style="padding:12px;color:#888;">Никого не найдено</div>';
                        headerSearchResults.style.display = 'block';
                    }
                } catch (e) {
                    headerSearchResults.style.display = 'none';
                }
            }, 300);
        });
        headerSearch.addEventListener('focus', () => {
            if (headerSearchResults.innerHTML) headerSearchResults.style.display = 'block';
        });
        document.addEventListener('click', (e) => {
            if (!headerSearch.contains(e.target) && !headerSearchResults.contains(e.target)) {
                headerSearchResults.style.display = 'none';
            }
        });
    }

    function wireNotifications() {
        const notificationsBell = document.getElementById('notificationsBell');
        const notificationsDropdown = document.getElementById('notificationsDropdown');
        const notificationsBadge = document.getElementById('notificationsBadge');
        if (!notificationsBell || !notificationsDropdown) return;

        notificationsBell.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (notificationsDropdown.style.display === 'block') {
                notificationsDropdown.style.display = 'none';
                return;
            }
            try {
                const res = await fetch('/api/profile/notifications/list', { credentials: 'same-origin' });
                const data = await res.json();
                const list = data.notifications || [];
                let unread = 0;
                let html = '<div style="padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;"><strong>Уведомления</strong><button id="deleteAllNotificationsBtn" style="background:none;border:none;color:#ff6b6b;cursor:pointer;font-size:0.85rem;">Удалить все</button></div>';
                if (list.length) {
                    list.forEach(n => {
                        if (!n.read_at) unread++;
                        let msg = '';
                        let actions = '';
                        if (n.type === 'friend_request') {
                            msg = ' хочет добавить вас в друзья';
                            actions = `<button class="accept-friend-btn" data-user-id="${n.data.from_user_id}" style="background:#4cd964;border:none;color:white;padding:4px 8px;border-radius:4px;cursor:pointer;margin-right:4px;font-size:0.85rem;">Принять</button><button class="reject-friend-btn" data-user-id="${n.data.from_user_id}" style="background:#ff6b6b;border:none;color:white;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:0.85rem;">Отклонить</button>`;
                        } else if (n.type === 'friend_accepted') {
                            msg = ' принял заявку в друзья';
                        } else if (n.type === 'profile_like') {
                            msg = ' лайкнул ваш профиль';
                        } else if (n.type === 'comment') {
                            msg = ' оставил комментарий';
                        } else if (n.type === 'game_invite') {
                            msg = ' приглашает вас в игру';
                            const roomCode = n.data.room_code || '';
                            actions = `<button class="accept-invite-btn" data-room-code="${roomCode}" style="background:#4cd964;border:none;color:white;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:0.85rem;">Принять</button>`;
                        } else if (n.type === 'dm_message') {
                            msg = ' написал вам в чат';
                        }
                        const from = n.from_name ? escapeHtmlForDisplay(n.from_name) : 'Кто-то';
                        const link = (n.type === 'dm_message' && n.data && n.data.from_user_id)
                            ? ('/messages?friend_id=' + n.data.from_user_id)
                            : ((n.data && n.data.from_user_id) ? '/profile/' + n.data.from_user_id : '#');
                        const bgColor = n.read_at ? 'rgba(255,255,255,0.02)' : 'rgba(77,184,255,0.1)';
                        html += `<div style="display:flex;align-items:center;padding:10px 12px;background:${bgColor};border-bottom:1px solid rgba(255,255,255,0.06);" data-notif-id="${n.id}">
                            <a href="${link}" style="flex:1;color:inherit;text-decoration:none;" data-id="${n.id}">
                                <strong>${from}</strong>${msg}<br><small style="color:#888">${new Date(n.created_at).toLocaleString('ru')}</small>
                            </a>
                            <div style="display:flex;align-items:center;gap:4px;">${actions}<button class="delete-notif-btn" data-id="${n.id}" style="background:none;border:none;color:#ff6b6b;cursor:pointer;padding:4px 8px;margin-left:4px;" title="Удалить">×</button></div>
                        </div>`;
                    });
                } else {
                    html += '<div style="padding:12px;color:#888;text-align:center;">Нет уведомлений</div>';
                }
                notificationsDropdown.innerHTML = html;
                notificationsDropdown.style.display = 'block';
                if (notificationsBadge) {
                    if (unread > 0) {
                        notificationsBadge.textContent = unread > 99 ? '99+' : unread.toString();
                        notificationsBadge.style.display = 'flex';
                    } else {
                        notificationsBadge.textContent = '';
                        notificationsBadge.style.display = 'none';
                    }
                }
                notificationsDropdown.querySelectorAll('a[data-id]').forEach(a => {
                    a.addEventListener('click', () => {
                        fetch('/api/profile/notifications/' + a.dataset.id + '/read', { method: 'PATCH', credentials: 'same-origin' }).catch(() => { });
                    });
                });
                notificationsDropdown.querySelectorAll('.accept-friend-btn').forEach(btn => {
                    btn.addEventListener('click', async (ev) => {
                        ev.stopPropagation();
                        const userId = parseInt(btn.dataset.userId, 10);
                        try {
                            await fetch('/api/profile/' + userId + '/friend', { method: 'POST', credentials: 'same-origin' });
                            btn.closest('[data-notif-id]').remove();
                        } catch (err) { /* ignore */ }
                    });
                });
                notificationsDropdown.querySelectorAll('.reject-friend-btn').forEach(btn => {
                    btn.addEventListener('click', async (ev) => {
                        ev.stopPropagation();
                        const userId = parseInt(btn.dataset.userId, 10);
                        try {
                            await fetch('/api/profile/' + userId + '/friend/reject', { method: 'POST', credentials: 'same-origin' });
                            btn.closest('[data-notif-id]').remove();
                        } catch (err) { /* ignore */ }
                    });
                });
                notificationsDropdown.querySelectorAll('.accept-invite-btn').forEach(btn => {
                    btn.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        const roomCode = btn.dataset.roomCode;
                        if (roomCode) window.location.href = '/room/' + roomCode;
                    });
                });
                notificationsDropdown.querySelectorAll('.delete-notif-btn').forEach(btn => {
                    btn.addEventListener('click', async (ev) => {
                        ev.stopPropagation();
                        const id = btn.dataset.id;
                        try {
                            await fetch('/api/profile/notifications/' + id, { method: 'DELETE', credentials: 'same-origin' });
                            btn.closest('[data-notif-id]').remove();
                            const res2 = await fetch('/api/profile/notifications/list', { credentials: 'same-origin' });
                            const d = await res2.json();
                            const unreadCount = (d.notifications || []).filter(n => !n.read_at).length;
                            if (notificationsBadge) {
                                if (unreadCount > 0) {
                                    notificationsBadge.textContent = unreadCount > 99 ? '99+' : unreadCount.toString();
                                    notificationsBadge.style.display = 'flex';
                                } else {
                                    notificationsBadge.textContent = '';
                                    notificationsBadge.style.display = 'none';
                                }
                            }
                        } catch (err) { /* ignore */ }
                    });
                });
                const deleteAllBtn = document.getElementById('deleteAllNotificationsBtn');
                if (deleteAllBtn) {
                    deleteAllBtn.addEventListener('click', async (ev) => {
                        ev.stopPropagation();
                        if (!confirm('Удалить все уведомления?')) return;
                        try {
                            await fetch('/api/profile/notifications', { method: 'DELETE', credentials: 'same-origin' });
                            notificationsDropdown.innerHTML = '<div style="padding:12px;color:#888;text-align:center;">Нет уведомлений</div>';
                            if (notificationsBadge) notificationsBadge.style.display = 'none';
                        } catch (err) { /* ignore */ }
                    });
                }
            } catch (err) {
                notificationsDropdown.innerHTML = '<div style="padding:12px;color:#888;">Ошибка загрузки</div>';
                notificationsDropdown.style.display = 'block';
            }
        });
        document.addEventListener('click', () => {
            notificationsDropdown.style.display = 'none';
        });
    }

    async function syncAuthHeader() {
        const authLinks = document.getElementById('authLinks');
        if (!authLinks) return;

        const loginLink = document.getElementById('loginLink');
        const profileLink = document.getElementById('profileLink');
        const logoutLink = document.getElementById('logoutLink');
        const userDisplayName = document.getElementById('userDisplayName');
        const adminLink = document.getElementById('adminLink');
        const messagesLink = document.getElementById('messagesLink');
        const clubsLink = document.getElementById('clubsLink');
        const notificationsWrap = document.getElementById('notificationsWrap');
        const notificationsBadge = document.getElementById('notificationsBadge');

        try {
            const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
            const data = await res.json();
            if (data.user) {
                if (loginLink) loginLink.style.display = 'none';
                if (profileLink) {
                    profileLink.href = '/profile/' + data.user.id;
                    profileLink.style.display = 'inline-flex';
                }
                if (userDisplayName) userDisplayName.textContent = data.user.display_name || data.user.username;
                if (adminLink && data.user.is_admin) adminLink.style.display = 'inline';
                if (messagesLink) messagesLink.style.display = 'inline-flex';
                if (clubsLink) clubsLink.style.display = 'inline-flex';
                if (logoutLink) {
                    logoutLink.style.display = 'inline';
                    logoutLink.onclick = async (e) => {
                        e.preventDefault();
                        await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
                        window.location.reload();
                    };
                }
                if (notificationsWrap) notificationsWrap.style.display = 'block';
                wireNotifications();
                (async () => {
                    try {
                        const nr = await fetch('/api/profile/notifications/list', { credentials: 'same-origin' });
                        const nd = await nr.json();
                        const unread = (nd.notifications || []).filter(n => !n.read_at).length;
                        if (notificationsBadge) {
                            if (unread > 0) {
                                notificationsBadge.textContent = unread > 99 ? '99+' : unread.toString();
                                notificationsBadge.style.display = 'flex';
                            } else {
                                notificationsBadge.textContent = '';
                                notificationsBadge.style.display = 'none';
                            }
                        }
                    } catch (e) { /* ignore */ }
                })();
            } else {
                if (loginLink) loginLink.style.display = 'inline';
                if (profileLink) profileLink.style.display = 'none';
                if (logoutLink) logoutLink.style.display = 'none';
                if (adminLink) adminLink.style.display = 'none';
                if (messagesLink) messagesLink.style.display = 'none';
                if (clubsLink) clubsLink.style.display = 'none';
                if (notificationsWrap) notificationsWrap.style.display = 'none';
            }
        } catch (e) {
            if (loginLink) loginLink.style.display = 'inline';
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        initHeaderUserSearch();
        initInfoModal();
        syncAuthHeader();
    });
})();
