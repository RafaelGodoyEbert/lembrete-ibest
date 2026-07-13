const VOTE_URL = "https://premioibest.vote/719796142";
const VOTE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
// const VOTE_COOLDOWN_MS = 10 * 1000; // 10 seconds para testes

const state = {
    lastVoteTime: localStorage.getItem('saninplay_last_vote') || null,
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
    closeIosModal: document.getElementById('closeIosModal')
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

    updateState();
    injectCredits();

    // Add visibility change listener to handle returning to app
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === 'visible') {
            updateState();
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
        localStorage.setItem('saninplay_last_vote', now.toString());
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
                badge: "ico192.png",
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

function injectCredits() {
    const container = document.getElementById('creditsContainer');
    if (container) {
        container.innerHTML = `
            Desenvolvido por <a href="https://github.com/RafaelGodoyEbert" target="_blank">Rafael Godoy</a> o canal <a href="https://www.youtube.com/@SanInPlay" target="_blank">SanInPlay</a>
            <span>Sob licença GNU GPLv3</span>
        `;
    }
}

// Start
init();
