const VOTE_URL = "https://premioibest.vote/719796142";

// Wrapper seguro para o localStorage (evita crashes se o navegador bloquear cookies/storage local)
const safeStorage = {
    getItem(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    setItem(key, value) {
        try { localStorage.setItem(key, value); } catch (e) {}
    },
    removeItem(key) {
        try { localStorage.removeItem(key); } catch (e) {}
    },
    clear() {
        try { localStorage.clear(); } catch (e) {}
    }
};

let VOTE_COOLDOWN_MS = parseInt(safeStorage.getItem('saninplay_cooldown_override')) || 24 * 60 * 60 * 1000; // 24 hours (suporta override de dev)

const state = {
    lastVoteTime: safeStorage.getItem('saninplay_last_vote') || null,
    timerInterval: null
};

// Install Prompt Logic
let deferredPrompt;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isStandalone = window.navigator.standalone === true;

// Elements
const el = {
    statusIcon: document.getElementById('statusIcon'),
    statusTitle: document.getElementById('statusTitle'),
    statusMessage: document.getElementById('statusMessage'),
    progressContainer: document.getElementById('progressContainer'),
    progressBar: document.getElementById('progressBar'),
    timeLeft: document.getElementById('timeLeft'),
    voteButton: document.getElementById('voteButton'),
    btnText: document.querySelector('.btn-text'),
    enableNotif: document.getElementById('enableNotifications'),
    installBtn: document.getElementById('installButton'),
    toast: document.getElementById('toast'),
    iosInstallModal: document.getElementById('iosInstallModal'),
    closeIosModal: document.getElementById('closeIosModal'),
    
    // Dev Tools elements
    logoImg: document.querySelector('.logo-container img'),
    devModal: document.getElementById('devToolsModal'),
    closeDevModal: document.getElementById('closeDevModal'),
    devBtnTestNow: document.getElementById('dev-btn-test-now'),
    devBtnTest10s: document.getElementById('dev-btn-test-10s'),
    devBtnTest1m: document.getElementById('dev-btn-test-1m'),
    devBtnTestTrigger: document.getElementById('dev-btn-test-trigger'),
    devBtnSimulateEnd: document.getElementById('dev-btn-simulate-end'),
    devBtnClearVote: document.getElementById('dev-btn-clear-vote'),
    devBtnResetApp: document.getElementById('dev-btn-reset-app'),
    devCooldownBtns: document.querySelectorAll('.btn-dev-cooldown')
};

// Register Service Worker and handle updates
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then(reg => {
            console.log('Service Worker registered', reg);
            // Force check for updates
            reg.update();
        })
        .catch(err => console.error('Service Worker registration failed', err));

    // Reload page when new Service Worker takes control
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
            refreshing = true;
            window.location.reload();
        }
    });
}

let logoClicks = 0;
let logoClickTimeout;

