// ================= СОСТОЯНИЕ ПРИЛОЖЕНИЯ =================
let currentDirection = 'BUY';
let currentResults = null;

// Элементы UI Калькулятора
const inputHigh = document.getElementById('input-high');
const inputLow = document.getElementById('input-low');
const errorMsg = document.getElementById('error-message');
const rangeVal = document.getElementById('range-val');
const volatilityBadge = document.getElementById('volatility-badge');
const historyList = document.getElementById('history-list');
const btnClearHistory = document.getElementById('btn-clear-history');
const btnSave = document.getElementById('btn-save');

// Элементы UI Авторизации
const authContainer = document.getElementById('auth-container');
const mainAppContainer = document.getElementById('main-app');
const userDisplayEmail = document.getElementById('user-display-email');

// ================= ИНИЦИАЛИЗАЦИЯ CLERK И КОНТРОЛЬ СЕССИИ =================
window.addEventListener('load', async function () {
    if (!window.Clerk) {
        console.error("Clerk script failed to load.");
        return;
    }

    // Инициализируем объект Clerk перед использованием
    await window.Clerk.load();

    // Проверяем статус пользователя
    if (window.Clerk.user) {
        // Пользователь авторизован! Открываем калькулятор
        authContainer.style.display = 'none';
        mainAppContainer.style.display = 'flex';
        
        // Отображаем email пользователя
        userDisplayEmail.innerText = window.Clerk.user.primaryEmailAddress.emailAddress;

        // Монтируем встроенную кнопку управления профилем и выхода от Clerk
        window.Clerk.mountUserButton(document.getElementById('user-button'));

        // Запускаем весь внутренний функционал калькулятора
        initCalculator();
    } else {
        // Пользователь не авторизован — показываем готовое защищенное окно входа Clerk
        mainAppContainer.style.display = 'none';
        authContainer.style.display = 'block';
        window.Clerk.mountSignIn(document.getElementById('auth-container'));
    }
});

// ================= НАСТРОЙКА СЛУШАТЕЛЕЙ КАЛЬКУЛЯТОРА =================
function initCalculator() {
    // Обработка переключения вкладок (Уровни / История)
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.target).classList.add('active');
        });
    });

    // Обработка переключения направления рынка (BUY / SELL)
    document.querySelectorAll('.dir-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.dir-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentDirection = btn.dataset.dir;
            calculate();
        });
    });

    inputHigh.addEventListener('input', calculate);
    inputLow.addEventListener('input', calculate);
    btnSave.addEventListener('click', saveToHistory);
    btnClearHistory.addEventListener('click', clearHistory);

    // Отрисовываем сохраненную историю при старте
    renderHistory();
}

// ================= МАТЕМАТИЧЕСКОЕ ЯДРО И ВАЛИДАЦИЯ =================
function calculate() {
    let high = parseFloat(inputHigh.value);
    let low = parseFloat(inputLow.value);

    if (isNaN(high) || isNaN(low)) {
        hideAllCards();
        rangeVal.innerText = '0.00';
        volatilityBadge.innerText = '-';
        volatilityBadge.style.color = 'var(--text-muted)';
        currentResults = null;
        errorMsg.style.display = 'none';
        return;
    }

    if (high < 0 || low < 0) {
        errorMsg.innerText = 'Цены не могут быть отрицательными!';
        errorMsg.style.display = 'block';
        hideAllCards();
        return;
    }

    if (low > high) {
        errorMsg.innerText = 'High должен быть больше Low! Меняем местами...';
        errorMsg.style.display = 'block';
        
        let temp = high;
        high = low;
        low = temp;
        inputHigh.value = high;
        inputLow.value = low;
        
        setTimeout(() => { errorMsg.style.display = 'none'; }, 2500);
    } else {
        errorMsg.style.display = 'none';
    }

    if (high === low) return;

    const range = high - low;
    rangeVal.innerText = range.toFixed(2);

    let showCorrection = false;
    let showBigConsolidation = false;

    // Вывод коротких тегов для Range по ТЗ
    if (range < 60) {
        volatilityBadge.innerText = '<60';
        volatilityBadge.style.color = 'var(--text-muted)';
    } else if (range >= 60 && range < 90) {
        volatilityBadge.innerText = '≥60';
        volatilityBadge.style.color = '#749dd6';
        showCorrection = true;
    } else if (range >= 90) {
        volatilityBadge.innerText = '≥90 ✓';
        volatilityBadge.style.color = '#4cd964';
        showCorrection = true;
        showBigConsolidation = true;
    }

    const sqrtRange = Math.sqrt(range);
    let dataLevels = {};

    if (currentDirection === 'BUY') {
        dataLevels.reversal = { val: high + (range / 2.6), dir: 'SELL' };
        dataLevels.correction = { val: high - (5.099 * sqrtRange), dir: 'BUY' };
        dataLevels.bigConsolidation = { val: low + (1.817 * sqrtRange), dir: 'BUY' };
        dataLevels.consolidation = { val: low + (1.216 * sqrtRange), dir: 'BUY' };
    } else {
        dataLevels.reversal = { val: low - (range / 2.6), dir: 'BUY' };
        dataLevels.correction = { val: low + (5.099 * sqrtRange), dir: 'SELL' };
        dataLevels.bigConsolidation = { val: high - (1.788 * sqrtRange), dir: 'SELL' };
        dataLevels.consolidation = { val: high - (1.216 * sqrtRange), dir: 'SELL' };
    }

    currentResults = {
        direction: currentDirection,
        high: high.toFixed(2),
        low: low.toFixed(2),
        range: range.toFixed(2),
        levels: dataLevels,
        config: { showCorrection, showBigConsolidation }
    };

    updateCardDisplay('reversal', dataLevels.reversal, true);
    updateCardDisplay('correction', dataLevels.correction, showCorrection);
    updateCardDisplay('big-consolidation', dataLevels.bigConsolidation, showBigConsolidation);
    updateCardDisplay('consolidation', dataLevels.consolidation, true);
}

