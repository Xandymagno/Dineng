// sidebar.js — monta a sidebar, marca o item ativo, alinha os ícones do menu,
// bloco de usuário, alternador de tema escuro/claro, brasão recolhido e botão sair
// O LOGO/BRASÃO é o botão de recolher/expandir (o ☰ foi removido)

// ===== Proteção de acesso =====
// Toda página interna exige sessão ativa (definida no auth.js)
exigirLogin();

document.addEventListener('DOMContentLoaded', () => {
  const paginaAtual = window.location.pathname.split('/').pop(); // ex: dashboard.html

  // ===== Alinhamento dos ícones do menu =====
  // Envolve cada emoji solto em um slot fixo (span.menu-icone)
  // para que todos os nomes fiquem alinhados na mesma coluna
  organizarIconesMenu();

  // ===== Item ativo do menu =====
  // Marca automaticamente o link da página atual com a classe 'ativo'
  document.querySelectorAll('.sidebar nav a').forEach((link) => {
    const destino = link.getAttribute('href');

    if (destino === paginaAtual) {
      link.classList.add('ativo');
    } else {
      link.classList.remove('ativo');
    }
  });

  // ===== Recolher / expandir pelo logo =====
  const sidebar = document.querySelector('.sidebar');
  const logo = document.querySelector('.sidebar .logo');

  // Restaura o estado salvo (recolhida ou aberta)
  if (localStorage.getItem('sidebar-recolhida') === 'sim') {
    sidebar.classList.add('recolhida');
    document.body.classList.add('sidebar-recolhida');
  }

  if (logo) {
    logo.addEventListener('click', () => {
      const recolhida = sidebar.classList.toggle('recolhida');
      document.body.classList.toggle('sidebar-recolhida', recolhida);

      // Salva a preferência do usuário
      localStorage.setItem('sidebar-recolhida', recolhida ? 'sim' : 'nao');
    });
  }

  // ===== Brasão para o estado recolhido =====
  montarLogoRecolhida();

  // ===== Bloco do usuário + alternador de tema (injetado no rodapé) =====
  montarBlocoUsuario();
  montarAlternadorTema();

  // ===== Botão Sair (ícone SVG no estilo do avatar) =====
  const btnSair = document.getElementById('btn-sair');
  if (btnSair) {
    // Ícone de logout: porta com seta para fora (traço, igual ao avatar)
    const svgLogout =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>' +
      '<polyline points="16 17 21 12 16 7"></polyline>' +
      '<line x1="21" y1="12" x2="9" y2="12"></line>' +
      '</svg>';

    btnSair.innerHTML =
      '<span class="sair-avatar">' + svgLogout + '</span>' +
      '<span class="menu-texto">Sair</span>';

    btnSair.addEventListener('click', (evento) => {
      evento.preventDefault();
      sessionStorage.removeItem('usuario');
      window.location.href = '../index.html';
    });
  }
});

// ===== Alinha os ícones do menu em slots fixos =====
// Os HTMLs têm o emoji como texto solto antes do <span class="menu-texto">.
// Envolver em <span class="menu-icone"> dá largura fixa a todos os ícones.
function organizarIconesMenu() {
  document.querySelectorAll('.sidebar nav a').forEach((link) => {
    if (link.querySelector('.menu-icone')) return; // já organizado

    const primeiro = link.firstChild;
    if (primeiro && primeiro.nodeType === 3 && primeiro.textContent.trim()) {
      const span = document.createElement('span');
      span.className = 'menu-icone';
      span.textContent = primeiro.textContent.trim();
      link.replaceChild(span, primeiro);
    }
  });
}

// ===== Brasão exibido quando a sidebar está recolhida =====
// Injeta uma segunda imagem dentro do bloco .logo (o CSS controla qual aparece)
function montarLogoRecolhida() {
  const logo = document.querySelector('.sidebar .logo');
  if (!logo || logo.querySelector('.logo-recolhida')) return;

  const brasao = document.createElement('img');
  brasao.src = '../assets/img/logo_recolhida_v2.png';
  brasao.alt = 'Logo';
  brasao.className = 'logo-recolhida';

  logo.appendChild(brasao);
}

// ===== Bloco do usuário (avatar + nome) =====
// Injetado no rodapé da sidebar, acima do botão Sair
function montarBlocoUsuario() {
  const rodape = document.querySelector('.sidebar .sidebar-rodape');
  if (!rodape || document.getElementById('sidebar-usuario')) return;

  // Nome do usuário logado (sessão criada no login, definida no auth.js)
  let nome = 'Usuário';
  try {
    const sessao = typeof obterSessao === 'function' ? obterSessao() : null;
    if (sessao && sessao.nome) nome = sessao.nome;
  } catch (e) { /* sessão indisponível: usa o padrão */ }

  const bloco = document.createElement('div');
  bloco.id = 'sidebar-usuario';
  bloco.className = 'sidebar-usuario';
  bloco.setAttribute('data-titulo', nome);
  bloco.innerHTML =
    '<div class="usuario-avatar">👤</div>' +
    '<span class="usuario-nome menu-texto" title="' + nome + '">' + nome + '</span>';

  // Insere antes do link Sair
  rodape.insertBefore(bloco, rodape.firstChild);
}

// ===== Alternador de tema escuro/claro =====
// Ícone abaixo do usuário, no rodapé da sidebar
function montarAlternadorTema() {
  const rodape = document.querySelector('.sidebar .sidebar-rodape');
  if (!rodape || document.getElementById('btn-tema')) return;

  const btn = document.createElement('button');
  btn.id = 'btn-tema';
  btn.className = 'btn-tema';
  btn.type = 'button';
  btn.title = 'Alternar tema claro/escuro';
  btn.setAttribute('data-titulo', 'Tema');
  btn.innerHTML = '<span class="tema-icone"></span><span class="menu-texto tema-rotulo"></span>';

  btn.addEventListener('click', () => {
    const escuro = document.body.classList.toggle('tema-escuro');
    localStorage.setItem('tema', escuro ? 'escuro' : 'claro');
    atualizarIconeTema(btn, escuro);
  });

  // Insere depois do bloco do usuário (ou no início do rodapé)
  const usuario = document.getElementById('sidebar-usuario');
  if (usuario) {
    usuario.after(btn);
  } else {
    rodape.insertBefore(btn, rodape.firstChild);
  }

  // Restaura o tema salvo (padrão: claro)
  const escuro = localStorage.getItem('tema') === 'escuro';
  if (escuro) document.body.classList.add('tema-escuro');
  atualizarIconeTema(btn, escuro);
}

// Atualiza ícone e rótulo conforme o tema ativo
function atualizarIconeTema(btn, escuro) {
  const icone = btn.querySelector('.tema-icone');
  const rotulo = btn.querySelector('.tema-rotulo');
  if (icone) icone.textContent = escuro ? '☀️' : '🌙';
  if (rotulo) rotulo.textContent = escuro ? 'Tema claro' : 'Tema escuro';
  btn.title = escuro ? 'Mudar para tema claro' : 'Mudar para tema escuro';
}
