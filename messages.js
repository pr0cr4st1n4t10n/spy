let socket = null;
let currentUser = null;
let currentFriendId = null;
let renderedMessageIds = new Set();
let conversationsCache = new Map(); // friendId -> conversation row from /api/messages/conversations

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

function getQueryInt(name) {
    const params = new URLSearchParams(window.location.search);
    const v = params.get(name);
    const num = v ? parseInt(v, 10) : null;
    return Number.isFinite(num) ? num : null;
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

function setThreadState({ friendId, friendDisplayName, isOnline, lastSeenText }) {
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const chatStatus = document.getElementById('chatStatus');
    const threadError = document.getElementById('threadError');

    currentFriendId = friendId;
    renderedMessageIds = new Set();

    messageInput.disabled = !friendId;
    sendBtn.disabled = !friendId;
    threadError.textContent = '';

    if (!friendId) {
        chatStatus.textContent = '';
        return;
    }

    const presencePart = isOnline ? 'онлайн' : `оффлайн${lastSeenText ? ' • ' + lastSeenText : ''}`;
    chatStatus.innerHTML = `<i class="fas fa-circle" style="font-size:10px; margin-right:6px; color:${isOnline ? '#4cd964' : '#ff6b6b'};"></i>${escapeHtml(friendDisplayName)}: ${escapeHtml(presencePart)}`;
}

function renderConversationList(conversations) {
    const listEl = document.getElementById('conversationsList');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!conversations || conversations.length === 0) {
        listEl.innerHTML = `<div class="muted">Пока нет диалогов</div>`;
        return;
    }

    conversationsCache = new Map();

    conversations.forEach(c => {
        const friendId = c.friend_id;
        conversationsCache.set(friendId, c);
        const isActive = friendId === currentFriendId;
        const lastText = c.last_message ? c.last_message.text : '';
        const lastAt = c.last_message_at ? new Date(c.last_message_at).toLocaleString('ru') : '';

        const dotClass = c.is_online ? 'presence-dot online' : 'presence-dot offline';
        const unreadBadge = c.unread_count > 0 ? `<div class="unread-badge">${c.unread_count}</div>` : '';

        const item = document.createElement('div');
        item.className = 'conversation-item' + (isActive ? ' active' : '');
        item.dataset.friendId = String(friendId);
        item.innerHTML = `
            <img class="conv-avatar" src="${getAvatarUrl(c.friend.avatar_seed || c.friend.username)}" alt="">
            <div style="min-width:0;flex:1;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span class="${dotClass}"></span>
                    <div class="conv-name" title="${escapeHtml(c.friend.display_name || c.friend.username)}">${escapeHtml(c.friend.display_name || c.friend.username)}</div>
                </div>
                <div style="color:#888; font-size:0.85rem; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(lastText)}">
                    ${escapeHtml(lastText || 'Нет сообщений')}
                </div>
                ${lastAt ? `<div style="color:#666; font-size:0.75rem; margin-top:2px;">${escapeHtml(lastAt)}</div>` : ''}
            </div>
            ${unreadBadge}
        `;

        item.addEventListener('click', async () => {
            document.querySelectorAll('.conversation-item').forEach(x => x.classList.remove('active'));
            item.classList.add('active');

            const friendIdNum = parseInt(item.dataset.friendId, 10);
            await loadDialog(friendIdNum);

            // сброс локального unread
            const badgeEl = item.querySelector('.unread-badge');
            if (badgeEl) badgeEl.remove();
        });

        listEl.appendChild(item);
    });
}

function appendMessageToThread(m) {
    const messagesList = document.getElementById('messagesList');
    if (!messagesList) return;

    if (renderedMessageIds.has(m.id)) return;
    renderedMessageIds.add(m.id);

    const row = document.createElement('div');
    const isMe = m.sender_id === currentUser.id;
    row.className = 'message-row' + (isMe ? ' me' : '');

    const avatarSeed = isMe
        ? (currentUser.avatar_seed || currentUser.username)
        : (m.sender_avatar_seed || m.sender_username || m.sender_display_name);
    const avatarUrl = getAvatarUrl(avatarSeed);

    const createdAt = m.created_at ? new Date(m.created_at).toLocaleString('ru') : '';
    row.innerHTML = `
        <img class="msg-avatar" src="${avatarUrl}" alt="" width="36" height="36">
        <div class="bubble">
            <div style="font-weight:700; color:${isMe ? '#e7f6ff' : '#4db8ff'}; font-size:0.9rem; margin-bottom:4px;">
                ${escapeHtml(isMe ? 'Вы' : (m.sender_display_name || 'Игрок'))}
            </div>
            <div style="white-space:pre-wrap; word-break:break-word;">${escapeHtml(m.text)}</div>
            <small>${escapeHtml(createdAt)}</small>
        </div>
    `;

    messagesList.appendChild(row);
}

