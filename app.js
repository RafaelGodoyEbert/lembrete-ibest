(() => {
const VOTE_URL = "https://premioibest.vote/719796142";

const _secret = "s4n1npl4y_s3cr3t_2026";
function _hashVote(value) {
    let hash = 0;
    const str = value + _secret;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString(16);
}

// Wrapper seguro para o localStorage (evita crashes se o navegador bloquear cookies/storage local)
// Agora inclui proteção contra adulteração manual no console e matemática lógica temporal para os votos.
const safeStorage = {
    getItem(key) {
        try { 
            const val = localStorage.getItem(key);
            if (key === 'saninplay_vote_count' && val !== null) {
                const parsedVotes = parseInt(val) || 0;
                if (parsedVotes > 0) {
                    const hash = localStorage.getItem('saninplay_vote_hash');
                    if (hash !== _hashVote(val)) {
                        console.warn("Tampering detected (hash)! Resetting vote count.");
                        localStorage.removeItem('saninplay_vote_count');
                        localStorage.removeItem('saninplay_vote_hash');
                        localStorage.removeItem('saninplay_first_vote');
                        localStorage.removeItem('saninplay_first_vote_hash');
                        return null;
                    }
                    // Validação matemática do tempo decorrido desde o primeiro voto
                    const firstVote = localStorage.getItem('saninplay_first_vote');
                    if (!firstVote) {
                        console.warn("Tampering detected (no first vote date)! Resetting vote count.");
                        localStorage.removeItem('saninplay_vote_count');
                        localStorage.removeItem('saninplay_vote_hash');
                        localStorage.removeItem('saninplay_first_vote');
                        localStorage.removeItem('saninplay_first_vote_hash');
                        return null;
                    }
                    const firstVoteHash = localStorage.getItem('saninplay_first_vote_hash');
                    if (firstVoteHash !== _hashVote(firstVote)) {
                        console.warn("Tampering detected (first vote date hash)! Resetting vote count.");
                        localStorage.removeItem('saninplay_vote_count');
                        localStorage.removeItem('saninplay_vote_hash');
                        localStorage.removeItem('saninplay_first_vote');
                        localStorage.removeItem('saninplay_first_vote_hash');
                        return null;
                    }
                    const now = Date.now();
                    const diffMs = now - parseInt(firstVote);
                    // Adiciona buffer de 1 hora para drifts de relógio do OS
                    const maxPossible = Math.floor((diffMs + 3600000) / VOTE_COOLDOWN_MS) + 1;
                    if (parsedVotes > maxPossible) {
                        console.warn("Logical math tampering detected! Votes exceed time limit.");
                        localStorage.removeItem('saninplay_vote_count');
                        localStorage.removeItem('saninplay_vote_hash');
                        localStorage.removeItem('saninplay_first_vote');
                        localStorage.removeItem('saninplay_first_vote_hash');
                        return null;
                    }
                }
            }
            if (key === 'saninplay_first_vote' && val !== null) {
                const hash = localStorage.getItem('saninplay_first_vote_hash');
                if (hash !== _hashVote(val)) {
                    console.warn("Tampering detected (first vote hash)! Resetting first vote.");
                    localStorage.removeItem('saninplay_first_vote');
                    localStorage.removeItem('saninplay_first_vote_hash');
                    return null;
                }
            }
            return val;
        } catch (e) { return null; }
    },
    setItem(key, value) {
        try { 
            localStorage.setItem(key, value); 
            if (key === 'saninplay_vote_count') {
                localStorage.setItem('saninplay_vote_hash', _hashVote(String(value)));
            }
            if (key === 'saninplay_first_vote') {
                localStorage.setItem('saninplay_first_vote_hash', _hashVote(String(value)));
            }
        } catch (e) { }
    },
    removeItem(key) {
        try { 
            localStorage.removeItem(key); 
            if (key === 'saninplay_vote_count') localStorage.removeItem('saninplay_vote_hash');
            if (key === 'saninplay_first_vote') localStorage.removeItem('saninplay_first_vote_hash');
        } catch (e) { }
    },
    clear() {
        try { localStorage.clear(); } catch (e) { }
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

// Ranks / Patentes de Votos
const RANKS = [
    { id: 'none', name: 'Recruta', minVotes: 0, maxVotes: 0, class: 'rank-none', icon: '<i class="fa-solid fa-medal"></i>', desc: 'Vote 1 vez para desbloquear a patente Bronze.' },
    { id: 'bronze', name: 'Fã Bronze', minVotes: 1, maxVotes: 4, class: 'rank-bronze', icon: '<i class="fa-solid fa-award"></i>', desc: 'Vote mais {diff} vezes para desbloquear a patente Prata!' },
    { id: 'silver', name: 'Fã Prata', minVotes: 5, maxVotes: 14, class: 'rank-silver', icon: '<i class="fa-solid fa-award"></i>', desc: 'Vote mais {diff} vezes para desbloquear a patente Ouro!' },
    { id: 'gold', name: 'Fã Ouro', minVotes: 15, maxVotes: 29, class: 'rank-gold', icon: '<i class="fa-solid fa-trophy"></i>', desc: 'Falta pouco! Vote mais {diff} vezes para ser Fã Platina!' },
    { id: 'platinum', name: 'Fã Platina', minVotes: 30, maxVotes: 49, class: 'rank-platinum', icon: '<i class="fa-solid fa-crown"></i>', desc: 'Incrível! Mais {diff} votos para virar Diamante!' },
    { id: 'diamond', name: 'Fã Diamante', minVotes: 50, maxVotes: 99, class: 'rank-diamond', icon: '<i class="fa-solid fa-gem"></i>', desc: 'Nível lendário! Mais {diff} votos para ser Fã Lenda!' },
    { id: 'legend', name: 'Fã Lenda', minVotes: 100, maxVotes: Infinity, class: 'rank-legend', icon: '<i class="fa-solid fa-flame"></i>', desc: 'Você é uma Lenda absoluta do canal! 🔥' }
];

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

    // Conquistas e Compartilhamento (Modificados para Modal Tela Cheia)
    btnAchievements: document.getElementById('btnAchievements'),
    achievementsModal: document.getElementById('achievementsModal'),
    closeAchievementsModal: document.getElementById('closeAchievementsModal'),
    fanBadge: document.getElementById('fanBadge'),
    badgeName: document.getElementById('badgeName'),
    totalVotes: document.getElementById('totalVotes'),
    nextRankVotes: document.getElementById('nextRankVotes'),
    rankProgressBar: document.getElementById('rankProgressBar'),
    rankProgressText: document.getElementById('rankProgressText'),
    
    // Screenshot e Modais de Imagem
    btnGenerateStories: document.getElementById('btnGenerateStories'),
    btnGenerateFeed: document.getElementById('btnGenerateFeed'),
    screenshotResultModal: document.getElementById('screenshotResultModal'),
    closeScreenshotModal: document.getElementById('closeScreenshotModal'),
    screenshotImageContainer: document.getElementById('screenshotImageContainer'),
    btnShareImage: document.getElementById('btnShareImage'),

    // Elementos dos Templates Ocultos
    tplStoriesRank: document.getElementById('tplStoriesRank'),
    tplStoriesBadge: document.getElementById('tplStoriesBadge'),
    tplStoriesVotes: document.getElementById('tplStoriesVotes'),
    tplStoriesCode: document.getElementById('tplStoriesCode'),
    tplStoriesDev: document.getElementById('tplStoriesDev'),
    tplFeedRank: document.getElementById('tplFeedRank'),
    tplFeedBadge: document.getElementById('tplFeedBadge'),
    tplFeedVotes: document.getElementById('tplFeedVotes'),
    tplFeedCode: document.getElementById('tplFeedCode'),
    tplFeedDev: document.getElementById('tplFeedDev'),

    // Redes e Textos
    btnTwitterShare: document.getElementById('btnTwitterShare'),
    btnWhatsappShare: document.getElementById('btnWhatsappShare'),
    btnCopyClipboard: document.getElementById('btnCopyClipboard'),

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
    devCooldownBtns: document.querySelectorAll('.btn-dev-cooldown'),

    // Dev Tools Vote elements
    devInfoVotes: document.getElementById('dev-info-votes'),
    devBtnVoteAdd1: document.getElementById('dev-btn-vote-add1'),
    devBtnVoteAdd5: document.getElementById('dev-btn-vote-add5'),
    devBtnVoteAdd25: document.getElementById('dev-btn-vote-add25'),
    devBtnVoteAdd100: document.getElementById('dev-btn-vote-add100'),
    devBtnVoteSet0: document.getElementById('dev-btn-vote-set0')
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

    // Conquistas e Modal Event Listeners
    if (el.btnAchievements) {
        el.btnAchievements.addEventListener('click', openAchievementsModal);
    }
    if (el.closeAchievementsModal) {
        el.closeAchievementsModal.addEventListener('click', closeAchievementsModal);
    }
    if (el.achievementsModal) {
        el.achievementsModal.addEventListener('click', (e) => {
            if (e.target === el.achievementsModal) closeAchievementsModal();
        });
    }
    if (el.btnGenerateStories) {
        el.btnGenerateStories.addEventListener('click', () => generateScreenshot('stories'));
    }
    if (el.btnGenerateFeed) {
        el.btnGenerateFeed.addEventListener('click', () => generateScreenshot('feed'));
    }
    if (el.closeScreenshotModal) {
        el.closeScreenshotModal.addEventListener('click', closeScreenshotModal);
    }
    if (el.screenshotResultModal) {
        el.screenshotResultModal.addEventListener('click', (e) => {
            if (e.target === el.screenshotResultModal) closeScreenshotModal();
        });
    }
    if (el.btnTwitterShare) {
        el.btnTwitterShare.addEventListener('click', shareOnTwitter);
    }
    if (el.btnWhatsappShare) {
        el.btnWhatsappShare.addEventListener('click', shareOnWhatsapp);
    }
    if (el.btnCopyClipboard) {
        el.btnCopyClipboard.addEventListener('click', copyShareText);
    }

    // DevTools Vote Control Listeners
    if (el.devBtnVoteAdd1) {
        el.devBtnVoteAdd1.addEventListener('click', () => adjustVotes(1));
    }
    if (el.devBtnVoteAdd5) {
        el.devBtnVoteAdd5.addEventListener('click', () => adjustVotes(5));
    }
    if (el.devBtnVoteAdd25) {
        el.devBtnVoteAdd25.addEventListener('click', () => adjustVotes(25));
    }
    if (el.devBtnVoteAdd100) {
        el.devBtnVoteAdd100.addEventListener('click', () => adjustVotes(100));
    }
    if (el.devBtnVoteSet0) {
        el.devBtnVoteSet0.addEventListener('click', () => adjustVotes(0, true));
    }

    updateState();
    updateStats();
    injectCredits();

    // Add visibility change listener to handle returning to app
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === 'visible') {
            updateState();
            updateStats();
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
        // Incrementa o contador de votos (Muita mão criar API para vocês não burlarem kkkkkk)
        let count = parseInt(safeStorage.getItem('saninplay_vote_count')) || 0;
        count++;

        // Garante que o timestamp do primeiro voto está definido e assinado
        let firstVote = safeStorage.getItem('saninplay_first_vote');
        if (!firstVote) {
            safeStorage.setItem('saninplay_first_vote', now.toString());
        }

        safeStorage.setItem('saninplay_vote_count', count.toString());

        safeStorage.setItem('saninplay_last_vote', now.toString());
        state.lastVoteTime = now.toString();
        updateState();
        updateStats();
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

    const votesSpan = el.devInfoVotes;
    if (votesSpan) {
        const votes = parseInt(safeStorage.getItem('saninplay_vote_count')) || 0;
        votesSpan.textContent = votes;
        votesSpan.style.color = '#00f0ff';
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

// ==========================================================================
// FUNÇÕES DO SISTEMA DE CONQUISTAS & COMPARTILHAMENTO (NOVO)
// ==========================================================================

function openAchievementsModal() {
    if (el.achievementsModal) {
        updateStats();
        el.achievementsModal.classList.remove('hidden');
    }
}

function closeAchievementsModal() {
    if (el.achievementsModal) {
        el.achievementsModal.classList.add('hidden');
    }
}

function closeScreenshotModal() {
    if (el.screenshotResultModal) {
        el.screenshotResultModal.classList.add('hidden');
    }
}

function updateStats() {
    const votes = parseInt(safeStorage.getItem('saninplay_vote_count')) || 0;
    
    // Determina a patente atual e próxima patente
    let currentRank = RANKS[0];
    let nextRank = RANKS[1];
    
    for (let i = 0; i < RANKS.length; i++) {
        if (votes >= RANKS[i].minVotes) {
            currentRank = RANKS[i];
            nextRank = RANKS[i + 1] || null;
        }
    }
    
    // Atualiza contadores numéricos do modal
    if (el.totalVotes) el.totalVotes.textContent = votes;
    if (el.nextRankVotes) el.nextRankVotes.textContent = nextRank ? nextRank.minVotes : "MAX";
    
    // Calcula progresso
    let progressPercent = 0;
    if (!nextRank) {
        progressPercent = 100;
    } else {
        const rangeStart = currentRank.minVotes;
        const rangeEnd = nextRank.minVotes;
        const range = rangeEnd - rangeStart;
        progressPercent = Math.min(100, Math.max(0, ((votes - rangeStart) / range) * 100));
    }
    if (el.rankProgressBar) el.rankProgressBar.style.width = `${progressPercent}%`;
    
    // Atualiza texto explicativo do progresso
    if (el.rankProgressText) {
        if (nextRank) {
            const diff = nextRank.minVotes - votes;
            el.rankProgressText.innerHTML = currentRank.desc.replace('{diff}', diff);
        } else {
            el.rankProgressText.textContent = currentRank.desc;
        }
    }
    
    // Atualiza o visual do Badge/Medalha no Painel de Conquistas
    if (el.fanBadge) {
        RANKS.forEach(r => el.fanBadge.classList.remove(r.class));
        el.fanBadge.classList.add(currentRank.class);
        el.fanBadge.innerHTML = currentRank.icon;
    }
    
    // Atualiza o nome da patente (com cor correspondente)
    if (el.badgeName) {
        el.badgeName.textContent = currentRank.name;
        RANKS.forEach(r => el.badgeName.classList.remove(`${r.class}-text`));
        el.badgeName.classList.add(`${currentRank.class}-text`);
    }

    // ==========================================
    // Atualiza também os Templates Off-Screen
    // ==========================================
    const isDevMode = safeStorage.getItem('saninplay_dev_mode') === 'true';
    const verification = generateVerificationCode(votes);

    // Ativa/Desativa marca d'água de desenvolvimento nos templates
    if (el.tplStoriesDev) {
        if (isDevMode) el.tplStoriesDev.classList.add('active');
        else el.tplStoriesDev.classList.remove('active');
    }
    if (el.tplFeedDev) {
        if (isDevMode) el.tplFeedDev.classList.add('active');
        else el.tplFeedDev.classList.remove('active');
    }

    // Template Stories
    if (el.tplStoriesRank) {
        el.tplStoriesRank.textContent = currentRank.name;
        RANKS.forEach(r => el.tplStoriesRank.classList.remove(`${r.class}-text`));
        el.tplStoriesRank.classList.add(`${currentRank.class}-text`);
    }
    if (el.tplStoriesBadge) {
        RANKS.forEach(r => el.tplStoriesBadge.classList.remove(r.class));
        el.tplStoriesBadge.classList.add(currentRank.class);
        el.tplStoriesBadge.innerHTML = currentRank.icon;
    }
    if (el.tplStoriesVotes) el.tplStoriesVotes.textContent = votes;
    if (el.tplStoriesCode) el.tplStoriesCode.textContent = verification;

    // Template Feed
    if (el.tplFeedRank) {
        el.tplFeedRank.textContent = currentRank.name;
        RANKS.forEach(r => el.tplFeedRank.classList.remove(`${r.class}-text`));
        el.tplFeedRank.classList.add(`${currentRank.class}-text`);
    }
    if (el.tplFeedBadge) {
        RANKS.forEach(r => el.tplFeedBadge.classList.remove(r.class));
        el.tplFeedBadge.classList.add(currentRank.class);
        el.tplFeedBadge.innerHTML = currentRank.icon;
    }
    if (el.tplFeedVotes) el.tplFeedVotes.textContent = votes;
    if (el.tplFeedCode) el.tplFeedCode.textContent = verification;
}

// Gera o screenshot a partir de um dos templates off-screen
function generateScreenshot(format) {
    showToast("Gerando card... Aguarde.");
    
    const element = format === 'stories' ? document.getElementById('tplStories') : document.getElementById('tplFeed');
    if (!element) {
        showToast("Erro ao encontrar o template.");
        return;
    }

    // Utiliza html2canvas para fotografar o template
    html2canvas(element, {
        scale: 2, // Gera em dobro de resolução para telas de alta densidade (Retina/OLED)
        useCORS: true,
        backgroundColor: null,
        logging: false
    }).then(canvas => {
        const imgUrl = canvas.toDataURL('image/png');
        
        // Coloca a imagem gerada no modal
        if (el.screenshotImageContainer) {
            el.screenshotImageContainer.innerHTML = `<img src="${imgUrl}" alt="Card Conquista SanInPlay">`;
        }
        
        // Define ação do botão de compartilhamento
        if (el.btnShareImage) {
            el.btnShareImage.onclick = async () => {
                try {
                    const file = await dataUrlToFile(imgUrl, `saninplay_conquista_${format}.png`);
                    const shareText = getShareText();
                    
                    // Copia o texto para a área de transferência como segurança para o usuário poder colar no app
                    copyTextToClipboard(shareText);
                    
                    const shareData = {
                        files: [file],
                        title: shareText, // Preenche o title também, pois algumas versões/dispositivos usam o title como legenda para imagens
                        text: shareText
                    };
                    
                    if (navigator.canShare && navigator.canShare(shareData)) {
                        await navigator.share(shareData);
                        showToast("Texto copiado! Pressione para colar no app.");
                    } else {
                        // Fallback: faz download e copia o texto
                        triggerDownload(imgUrl, format);
                        showToast("Imagem baixada e texto copiado! Cole no seu app.");
                    }
                } catch (e) {
                    console.error("Erro ao compartilhar:", e);
                    // Fallback
                    triggerDownload(imgUrl, format);
                    copyTextToClipboard(getShareText());
                    showToast("Imagem baixada e texto copiado!");
                }
            };
        }
        
        // Exibe o modal do resultado
        if (el.screenshotResultModal) {
            el.screenshotResultModal.classList.remove('hidden');
        }
    }).catch(err => {
        console.error("Erro ao renderizar com html2canvas:", err);
        showToast("Erro ao processar imagem.");
    });
}

// Converte dataURL para File para Web Share
async function dataUrlToFile(dataUrl, fileName) {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], fileName, { type: 'image/png' });
}

// Dispara download da imagem como fallback
function triggerDownload(imgUrl, format) {
    const link = document.createElement('a');
    link.download = `saninplay_conquista_${format}.png`;
    link.href = imgUrl;
    link.click();
}

// Copia o texto para clipboard como fallback
function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(err => console.error(err));
    } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        document.body.appendChild(textarea);
        textarea.select();
        try { document.execCommand("copy"); } catch (e) {}
        document.body.removeChild(textarea);
    }
}

