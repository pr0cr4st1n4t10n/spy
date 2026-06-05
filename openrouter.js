const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

let apiKeyWarningShown = false;

function randomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function getRecentTexts(answerHistory, field) {
    if (!Array.isArray(answerHistory)) return [];
    return answerHistory
        .map((entry) => (entry && entry[field] ? String(entry[field]).trim().toLowerCase() : ''))
        .filter(Boolean);
}

function pickUniqueTemplate(templates, recentTexts) {
    const recent = new Set(recentTexts);
    const fresh = templates.filter((item) => !recent.has(item.toLowerCase()));
    return randomItem(fresh.length ? fresh : templates);
}

const SPY_GAME_QUESTION_TEMPLATES = [
    'Что ты обычно делаешь сразу после того, как сюда приходишь?',
    'Какой самый частый повод прийти сюда у большинства людей?',
    'Что здесь чаще всего мешает или раздражает?',
    'Какая мелочь здесь сразу выдаёт новичка?',
    'Сколько обычно занимает типичное посещение этого места?',
    'Что здесь принято делать, а что — нет?',
    'Какой звук или запах ты здесь замечаешь первым?',
    'Что люди чаще всего забывают, когда приходят сюда?',
    'Как обычно выглядит самый загруженный момент здесь?',
    'Что здесь чаще всего спрашивают у персонала?',
    'Какая деталь в одежде или поведении здесь выглядит неуместно?',
    'Что здесь делают, если задерживаются дольше обычного?'
];

const OFF_TOPIC_QUESTION_TRIGGERS = [
    'знаком',
    'незнаком',
    'в жизни',
    'по жизни',
    'в целом',
    'вообще',
    'где угодно',
    'в любом месте',
    'что для тебя важно',
    'как ты считаешь',
    'какой твой любимый',
    'реагируешь, когда',
    'встречаешь',
    'отношени',
    'чувств',
    'философ',
    'мечта',
    'идеальн',
    'если бы ты мог',
    'в группе',
    'групп',
    'мнен',
    'обсужда',
    'себя вед',
    'обычно себя',
    'спор',
    'конфликт',
    'компани',
    'характер',
    'личност',
    'стресс',
    'нервн'
];

const REQUIRED_LOCATION_ANCHORS = [
    'здесь',
    'сюда',
    'этом месте',
    'это место',
    'таком месте',
    'приходишь',
    'приходят',
    'приходите',
    'посещени',
    'очеред',
    'персонал',
    'нович',
    'на входе',
    'на выходе'
];