async function loadDialog(friendId) {
    const messagesList = document.getElementById('messagesList');
    const threadError = document.getElementById('threadError');

    threadError.textContent = '';
    messagesList.innerHTML = `<div class="muted">Загрузка...</div>`;

    try {
        const res = await fetch(`/api/messages/dialog/${friendId}/messages?limit=100`, { credentials: 'same-origin' });
        const data = await res.json();

        if (!res.ok || data.error) {
            throw new Error(data.error || 'Ошибка загрузки диалога');
        }

        const friend = data.friend;

        const cache = conversationsCache.get(friendId);
        const isOnline = !!cache?.is_online;
        const lastSeenText = !cache?.is_online && cache?.last_seen ? `был(а) ${new Date(cache.last_seen).toLocaleString('ru')}` : '';
        setThreadState({
            friendId,
            friendDisplayName: friend ? (friend.display_name || friend.username) : 'Друг',
            isOnline,
            lastSeenText
        });

        messagesList.innerHTML = '';

        if (!data.messages || data.messages.length === 0) {
            messagesList.innerHTML = `<div class="muted">Пока нет сообщений</div>`;
            return;
        }

        data.messages.forEach(m => appendMessageToThread(m));
        messagesList.scrollTop = messagesList.scrollHeight;
    } catch (e) {
        threadError.textContent = e.message || 'Ошибка';
        messagesList.innerHTML = `<div class="muted">Не удалось загрузить диалог</div>`;
    }
}

async function loadConversations() {
    const listEl = document.getElementById('conversationsList');
    if (listEl) listEl.innerHTML = `<div class="muted">Загрузка...</div>`;

    const res = await fetch('/api/messages/conversations', { credentials: 'same-origin' });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Ошибка загрузки диалогов');

    renderConversationList(data.conversations || []);
}

function initSocket() {
    socket = io();

    socket.on('connect', () => {
        if (!currentUser) return;
        socket.emit('dm_register', { userId: currentUser.id });
    });

    socket.on('dm_new_message', (payload) => {
        if (!currentUser) return;

        const friendId = payload.from_user_id === currentUser.id ? payload.to_user_id : payload.from_user_id;
        if (!friendId) return;
        const isReceiver = payload.to_user_id === currentUser.id;

        // Обновляем thread
        if (currentFriendId === friendId) {
            appendMessageToThread({
                id: payload.id,
                sender_id: payload.from_user_id,
                text: payload.message,
                created_at: payload.created_at,
                sender_display_name: payload.sender_display_name,
                sender_username: payload.sender_username,
                sender_avatar_seed: payload.sender_avatar_seed
            });
            const messagesList = document.getElementById('messagesList');
            if (messagesList) messagesList.scrollTop = messagesList.scrollHeight;
        } else {
            // Обновляем unread badge в списке
            if (!isReceiver) return;
            const item = document.querySelector(`.conversation-item[data-friend-id="${friendId}"]`);
            if (item) {
                let badge = item.querySelector('.unread-badge');
                if (!badge) {
                    badge = document.createElement('div');
                    badge.className = 'unread-badge';
                    item.appendChild(badge);
                    badge.textContent = '1';
                } else {
                    badge.textContent = String(parseInt(badge.textContent || '0', 10) + 1);
                }
            }
        }
    });

    socket.on('dm_presence_changed', ({ userId, isOnline, lastSeen }) => {
        // Подсветка статуса в списке диалогов.
        const item = document.querySelector(`.conversation-item[data-friend-id="${userId}"]`);
        if (!item) return;

        const dot = item.querySelector('.presence-dot');
        if (dot) {
            dot.classList.remove('online', 'offline');
            dot.classList.add(isOnline ? 'online' : 'offline');
        }

        // Если выбран этот диалог — обновляем заголовок чата
        if (currentFriendId === userId) {
            const friendDisplayName = item.querySelector('.conv-name')?.textContent || 'Друг';
            const lastSeenText = !isOnline && lastSeen ? `был(а) ${new Date(lastSeen).toLocaleString('ru')}` : '';
            setThreadState({
                friendId: userId,
                friendDisplayName,
                isOnline: !!isOnline,
                lastSeenText
            });
        }
    });

    socket.on('dm_error', (e) => {
        const el = document.getElementById('threadError');
        if (el) el.textContent = e?.message || 'Ошибка';
    });
}

function initUi() {
    const sendBtn = document.getElementById('sendBtn');
    const messageInput = document.getElementById('messageInput');
    const threadError = document.getElementById('threadError');

    document.getElementById('sendBtn')?.addEventListener('click', () => {
        void sendMessage();
    });

    document.getElementById('messageInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') void sendMessage();
    });

    async function sendMessage() {
        if (!currentFriendId) return;
        const text = messageInput.value.trim();
        if (!text) return;

        sendBtn.disabled = true;
        threadError.textContent = '';

        try {
            socket.emit('dm_send_message', { toUserId: currentFriendId, message: text });
            messageInput.value = '';
        } catch (e) {
            threadError.textContent = e.message || 'Ошибка отправки';
        } finally {
            sendBtn.disabled = false;
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        currentUser = await ensureAuth();
        initSocket();
        initUi();

        await loadConversations();

        const friendFromQuery = getQueryInt('friend_id');
        if (friendFromQuery) {
            // Если в списке такого друга ещё нет — диалог всё равно появится после отправки первого сообщения.
            await loadDialog(friendFromQuery);
            document.querySelectorAll('.conversation-item').forEach(x => {
                if (parseInt(x.dataset.friendId, 10) === friendFromQuery) x.classList.add('active');
            });
        }
    } catch (err) {
        const el = document.getElementById('threadError');
        if (el) el.textContent = err.message || 'Ошибка';
    }
});