function init() {
    checkNotificationPermission();

    el.voteButton.addEventListener('click', handleVote);
    el.enableNotif.addEventListener('click', requestNotificationPermission);

    if (el.installBtn) {
        el.installBtn.addEventListener('click', handleInstallClick);
    }

    if (el.closeIosModal) {
        el.closeIosModal.addEventListener('click', () => {
            if (el.iosInstallModal) el.iosInstallModal.classList.add('hidden');
        });
    }

    if (el.iosInstallModal) {
        el.iosInstallModal.addEventListener('click', (e) => {
            if (e.target === el.iosInstallModal) {
                el.iosInstallModal.classList.add('hidden');
            }
        });
    }

    // Exibe botão de instalação para iOS se não estiver em modo standalone
    if (isIOS && !isStandalone && el.installBtn) {
        el.installBtn.innerHTML = '⬇️ INSTALAR APP NO IPHONE';
        el.installBtn.classList.remove('hidden');
    }

    // DevTools: Contagem de cliques no logo
    if (el.logoImg) {
        el.logoImg.addEventListener('click', () => {
            logoClicks++;
            clearTimeout(logoClickTimeout);
            if (logoClicks >= 10) {
                logoClicks = 0;
                openDevToolsModal();
            } else {
                logoClickTimeout = setTimeout(() => {
                    logoClicks = 0;
                }, 3000);
            }
        });
    }

    // DevTools: Botões do modal
    if (el.closeDevModal) {
        el.closeDevModal.addEventListener('click', closeDevToolsModal);
    }

    if (el.devModal) {
        el.devModal.addEventListener('click', (e) => {
            if (e.target === el.devModal) {
                closeDevToolsModal();
            }
        });
    }

    if (el.devBtnTestNow) {
        el.devBtnTestNow.addEventListener('click', () => {
            showLocalNotification();
            showToast("Notificação imediata enviada!");
        });
    }

    if (el.devBtnTest10s) {
        el.devBtnTest10s.addEventListener('click', () => {
            if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type: 'SCHEDULE_NOTIFICATION',
                    delay: 10000
                });
                showToast("Notificação agendada p/ daqui a 10 segundos via SW!");
            } else {
                showToast("Service Worker inativo! Recarregue a página.");
            }
        });
    }

    if (el.devBtnTest1m) {
        el.devBtnTest1m.addEventListener('click', () => {
            if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type: 'SCHEDULE_NOTIFICATION',
                    delay: 60000
                });
                showToast("Notificação agendada p/ daqui a 1 minuto via SW!");
            } else {
                showToast("Service Worker inativo! Recarregue a página.");
            }
        });
    }

    if (el.devBtnTestTrigger) {
        el.devBtnTestTrigger.addEventListener('click', testTimestampTrigger);
    }

    if (el.devBtnSimulateEnd) {
        el.devBtnSimulateEnd.addEventListener('click', () => {
            if (state.lastVoteTime) {
                const fakeLastVote = Date.now() - VOTE_COOLDOWN_MS - 1000;
                safeStorage.setItem('saninplay_last_vote', fakeLastVote.toString());
                state.lastVoteTime = fakeLastVote.toString();
                updateState();
                updateDevToolsInfo();
                showToast("Cooldown finalizado simulado!");
            } else {
                showToast("Nenhum voto anterior registrado.");
            }
        });
    }

    if (el.devBtnClearVote) {
        el.devBtnClearVote.addEventListener('click', () => {
            safeStorage.removeItem('saninplay_last_vote');
            state.lastVoteTime = null;
            updateState();
            updateDevToolsInfo();
            showToast("Histórico de votos zerado!");
        });
    }

    if (el.devBtnResetApp) {
        el.devBtnResetApp.addEventListener('click', () => {
            if (confirm("Deseja resetar todo o app? Isso limpará dados locais e desregistrará o Service Worker.")) {
                safeStorage.clear();
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.getRegistrations().then(registrations => {
                        for (let reg of registrations) {
                            reg.unregister();
                        }
                    });
                }
                showToast("App resetado! Recarregando...");
                setTimeout(() => window.location.reload(), 1200);
            }
        });
    }

    el.devCooldownBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const newCooldown = parseInt(btn.getAttribute('data-cooldown'));
            VOTE_COOLDOWN_MS = newCooldown;
            safeStorage.setItem('saninplay_cooldown_override', newCooldown.toString());
            
            // Define o último voto para "agora" para forçar a contagem do novo cooldown a começar do início
            const now = Date.now().toString();
            safeStorage.setItem('saninplay_last_vote', now);
            state.lastVoteTime = now;
            
            showToast(`Cooldown ajustado para ${newCooldown >= 60000 ? (newCooldown / 60000) + ' min' : (newCooldown / 1000) + 's'}!`);
            updateState();
            updateDevToolsInfo();
        });
    });

    updateState();
    injectCredits();

    // Add visibility change listener to handle returning to app
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === 'visible') {
            updateState();
            if (el.devModal && !el.devModal.classList.contains('hidden')) {
                updateDevToolsInfo();
            }
        }
    });
}

// PWA Install Logic
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (el.installBtn && !isIOS) {
        // Verifica se é mobile via User Agent
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        if (isMobile) {
            el.installBtn.innerHTML = '⬇️ INSTALAR APP NO CELULAR';
        } else {
            el.installBtn.innerHTML = '⬇️ INSTALAR APP NO PC';
        }

        el.installBtn.classList.remove('hidden');
    }
});

window.addEventListener('appinstalled', () => {
    if (el.installBtn) {
        el.installBtn.classList.add('hidden');
    }
    deferredPrompt = null;
    showToast("App instalado com sucesso! 🔥");
});

async function handleInstallClick() {
    if (isIOS) {
        if (el.iosInstallModal) {
            el.iosInstallModal.classList.remove('hidden');
        }
        return;
    }
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            console.log('User accepted the install prompt');
        }
        deferredPrompt = null;
        el.installBtn.classList.add('hidden');
    }
}