// Gera código pseudo-criptografado para autenticação de fã
function generateVerificationCode(votes) {
    const salt = 7197;
    let val = (votes * 17 + salt) % 10000;
    let valHex = val.toString(16).toUpperCase().padStart(4, '0');
    const isDev = safeStorage.getItem('saninplay_dev_mode') === 'true';
    const prefix = isDev ? 'DEV' : 'SIP';
    return `${prefix}-${votes.toString().padStart(4, '0')}-${valHex}`;
}

// Retorna o texto formatado para ser compartilhado
function getShareText() {
    const votes = parseInt(safeStorage.getItem('saninplay_vote_count')) || 0;
    let currentRank = RANKS[0];
    for (let i = 0; i < RANKS.length; i++) {
        if (votes >= RANKS[i].minVotes) {
            currentRank = RANKS[i];
        }
    }
    
    const verification = generateVerificationCode(votes);
    const origin = window.location.origin || "https://premioibest.vote/719796142";
    
    return `Eu sou patente ${currentRank.name.toUpperCase()} no PWA do SanInPlay! 🏆 Já registrei ${votes} votos para o San no Prêmio iBest.\n\nCódigo de Verificação: ${verification}\nAjude você também a votar todos os dias no link: ${origin}`;
}

// Compartilha no X (Twitter)
function shareOnTwitter() {
    const text = getShareText();
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

// Compartilha no WhatsApp
function shareOnWhatsapp() {
    const text = getShareText();
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
}

// Copia o texto de compartilhamento para a área de transferência
function copyShareText() {
    const text = getShareText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showToast("Mensagem de fã copiada!");
        }).catch(err => {
            console.error("Falha ao copiar texto:", err);
            showToast("Erro ao copiar. Use o print!");
        });
    } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand("copy");
            showToast("Mensagem de fã copiada!");
        } catch (e) {
            showToast("Erro ao copiar. Use o print!");
        }
        document.body.removeChild(textarea);
    }
}

// Ajusta a contagem de votos via DevTools (ajustando a matemática temporal para testes legítimos)
function adjustVotes(amount, setExact = false) {
    let votes = parseInt(safeStorage.getItem('saninplay_vote_count')) || 0;
    const now = Date.now();
    let firstVote = parseInt(safeStorage.getItem('saninplay_first_vote')) || now;

    if (setExact) {
        votes = amount;
        if (votes === 0) {
            safeStorage.removeItem('saninplay_first_vote');
            safeStorage.removeItem('saninplay_dev_mode');
        } else {
            firstVote = now - (votes - 1) * VOTE_COOLDOWN_MS;
            safeStorage.setItem('saninplay_first_vote', firstVote.toString());
            safeStorage.setItem('saninplay_dev_mode', 'true');
        }
    } else {
        votes += amount;
        firstVote = firstVote - (amount * VOTE_COOLDOWN_MS);
        safeStorage.setItem('saninplay_first_vote', firstVote.toString());
        safeStorage.setItem('saninplay_dev_mode', 'true');
    }

    safeStorage.setItem('saninplay_vote_count', votes.toString());
    updateStats();
    updateDevToolsInfo();
    showToast(`Votos ajustados para: ${votes}!`);
}

// Start
init();
})();
