/**
 * Единое модальное окно «О сайте и игре» для всех страниц.
 */
(function () {
    const MODAL_HTML = `
        <div class="modal-content info-about-site-modal">
            <h2><i class="fas fa-info-circle"></i> О сайте и игре</h2>
            <div class="modal-body info-about-site-body">
                <p><strong>Добро пожаловать!</strong> Этот сайт — онлайн-версия настольной игры «Шпион». Она подходит даже тем, кто никогда не играл в подобные игры: все кнопки простые, а шаги идут по очереди.</p>

                <h3>Что здесь вообще происходит:</h3>
                <ul>
                    <li>Все игроки попадают в одну комнату и начинают раунд.</li>
                    <li>Почти все получают одну и ту же локацию (например, «Пляж» или «Ресторан»).</li>
                    <li>Один игрок получает роль шпиона и локацию не видит.</li>
                    <li>Игроки задают друг другу вопросы и отвечают так, чтобы не выдать лишнего.</li>
                    <li>Задача мирных — вычислить шпиона. Задача шпиона — не спалиться и/или угадать локацию.</li>
                </ul>

                <h3>Как начать, если вы впервые:</h3>
                <ul>
                    <li>Введите имя и нажмите «Создать комнату» (если вы организатор) или «Присоединиться» (если вам дали код комнаты).</li>
                    <li>Если вы хост, дождитесь минимум 3 игроков и нажмите «Начать игру».</li>
                    <li>Читайте подсказки на экране: игра сама подсказывает, чей сейчас ход и что нужно сделать.</li>
                    <li>Во время своего хода выберите игрока, задайте вопрос или ответьте в появившемся окне.</li>
                    <li>Когда появится голосование — выберите, кто, по вашему мнению, шпион.</li>
                </ul>

                <h3>Примеры безопасных вопросов (без раскрытия локации):</h3>
                <ul>
                    <li>«Что здесь обычно делают в первую очередь?»</li>
                    <li>«Какое время суток здесь, на твой взгляд, самое активное?»</li>
                    <li>«Как бы ты описал атмосферу этого места одним словом?»</li>
                </ul>

                <h3>Чего лучше не делать:</h3>
                <ul>
                    <li>Не называйте локацию напрямую в вопросах и ответах.</li>
                    <li>Не задавайте слишком очевидные вопросы вроде «Какой здесь официант?».</li>
                    <li>Не игнорируйте таймер: если время выйдет, ход будет считаться пропущенным.</li>
                </ul>

                <h3>Про AI-ботов:</h3>
                <ul>
                    <li>Хост может добавить AI-ботов в лобби через отдельную плашку с плюсом.</li>
                    <li>Боты участвуют как обычные игроки: задают вопросы, отвечают и голосуют.</li>
                    <li>Боты специально отвечают с задержкой, чтобы игра ощущалась естественнее.</li>
                </ul>

                <h3>Если что-то не работает:</h3>
                <ul>
                    <li>Обновите страницу и заново войдите в комнату по коду.</li>
                    <li>Проверьте интернет: при нестабильной сети можно пропустить сообщения.</li>
                    <li>Если пропал звук — проверьте кнопку с иконкой динамика в шапке.</li>
                </ul>

                <h3>Кнопки в шапке:</h3>
                <ul>
                    <li><i class="fas fa-sun"></i> / <i class="fas fa-moon"></i> — смена оформления (светлая/тёмная тема)</li>
                    <li><i class="fas fa-volume-up"></i> — включение/отключение звуков игры</li>
                    <li><i class="fas fa-cloud-moon"></i> — включение/отключение падающих эмодзи на фоне</li>
                    <li><i class="fas fa-info-circle"></i> — открывает эту подробную справку</li>
                </ul>
            </div>
            <button type="button" id="closeInfoAboutSiteBtn" class="btn-secondary">Закрыть</button>
        </div>
    `;

    function ensureInfoAboutSiteModal() {
        let modal = document.getElementById('infoAboutSiteModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'infoAboutSiteModal';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }
        if (modal.dataset.infoContentReady === '1') return;
        modal.innerHTML = MODAL_HTML;
        modal.dataset.infoContentReady = '1';
    }

    function wireInfoAboutSiteModal() {
        const infoBtn = document.getElementById('infoAboutSiteBtn');
        const infoModal = document.getElementById('infoAboutSiteModal');
        const closeInfo = document.getElementById('closeInfoAboutSiteBtn');
        if (!infoBtn || !infoModal || infoBtn.dataset.infoModalWired === '1') return;
        infoBtn.dataset.infoModalWired = '1';
        infoBtn.addEventListener('click', () => infoModal.classList.add('active'));
        if (closeInfo) {
            closeInfo.addEventListener('click', () => infoModal.classList.remove('active'));
        }
        infoModal.addEventListener('click', (e) => {
            if (e.target === infoModal) infoModal.classList.remove('active');
        });
    }

    window.ensureInfoAboutSiteModal = ensureInfoAboutSiteModal;
    ensureInfoAboutSiteModal();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wireInfoAboutSiteModal);
    } else {
        wireInfoAboutSiteModal();
    }
})();
