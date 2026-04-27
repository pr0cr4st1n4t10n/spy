const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

function randomItem(items) {
    return items[Math.floor(Math.random() * items.length)];
}

function buildFallbackText(kind, context = {}) {
    const questionTemplates = [
        'Когда ты оказываешься здесь, что обычно делаешь в первые минуты?',
        'Какая мелкая деталь в поведении людей здесь чаще всего повторяется?',
        'Что здесь обычно меняется сильнее: темп, шум или ожидание?',
        'Что здесь бывает неловко делать, хотя в другом месте это нормально?'
    ];
    const answerTemplates = [
        'Скорее всего все зависит от времени, но обычно тут довольно оживленно.',
        'Я бы сказал, что это место про привычные действия, без экстрима.',
        'Обычно люди ведут себя спокойно и по ситуации.',
        'Наверное, здесь многое решает контекст, но в целом атмосфера понятная.'
    ];
    const chatTemplates = [
        'Интересно, пока не могу определиться, но ответы звучат правдоподобно.',
        'Хороший вопрос, из такого легко сделать выводы.',
        'Надо присмотреться к деталям, кто-то точно палится.'
    ];

    if (kind === 'question') return randomItem(questionTemplates);
    if (kind === 'answer') return randomItem(answerTemplates);
    if (kind === 'chat') return randomItem(chatTemplates);
    if (kind === 'guess') {
        const options = Array.isArray(context.guessOptions) ? context.guessOptions : [];
        if (options.length > 0) return randomItem(options);
        return context.currentLocation || 'Пляж';
    }
    return 'Понял, продолжаем.';
}

async function completeAsHumanLike(kind, context = {}) {
    if (!OPENROUTER_API_KEY) {
        return buildFallbackText(kind, context);
    }

    const systemPrompt = [
        'Ты участник игры "Шпион".',
        'Пиши по-русски.',
        'Фраза должна быть естественной, как от живого игрока.',
        'Не упоминай, что ты ИИ или бот.',
        'Не раскрывай роль напрямую.',
        (kind === 'question' || kind === 'answer') ? 'Никогда не называй конкретную локацию прямо.' : '',
        (kind === 'question' || kind === 'answer') ? 'Избегай любых характерных подсказок локации (еда, самолеты, сцена, книги, больные, спорт и т.п.).' : '',
        (kind === 'question' || kind === 'answer') ? 'Пиши максимально абстрактно и нейтрально, чтобы нельзя было угадать локацию по фразе.' : '',
        kind === 'question' ? 'Сформулируй один короткий вопрос именно для проверки на шпиона: проверяй реалистичность опыта, последовательность действий, уместность поведения. Никакой философии и общих вопросов "про жизнь".' : '',
        kind === 'answer' ? 'Дай короткий правдоподобный ответ на вопрос.' : '',
        kind === 'chat' ? 'Напиши короткую реплику в общий чат.' : '',
        kind === 'guess' ? 'Выбери одну локацию из доступных вариантов и ответь только названием.' : ''
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
                temperature: 0.9,
                max_tokens: kind === 'guess' ? 20 : 100,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ]
            })
        });

        if (!response.ok) {
            return buildFallbackText(kind, context);
        }

        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (!text) {
            return buildFallbackText(kind, context);
        }
        return text.split('\n')[0].trim();
    } catch (error) {
        return buildFallbackText(kind, context);
    }
}

module.exports = {
    completeAsHumanLike,
    buildFallbackText
};