function updateCardDisplay(id, levelData, isVisible) {
    const card = document.getElementById(`card-${id}`);
    if (!isVisible) {
        card.classList.remove('visible');
        return;
    }
    card.classList.add('visible');
    document.getElementById(`val-${id}`).innerText = levelData.val.toFixed(2);
    
    const badge = document.getElementById(`badge-${id}`);
    badge.innerText = levelData.dir;
    badge.className = 'level-badge ' + (levelData.dir === 'BUY' ? 'badge-buy' : 'badge-sell');
}

function hideAllCards() {
    document.querySelectorAll('.level-card').forEach(card => card.classList.remove('visible'));
}

// ================= РАБОТА С ИСТОРИЕЙ (LOCALSTORAGE) =================
function saveToHistory() {
    if (!currentResults) return;

    const now = new Date();
    const timeStamp = now.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

    let history = JSON.parse(localStorage.getItem('trading_history_cache')) || [];
    history.unshift({ time: timeStamp, ...currentResults });

    if (history.length > 20) {
        history.pop();
    }

    localStorage.setItem('trading_history_cache', JSON.stringify(history));

    const originalText = btnSave.innerText;
    btnSave.innerText = '✓ Успешно сохранено';
    btnSave.style.color = '#4cd964';
    
    setTimeout(() => {
        btnSave.innerText = originalText;
        btnSave.style.color = '#e2b764';
    }, 1200);

    renderHistory();
}

function renderHistory() {
    let history = JSON.parse(localStorage.getItem('trading_history_cache')) || [];
    historyList.innerHTML = '';

    if (history.length === 0) {
        historyList.innerHTML = '<div style="text-align:center; color: var(--text-muted); padding: 30px 0; font-size:0.9rem;">История расчетов пуста</div>';
        btnClearHistory.style.display = 'none';
        return;
    }

    btnClearHistory.style.display = 'block';

    history.forEach((item, index) => {
        let levelsHtml = `<div style="display:flex; justify-content:space-between;"><span>Разворот (${item.levels.reversal.dir}):</span> <strong>${item.levels.reversal.val.toFixed(2)}</strong></div>`;
        if (item.config.showCorrection) levelsHtml += `<div style="display:flex; justify-content:space-between;"><span>Коррекция (${item.levels.correction.dir}):</span> <strong>${item.levels.correction.val.toFixed(2)}</strong></div>`;
        if (item.config.showBigConsolidation) levelsHtml += `<div style="display:flex; justify-content:space-between;"><span>Бол. консолид. (${item.levels.bigConsolidation.dir}):</span> <strong>${item.levels.bigConsolidation.val.toFixed(2)}</strong></div>`;
        levelsHtml += `<div style="display:flex; justify-content:space-between;"><span>Консолидация (${item.levels.consolidation.dir}):</span> <strong>${item.levels.consolidation.val.toFixed(2)}</strong></div>`;

        const wrapper = document.createElement('div');
        wrapper.className = 'history-item-wrapper';
        wrapper.innerHTML = `
            <div class="history-item-delete-bg" onclick="deleteHistoryItem(${index}, true)">Удалить</div>
            <div class="history-item-content ${item.direction.toLowerCase()}-type">
                <div class="history-header">
                    <span class="history-dir ${item.direction.toLowerCase()}">${item.direction}</span>
                    <div class="history-header-right">
                        <span class="history-date">${item.time}</span>
                        <button class="delete-item-btn" onclick="deleteHistoryItem(${index}, false)" title="Удалить запись">×</button>
                    </div>
                </div>
                <div class="history-meta">H: ${item.high} | L: ${item.low} | R: ${item.range}</div>
                <div class="history-levels">${levelsHtml}</div>
            </div>
        `;
        historyList.appendChild(wrapper);
    });
    initSwipeLogic();
}

window.deleteHistoryItem = function(index, isMobileSwipe = false) {
    if (!isMobileSwipe) {
        if (!confirm('Вы уверены, что хотите удалить эту запись?')) return;
    }
    let history = JSON.parse(localStorage.getItem('trading_history_cache')) || [];
    history.splice(index, 1);
    localStorage.setItem('trading_history_cache', JSON.stringify(history));
    renderHistory();
};

function clearHistory() {
    if (confirm('Вы уверены, что хотите полностью очистить историю расчетов?')) {
        localStorage.removeItem('trading_history_cache');
        renderHistory();
    }
}

function initSwipeLogic() {
    const items = document.querySelectorAll('.history-item-content');
    items.forEach(item => {
        let startX = 0, currentX = 0, isDragging = false;
        item.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            isDragging = true;
            item.style.transition = 'none';
        }, { passive: true });
        item.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            currentX = e.touches[0].clientX - startX;
            if (currentX < 0) {
                if (currentX < -90) currentX = -90;
                item.style.transform = `translateX(${currentX}px)`;
            } else {
                item.style.transform = `translateX(0px)`;
            }
        }, { passive: true });
        item.addEventListener('touchend', () => {
            isDragging = false;
            item.style.transition = 'transform 0.3s ease';
            if (currentX < -45) item.style.transform = `translateX(-80px)`;
            else item.style.transform = `translateX(0px)`;
        });
    });
}