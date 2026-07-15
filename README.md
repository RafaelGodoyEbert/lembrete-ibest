# 📱 PWA de Engajamento e Votação (Prêmio iBest)

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)](#)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)](#)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)](#)
[![PWA](https://img.shields.io/badge/PWA-Ready-purple?style=flat)](#)

Este é um PWA (Progressive Web App) open-source projetado para criadores de conteúdo que participam de premiações online (como o Prêmio iBest). Ele ajuda a engajar a comunidade facilitando a votação diária, oferecendo conquistas (patentes baseadas em votos), lembretes com notificações de 24h e geração de cards de conquistas personalizáveis para redes sociais.

---

## 🚀 Começo Rápido (Quick Start)

Toda a personalização do aplicativo foi desacoplada em um único arquivo de fácil configuração. Para adaptar o PWA ao seu canal/campanha, você só precisa alterar as propriedades do arquivo `config.js`:

```javascript
const CONFIG = {
    // URL de votação do criador
    VOTE_URL: "https://premioibest.vote/seu-link",

    // Chave secreta de salgamento para assinaturas do localStorage
    SECRET_SALT: "mude_esta_chave_para_o_seu_pwa",

    // Data de lançamento oficial da campanha (Timestamp em milissegundos)
    APP_LAUNCH_TIME: 1783825200000, 

    // Informações da marca e redes
    BRAND_NAME: "SEU_NOME APP",
    CAMPAIGN_TITLE: "CAMPANHA 2026",
    CREATOR_NICKNAME: "SeuNome",
    INSTAGRAM_HANDLE: "@seu_instagram",
    
    // Links sociais para botões e rodapé
    SOCIAL_LINKS: {
        instagram: "https://instagram.com/...",
        youtube: "https://youtube.com/...",
        twitter: "https://x.com/..."
    },

    // Tempo de recarga padrão (24 horas)
    VOTE_COOLDOWN_MS: 24 * 60 * 60 * 1000,

    // Ranks / Patentes de Votação
    RANKS: [ ... ]
};
```

1. Baixe o código do projeto.
2. Altere o `config.js` com seus dados.
3. Altere os ícones (`ico192.png`, `ico512.png`), banner e favicon para a sua identidade visual.
4. Hospede os arquivos estáticos em qualquer servidor (GitHub Pages, Vercel, Netlify, etc.).

---

## 🛠️ Painel DevTools (Menu de Testes)

O aplicativo conta com um menu de desenvolvedor integrado oculto para testar as notificações do Service Worker e simular votos rapidamente.

* **Como Acessar**: Na tela inicial do app, **toque ou clique 10 vezes consecutivas sobre a imagem do logotipo/banner** no cabeçalho.
* **O que ele permite**:
  * Simular a conclusão imediata do cronômetro de 24h.
  * Disparar uma notificação instantânea para validar as permissões de notificação do navegador/sistema operacional.
  * Adicionar ou zerar votos de teste (`+1`, `+5`, `+25`, `+100` votos).
  * Limpar dados salvos e resetar o aplicativo por completo.

---

## 🛡️ Sistema de Integridade Temporal e Anti-Burla

Por ser um aplicativo estático que roda 100% no navegador (client-side), **é teoricamente impossível impedir totalmente que um usuário avançado manipule os dados locais**. Qualquer lógica do lado do cliente está sujeita a depuração direta no navegador.

No entanto, para evitar que 99% dos usuários editem o contador de votos simplesmente abrindo o console ou alterando variáveis, implementamos as seguintes travas de segurança integradas:

1. **Escopo Fechado (IIFE)**:
   A lógica de execução do PWA está isolada em uma função anônima auto-executável (`(() => { ... })()`). Isso impede que qualquer pessoa acesse as variáveis de estado ou chaves internas como `safeStorage` ou `adjustVotes` a partir do console.

2. **Assinaturas Criptográficas locais**:
   Toda gravação de estado (`saninplay_vote_count` e `saninplay_first_vote`) no `localStorage` é assinada através de um algoritmo de hash interno usando a chave definida no `CONFIG.SECRET_SALT`. Se um usuário tentar alterar manualmente o número de votos de `1` para `100`, o hash de integridade falhará na próxima leitura, e o PWA redefinirá a contagem para zero como medida de segurança.

3. **Validação Lógica de Tempo (Corte Temporal)**:
   A aplicação rastreia o momento exato em que o primeiro voto ocorreu. Uma validação matemática compara a data do primeiro voto com a data atual e calcula o número máximo físico de votos que poderiam ter sido feitos (um voto a cada 24 horas). Se os votos excederem o tempo máximo real passado, os dados são corrompidos e apagados.

4. **Trava da Data de Lançamento**:
   A data do primeiro voto é validada para garantir que ela não é anterior à data de lançamento da campanha (`CONFIG.APP_LAUNCH_TIME`). Isso impede que trapaceiros criem um script para fingir que começaram a votar há "100 dias atrás" para passar na validação de tempo.

5. **Assinatura das Imagens de Conquistas**:
   Ao gerar um card de conquista, o código de autenticidade exibido segue o padrão: `SIP-[DiasDecorridos]-[Votos]-[Assinatura]`.
   Se o usuário forjar a imagem injetando HTML no DOM do PWA:
   * A verificação do código falhará no validador se ele tentar criar uma assinatura manual.
   * Se ele usar a assinatura correta mas com dados adulterados (ex: 91 votos no Dia 2), a relação votos/dias denunciará a fraude ao validador da campanha.

---

## 📦 Tecnologias Utilizadas

* **HTML5 e CSS3** (layouts fluídos e responsivos, animações dinâmicas e gradientes curados).
* **JavaScript Puro (ES6)** (Lógica, manipulação DOM e criptografia leve).
* **Service Workers** (Funcionamento offline, ciclo de vida de PWA e agendamento de notificações).
* **html2canvas** (Utilizado para renderização e fotografia de alta resolução das conquistas em formato PNG de forma assíncrona).

## 📄 Licença

Este projeto está sob a licença **GNU GPLv3**.