function updateState() {
    if (!state.lastVoteTime) {
        setReadyToVote();
        return;
    }

    const now = new Date().getTime();
    const timePassed = now - parseInt(state.lastVoteTime);

    if (timePassed >= VOTE_COOLDOWN_MS) {
        setReadyToVote();
    } else {
        setWaiting(timePassed);
    }
}

function setReadyToVote() {
    clearInterval(state.timerInterval);

    el.statusIcon.innerHTML = "🔥";
    el.statusTitle.textContent = "Hora de Votar!";
    el.statusMessage.textContent = "Seu voto está disponível agora.";

    el.progressContainer.classList.remove('active');
    el.timeLeft.classList.remove('active');

    el.voteButton.disabled = false;
    el.voteButton.classList.add('ready');
    el.voteButton.classList.remove('waiting');
    el.btnText.textContent = "⚡ CLIQUE PARA VOTAR";
}

function setWaiting(timePassed) {
    el.statusIcon.innerHTML = "⏳";
    el.statusTitle.textContent = "Voto Registrado!";
    el.statusMessage.textContent = "Aguarde o tempo acabar para votar de novo.";

    el.progressContainer.classList.add('active');
    el.timeLeft.classList.add('active');

    // Deixando o botão ativo para abrir o link, mas com estilo diferente
    el.voteButton.disabled = false;
    el.voteButton.classList.remove('ready');
    el.voteButton.classList.add('waiting');
    el.btnText.textContent = "🔗 ABRIR LINK NOVAMENTE";

    updateTimer(timePassed);

    clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
        const now = new Date().getTime();
        const tp = now - parseInt(state.lastVoteTime);
        if (tp >= VOTE_COOLDOWN_MS) {
            setReadyToVote();
            showLocalNotification();
        } else {
            updateTimer(tp);
        }
    }, 1000);
}

function updateTimer(timePassed) {
    const timeRemaining = VOTE_COOLDOWN_MS - timePassed;

    // Progress Bar
    const progressPercent = (timePassed / VOTE_COOLDOWN_MS) * 100;
    el.progressBar.style.width = `${progressPercent}%`;

    // Time format HH:MM:SS
    const hours = Math.floor((timeRemaining / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((timeRemaining / 1000 / 60) % 60);
    const seconds = Math.floor((timeRemaining / 1000) % 60);

    el.timeLeft.textContent =
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function handleVote() {
    // Open link
    window.open(VOTE_URL, '_blank');

    const now = new Date().getTime();

    // Se não tinha voto anterior ou já passou o tempo, reseta o timer
    if (!state.lastVoteTime || (now - parseInt(state.lastVoteTime)) >= VOTE_COOLDOWN_MS) {
        safeStorage.setItem('saninplay_last_vote', now.toString());
        state.lastVoteTime = now.toString();
        updateState();
        scheduleServiceWorkerNotification();
    }
}

function checkNotificationPermission() {
    if (!("Notification" in window)) return;

    if (Notification.permission === "default") {
        el.enableNotif.classList.remove('hidden');
    } else if (Notification.permission === "denied") {
        el.enableNotif.classList.add('hidden');
    } else {
        el.enableNotif.classList.add('hidden');
    }
}

function requestNotificationPermission() {
    if (!("Notification" in window)) {
        showToast("Seu navegador não suporta notificações.");
        return;
    }

    Notification.requestPermission().then(permission => {
        if (permission === "granted") {
            el.enableNotif.classList.add('hidden');
            showToast("Notificações ativadas!");
            scheduleServiceWorkerNotification();
        } else {
            showToast("Notificações negadas.");
        }
    });
}

function showLocalNotification() {
    if ("Notification" in window && Notification.permission === "granted") {
        navigator.serviceWorker.ready.then(registration => {
            registration.showNotification("SanInPlay 🔥", {
                body: "Tá na hora de votar de novo no iBest! Ajude o San!",
                icon: "ico192.png",
                badge: "badge.svg",
                vibrate: [200, 100, 200]
            });
        });
    }
}

function scheduleServiceWorkerNotification() {
    // Envia mensagem pro SW tentar agendar localmente
    if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
            type: 'SCHEDULE_NOTIFICATION',
            delay: VOTE_COOLDOWN_MS
        });
    }
}

