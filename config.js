const CONFIG = {
    // URL de votação do Prêmio iBest do criador
    VOTE_URL: "https://premioibest.vote/719796142",

    // Chave secreta de salgamento para assinaturas do localStorage (mude para o seu PWA!)
    SECRET_SALT: "s4n1npl4y_s3cr3t_2026",

    // Data de lançamento oficial da campanha (Timestamp em milissegundos)
    // 12 de Julho de 2026 00:00:00 GMT-3
    APP_LAUNCH_TIME: 1783825200000,

    // Informações da marca e redes do criador
    BRAND_NAME: "SANINPLAY APP",
    CAMPAIGN_TITLE: "PRÊMIO IBEST 2026",
    CREATOR_NICKNAME: "SanInPlay",
    INSTAGRAM_HANDLE: "@saninplay_",

    // Links sociais do rodapé e links rápidos
    SOCIAL_LINKS: {
        instagram: "https://www.instagram.com/saninplay_/",
        youtube: "https://www.youtube.com/@SanInPlay",
        twitter: "https://x.com/DjSan_"
    },

    // Cooldown padrão entre votos (24 horas)
    VOTE_COOLDOWN_MS: 24 * 60 * 60 * 1000,

    // Patentes/Ranks configuráveis para a contagem de votos
    RANKS: [
        { id: 'none', name: 'Recruta', minVotes: 0, maxVotes: 0, class: 'rank-none', icon: '<i class="fa-solid fa-medal"></i>', desc: 'Vote 1 vez para desbloquear a patente Bronze.' },
        { id: 'bronze', name: 'Fã Bronze', minVotes: 1, maxVotes: 4, class: 'rank-bronze', icon: '<i class="fa-solid fa-award"></i>', desc: 'Vote mais {diff} vezes para desbloquear a patente Prata!' },
        { id: 'silver', name: 'Fã Prata', minVotes: 5, maxVotes: 14, class: 'rank-silver', icon: '<i class="fa-solid fa-award"></i>', desc: 'Vote mais {diff} vezes para desbloquear a patente Ouro!' },
        { id: 'gold', name: 'Fã Ouro', minVotes: 15, maxVotes: 29, class: 'rank-gold', icon: '<i class="fa-solid fa-trophy"></i>', desc: 'Falta pouco! Vote mais {diff} vezes para ser Fã Platina!' },
        { id: 'platinum', name: 'Fã Platina', minVotes: 30, maxVotes: 49, class: 'rank-platinum', icon: '<i class="fa-solid fa-crown"></i>', desc: 'Incrível! Mais {diff} votos para virar Diamante!' },
        { id: 'diamond', name: 'Fã Diamante', minVotes: 50, maxVotes: 99, class: 'rank-diamond', icon: '<i class="fa-solid fa-gem"></i>', desc: 'Nível lendário! Mais {diff} votos para ser Fã Lenda!' },
        { id: 'legend', name: 'Fã Lenda', minVotes: 100, maxVotes: Infinity, class: 'rank-legend', icon: '<i class="fa-solid fa-flame"></i>', desc: 'Você é uma Lenda absoluta do canal! 🔥' }
    ]
};