function isValidSpyGameQuestion(text) {
    const normalized = (text || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
    if (!normalized || normalized.length < 12) return false;
    if (OFF_TOPIC_QUESTION_TRIGGERS.some((trigger) => normalized.includes(trigger))) return false;
    if (!REQUIRED_LOCATION_ANCHORS.some((anchor) => normalized.includes(anchor))) return false;
    return true;
}

function pickSpyGameFallbackQuestion(answerHistory) {
    const recentQuestions = getRecentTexts(answerHistory, 'question');
    return pickUniqueTemplate(SPY_GAME_QUESTION_TEMPLATES, recentQuestions);
}

function buildFallbackText(kind, context = {}) {
    const recentQuestions = getRecentTexts(context.answerHistory, 'question');
    const recentAnswers = getRecentTexts(context.answerHistory, 'answer');

    const questionTemplates = SPY_GAME_QUESTION_TEMPLATES;
    const answerTemplates = [
        'Обычно сначала осматриваюсь и понимаю, куда лучше встать.',
        'Чаще всего прихожу по делу, без лишней суеты.',
        'Наверное, минут пятнадцать, если без очереди.',
        'Тут важно не мешать другим и держаться в рамках.',
        'Самое заметное — как люди ведут себя в очереди.',
        'Если задержаться, обычно просто ждёшь своей очереди.',
        'Новичков сразу видно по тому, что они не знают, куда идти.',
        'Чаще всего все приходят с одной и той же целью.'
    ];
    const chatTemplates = [
        'Интересно, кто-то уже явно выделяется.',
        'Надо внимательнее слушать ответы.',
        'Пока сложно сказать, но пара ответов настораживает.',
        'Кажется, кто-то отвечает слишком общими фразами.',
        'Есть ощущение, что один из нас точно не в теме.'
    ];

    if (kind === 'question') return pickUniqueTemplate(questionTemplates, recentQuestions);
    if (kind === 'answer') return pickUniqueTemplate(answerTemplates, recentAnswers);
    if (kind === 'chat') return randomItem(chatTemplates);
    if (kind === 'guess') {
        const options = Array.isArray(context.guessOptions) ? context.guessOptions : [];
        if (options.length > 0) return randomItem(options);
        return context.currentLocation || 'Пляж';
    }
    return 'Понял, продолжаем.';
}

function buildHistoryHint(answerHistory) {
    if (!Array.isArray(answerHistory) || !answerHistory.length) return '';
    const recent = answerHistory.slice(-5);
    const lines = recent.map((entry, index) => {
        const asker = entry.asker || 'Игрок';
        const answerer = entry.answerer || 'Игрок';
        const question = entry.question || '';
        const answer = entry.answer || '';
        return `${index + 1}. ${asker} -> ${answerer}: Q: ${question} / A: ${answer}`;
    });
    return `Недавние вопросы и ответы (не повторяй их формулировки): ${lines.join(' | ')}`;
}

async function completeAsHumanLike(kind, context = {}) {
    if (kind === 'question') {
        return pickSpyGameFallbackQuestion(context.answerHistory);
    }

    if (!OPENROUTER_API_KEY) {
        if (!apiKeyWarningShown) {
            apiKeyWarningShown = true;
            console.warn('[openrouter] OPENROUTER_API_KEY не задан — бот использует локальные шаблоны вместо ИИ.');
        }
        return buildFallbackText(kind, context);
    }

    const historyHint = buildHistoryHint(context.answerHistory);
    const roleHint = context.role === 'spy'
        ? 'Ты шпион и не знаешь локацию. Отвечай осторожно, правдоподобно и без конкретики, которая может выдать незнание.'
        : 'Ты мирный житель и знаешь локацию. Говори уверенно, но не называй её и не давай прямых подсказок.';

    const systemPrompt = [
        'Ты участник игры "Шпион".',
        'Пиши по-русски.',
        'Фраза должна быть естественной, как от живого игрока.',
        'Не упоминай, что ты ИИ или бот.',
        'Не раскрывай роль напрямую.',
        roleHint,
        (kind === 'question' || kind === 'answer') ? 'Никогда не называй конкретную локацию прямо.' : '',
        (kind === 'question' || kind === 'answer') ? 'Не используй очевидные подсказки локации (еда, самолёты, сцена, книги, больные, спорт и т.п.).' : '',
        kind === 'question' ? 'Все игроки находятся в одной секретной локации (её название нельзя произносить). Задай ОДИН короткий вопрос другому игроку строго про эту локацию: что люди делают здесь, как ведут себя, сколько времени проводят, что непринято, что замечают новички.' : '',
        kind === 'question' ? 'Вопрос ОБЯЗАН быть привязан к месту — используй слова "здесь", "сюда", "когда приходишь сюда", "в этом месте".' : '',
        kind === 'question' ? 'Запрещены общие вопросы про жизнь, знакомых, чувства, отношения, встречи вне локации, философию. Примеры плохих вопросов: "как реагируешь на знакомых", "что для тебя важно в жизни".' : '',
        kind === 'question' ? 'Примеры хороших вопросов: "Что ты делаешь сразу, как сюда приходишь?", "Что здесь чаще всего раздражает?", "Какая мелочь выдаёт новичка здесь?".' : '',
        kind === 'answer' ? 'Дай короткий правдоподобный ответ на вопрос, 1-2 предложения.' : '',
        kind === 'chat' ? 'Напиши короткую реплику в общий чат, без повторения чужих фраз.' : '',
        kind === 'guess' ? 'Выбери одну локацию из доступных вариантов и ответь только названием.' : '',
        historyHint
    ].filter(Boolean).join(' ');

    const userPrompt = JSON.stringify({
        kind,
        role: context.role || null,
        locationHint: context.locationHint || null,
        targetName: context.targetName || null,
        askerName: context.askerName || null,
        question: context.question || null,
        guessOptions: context.guessOptions || [],
        answerHistory: Array.isArray(context.answerHistory) ? context.answerHistory : []
    });

    try {
        const response = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
                'X-Title': process.env.OPENROUTER_APP_NAME || 'spy-game-online'
            },
            body: JSON.stringify({
                model: OPENROUTER_MODEL,
                temperature: 1.0,
                max_tokens: kind === 'guess' ? 20 : 100,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ]
            })
        });

        if (!response.ok) {
            console.warn('[openrouter] API error:', response.status);
            return buildFallbackText(kind, context);
        }

        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (!text) {
            return buildFallbackText(kind, context);
        }
        const line = text.split('\n')[0].trim();
        if (kind === 'question' && !isValidSpyGameQuestion(line)) {
            return buildFallbackText(kind, context);
        }
        return line;
    } catch (error) {
        console.warn('[openrouter] request failed:', error.message);
        return buildFallbackText(kind, context);
    }
}

module.exports = {
    completeAsHumanLike,
    buildFallbackText,
    isValidSpyGameQuestion,
    pickSpyGameFallbackQuestion
};
