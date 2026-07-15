(() => {
    const VOTE_URL = CONFIG.VOTE_URL;

    const _secret = CONFIG.SECRET_SALT;
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

                        const firstVoteVal = parseInt(firstVote) || 0;
                        const now = Date.now();
                        const isDev = localStorage.getItem('saninplay_dev_mode') === 'true';

                        // Checagem absoluta: a data do primeiro voto não pode ser anterior ao início do evento ou no futuro
                        const APP_LAUNCH_TIME = CONFIG.APP_LAUNCH_TIME;
                        if (!isDev && (firstVoteVal < APP_LAUNCH_TIME || firstVoteVal > (now + 60000))) {
                            console.warn("Tampering detected (invalid first vote date range)! Resetting vote count.");
                            localStorage.removeItem('saninplay_vote_count');
                            localStorage.removeItem('saninplay_vote_hash');
                            localStorage.removeItem('saninplay_first_vote');
                            localStorage.removeItem('saninplay_first_vote_hash');
                            return null;
                        }

                        const diffMs = now - firstVoteVal;
                        // Adiciona buffer de 1 hora para drifts de relógio do OS. Usa obrigatoriamente o limite real configurado.
                        const maxPossible = Math.floor((diffMs + 3600000) / CONFIG.VOTE_COOLDOWN_MS) + 1;
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

    let VOTE_COOLDOWN_MS = (safeStorage.getItem('saninplay_dev_mode') === 'true' && parseInt(safeStorage.getItem('saninplay_cooldown_override'))) || CONFIG.VOTE_COOLDOWN_MS;

    const state = {
        lastVoteTime: safeStorage.getItem('saninplay_last_vote') || null,
        timerInterval: null
    };

    // Install Prompt Logic
    let deferredPrompt;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.navigator.standalone === true;

    // Ranks / Patentes de Votos vindas do Config
    const RANKS = CONFIG.RANKS;

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
                registration.showNotification(`${CONFIG.BRAND_NAME} 🔥`, {
                    body: `Tá na hora de votar de novo! Ajude o ${CONFIG.CREATOR_NICKNAME} no ${CONFIG.CAMPAIGN_TITLE}!`,
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

            await reg.showNotification(`${CONFIG.BRAND_NAME}  Dev ⏰`, {
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
    }

    // Gera o screenshot a partir de um dos templates off-screen
    function generateScreenshot(format) {
        showToast("Gerando card... Aguarde.");

        const votes = parseInt(safeStorage.getItem('saninplay_vote_count')) || 0;
        let currentRank = RANKS[0];
        for (let i = 0; i < RANKS.length; i++) {
            if (votes >= RANKS[i].minVotes) {
                currentRank = RANKS[i];
            }
        }
        const isDevMode = safeStorage.getItem('saninplay_dev_mode') === 'true';
        const verification = generateVerificationCode(votes);

        // Cria o container temporário oculto
        const tempContainer = document.createElement('div');
        tempContainer.className = 'hidden-templates';
        document.body.appendChild(tempContainer);

        let html = '';
        if (format === 'stories') {
            html = `
        <div id="tplStories" class="template-container template-stories">
            ${isDevMode ? '<div class="tpl-dev-watermark active">MODO DESENVOLVEDOR</div>' : ''}
            <div class="tpl-bg-glow"></div>
            
            <div class="tpl-header">
                <img src="ico192.png" alt="Logo" class="tpl-logo">
                <div class="tpl-brand-group">
                    <span class="tpl-brand-pwa">${CONFIG.BRAND_NAME}</span>
                    <span class="tpl-brand-title">${CONFIG.CAMPAIGN_TITLE}</span>
                </div>
            </div>
            
            <div class="tpl-divider-custom"></div>
            
            <div class="tpl-body">
                <span class="tpl-ranking-label">PATENTE DO CANAL</span>
                <span id="tplStoriesRank" class="tpl-ranking-title ${currentRank.class}-text">${currentRank.name}</span>
                
                <div id="tplStoriesBadge" class="tpl-badge ${currentRank.class}">
                    ${currentRank.icon}
                </div>
                
                <div class="tpl-votes-card">
                    <span id="tplStoriesVotes" class="tpl-votes-count">${votes}</span>
                    <span class="tpl-votes-label">VOTOS CONFIRMADOS</span>
                </div>
                
                <div class="tpl-cta-box">
                    <span class="tpl-cta-sub">MISSÃO DIÁRIA CUMPRIDA</span>
                    <span class="tpl-cta-main">VOTE TODOS OS DIAS NO SAN!</span>
                </div>
            </div>
            
            <div class="tpl-divider-custom"></div>
            
            <div class="tpl-footer">
                <div class="tpl-verification">
                    <span class="tpl-label">CÓDIGO DE AUTENTICIDADE</span>
                    <strong id="tplStoriesCode" class="tpl-val">${verification}</strong>
                </div>
                <div class="tpl-social">
                    <span class="tpl-label">SIGA NO INSTAGRAM</span>
                    <strong class="tpl-val">${CONFIG.INSTAGRAM_HANDLE}</strong>
                </div>
            </div>
        </div>`;
        } else {
            html = `
        <div id="tplFeed" class="template-container template-feed">
            ${isDevMode ? '<div class="tpl-dev-watermark active">MODO DESENVOLVEDOR</div>' : ''}
            <div class="tpl-bg-glow"></div>
            
            <div class="tpl-left">
                <img src="ico192.png" alt="Logo" class="tpl-logo-square">
                <div class="tpl-brand-group-square">
                    <span class="tpl-brand-pwa">${CONFIG.BRAND_NAME}</span>
                    <span class="tpl-brand-title">${CONFIG.CAMPAIGN_TITLE}</span>
                </div>
                
                <div class="tpl-cta-box-square">
                    <span class="tpl-cta-sub">MISSÃO DIÁRIA</span>
                    <span class="tpl-cta-main">VOTE DIARIAMENTE!</span>
                </div>
            </div>
            
            <div class="tpl-divider-vertical"></div>
            
            <div class="tpl-right">
                <span class="tpl-ranking-label">PATENTE DO CANAL</span>
                <span id="tplFeedRank" class="tpl-ranking-title ${currentRank.class}-text">${currentRank.name}</span>
                
                <div id="tplFeedBadge" class="tpl-badge ${currentRank.class}">
                    ${currentRank.icon}
                </div>
                
                <div class="tpl-votes-card">
                    <span id="tplFeedVotes" class="tpl-votes-count">${votes}</span>
                    <span class="tpl-votes-label">VOTOS CONFIRMADOS</span>
                </div>
                
                <div class="tpl-footer-square">
                    <div class="tpl-verification">
                        <span class="tpl-label">CÓDIGO DE VERIFICAÇÃO</span>
                        <strong id="tplFeedCode" class="tpl-val">${verification}</strong>
                    </div>
                    <div class="tpl-social">
                        <span class="tpl-label">INSTAGRAM</span>
                        <strong class="tpl-val">${CONFIG.INSTAGRAM_HANDLE}</strong>
                    </div>
                </div>
            </div>
        </div>`;
        }

        tempContainer.innerHTML = html;
        const element = tempContainer.firstElementChild;

        // Utiliza html2canvas para fotografar o template dinâmico
        html2canvas(element, {
            scale: 2, // Gera em dobro de resolução para telas de alta densidade (Retina/OLED)
            useCORS: true,
            backgroundColor: null,
            logging: false
        }).then(canvas => {
            const imgUrl = canvas.toDataURL('image/png');

            // Remove o container temporário imediatamente após renderizar no canvas
            document.body.removeChild(tempContainer);

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
            if (document.body.contains(tempContainer)) {
                document.body.removeChild(tempContainer);
            }
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
            try { document.execCommand("copy"); } catch (e) { }
            document.body.removeChild(textarea);
        }
    }

    // Gera código pseudo-criptografado para autenticação de fã
    function generateVerificationCode(votes) {
        const salt = 7197;
        const APP_LAUNCH_TIME = CONFIG.APP_LAUNCH_TIME;
        const now = Date.now();
        const daysElapsed = Math.max(0, Math.floor((now - APP_LAUNCH_TIME) / (24 * 60 * 60 * 1000)));

        // Assina os dias decorridos junto com os votos para integridade completa
        let val = (daysElapsed * 31 + votes * 17 + salt) % 10000;
        let valHex = val.toString(16).toUpperCase().padStart(4, '0');

        const isDev = safeStorage.getItem('saninplay_dev_mode') === 'true';
        const prefix = isDev ? 'DEV' : 'SIP';

        // Novo formato do código: PREFIXO - DIAS_DECORRIDOS - VOTOS - ASSINATURA
        return `${prefix}-${daysElapsed.toString().padStart(4, '0')}-${votes.toString().padStart(4, '0')}-${valHex}`;
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
        const origin = window.location.origin || CONFIG.VOTE_URL;

        return `Eu sou patente ${currentRank.name.toUpperCase()} no ${CONFIG.BRAND_NAME}! 🏆 Já registrei ${votes} votos para o ${CONFIG.CREATOR_NICKNAME} no ${CONFIG.CAMPAIGN_TITLE}.\n\nCódigo de Verificação: ${verification}\nAjude você também a votar todos os dias no link: ${origin}`;
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