function showToast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.remove('hidden');
    el.toast.classList.add('show');

    setTimeout(() => {
        el.toast.classList.remove('show');
        setTimeout(() => el.toast.classList.add('hidden'), 300);
    }, 3000);
}

function openDevToolsModal() {
    if (el.devModal) {
        el.devModal.classList.remove('hidden');
        updateDevToolsInfo();
    }
}

function closeDevToolsModal() {
    if (el.devModal) {
        el.devModal.classList.add('hidden');
    }
}

function updateDevToolsInfo() {
    const permissionSpan = document.getElementById('dev-info-permission');
    if (permissionSpan) {
        const hasNotification = typeof Notification !== 'undefined';
        const perm = hasNotification ? Notification.permission : 'Não suportado';
        permissionSpan.textContent = perm;
        permissionSpan.style.color = perm === 'granted' ? '#00f0ff' : '#ff007f';
    }
    
    const swSpan = document.getElementById('dev-info-sw');
    if (swSpan) {
        const hasController = !!navigator.serviceWorker.controller;
        swSpan.textContent = hasController ? 'Ativo' : 'Inativo';
        swSpan.style.color = hasController ? '#00f0ff' : '#ff007f';
    }
    
    const triggersSpan = document.getElementById('dev-info-triggers');
    if (triggersSpan) {
        const hasNotification = typeof Notification !== 'undefined';
        const supported = (hasNotification && 'showTrigger' in Notification.prototype) || 'TimestampTrigger' in window;
        triggersSpan.textContent = supported ? 'Suportado' : 'Não suportado';
        triggersSpan.style.color = supported ? '#00f0ff' : '#ff007f';
    }
    
    el.devCooldownBtns.forEach(btn => {
        if (parseInt(btn.getAttribute('data-cooldown')) === VOTE_COOLDOWN_MS) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    const nextSpan = document.getElementById('dev-info-next');
    if (nextSpan) {
        if (state.lastVoteTime) {
            const nextTime = parseInt(state.lastVoteTime) + VOTE_COOLDOWN_MS;
            const remaining = nextTime - Date.now();
            if (remaining > 0) {
                const dateStr = new Date(nextTime).toLocaleTimeString();
                nextSpan.textContent = `${dateStr} (em ${Math.round(remaining / 1000)}s)`;
            } else {
                nextSpan.textContent = 'Pronto para votar';
            }
        } else {
            nextSpan.textContent = 'Nenhum (Pronto)';
        }
    }
}

async function testTimestampTrigger() {
    const hasNotification = typeof Notification !== 'undefined';
    const supported = (hasNotification && 'showTrigger' in Notification.prototype) || 'TimestampTrigger' in window;
    if (!supported) {
        showToast("TimestampTrigger não é suportado neste navegador!");
        return;
    }
    if (hasNotification && Notification.permission !== "granted") {
        showToast("Ative as notificações primeiro!");
        return;
    }
    
    try {
        const reg = await navigator.serviceWorker.ready;
        const triggerTime = Date.now() + 10000;
        
        let showTrigger;
        if (typeof TimestampTrigger !== 'undefined') {
            showTrigger = new TimestampTrigger(triggerTime);
        } else if (typeof window.TimestampTrigger !== 'undefined') {
            showTrigger = new window.TimestampTrigger(triggerTime);
        } else {
            showTrigger = {
                type: 'timestamp',
                timestamp: triggerTime
            };
        }
        
        await reg.showNotification("SanInPlay Dev ⏰", {
            body: "Teste de Notificação Programada com TimestampTrigger!",
            icon: "ico192.png",
            badge: "ico192.png",
            vibrate: [200, 100, 200],
            showTrigger: showTrigger
        });
        
        showToast("Notificação programada via Trigger para daqui a 10s!");
    } catch (err) {
        console.error("Erro ao programar trigger:", err);
        showToast("Erro: " + err.message);
    }
}

function injectCredits() {
    const container = document.getElementById('creditsContainer');
    if (container) {
        container.innerHTML = `
            Desenvolvido por <a href="https://github.com/RafaelGodoyEbert" target="_blank">Rafael Godoy</a> para o canal <a href="https://www.youtube.com/@SanInPlay" target="_blank">SanInPlay</a>
            <span>Sob licença GNU GPLv3</span>
        `;
    }
}

// Start
init();
