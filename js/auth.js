// =========================================================
// auth.js — Login, sessão e permissões (API REST + SQLite)
// A sessão agora é um cookie httpOnly gerenciado pelo backend.
// =========================================================

// Guarda: se o api.js não carregou, mostra erro claro em vez de "api is not defined"
if (typeof window.api === 'undefined') {
  console.error('ERRO: api.js não carregou. Verifique o caminho <script src="js/api.js"> e se o arquivo existe.');
  alert('Falha ao carregar a API. Verifique o console.');
}

// ===== Sessão =====
function salvarSessao(usuario) {
  sessionStorage.setItem('usuario', JSON.stringify(usuario));
}

function obterSessao() {
  const dados = sessionStorage.getItem('usuario');
  return dados ? JSON.parse(dados) : null;
}

// Protege páginas internas: sem sessão, volta pro login
function exigirLogin() {
  if (!obterSessao()) {
    window.location.href = '../index.html';
  }
}

// Valida a sessão no servidor (cookie httpOnly)
async function validarSessao() {
  try {
    const resp = await api.auth.me();
    if (!resp.success) sair();
  } catch {
    sair();
  }
}

function sair() {
  api.auth.logout().catch(() => {});
  sessionStorage.removeItem('usuario');
  window.location.href = '../index.html';
}

// ===== Tela de login (index.html) =====
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('form-login');
  const formSenha = document.getElementById('form-definir-senha');
  const loginErro = document.getElementById('login-erro');
  const senhaErro = document.getElementById('senha-erro');

  function mostrarErro(el, msg) {
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('usuario').value.trim();
      const senha = document.getElementById('senha').value;
      try {
        const resp = await api.auth.login(email, senha);
        if (!resp.success) {
          mostrarErro(loginErro, resp.erro || 'Erro no login');
          return;
        }
        salvarSessao(resp.usuario);
        if (resp.usuario.bootstrap) {
          // primeiro acesso: mostrar formulário de definir senha
          form.style.display = 'none';
          formSenha.style.display = 'block';
        } else {
          window.location.href = 'pages/dashboard.html';
        }
      } catch (erro) {
        mostrarErro(loginErro, erro.message || 'Erro no login');
      }
    });
  }

  if (formSenha) {
    formSenha.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('usuario').value.trim();
      const novaSenha = document.getElementById('nova-senha-login').value;
      const confirmar = document.getElementById('confirmar-senha-login').value;
      if (novaSenha.length < 6) {
        mostrarErro(senhaErro, 'A senha deve ter no mínimo 6 caracteres.');
        return;
      }
      if (novaSenha !== confirmar) {
        mostrarErro(senhaErro, 'As senhas não conferem.');
        return;
      }
      try {
        const resp = await api.auth.definirSenha(email, novaSenha);
        if (!resp.success) {
          mostrarErro(senhaErro, resp.erro || 'Erro ao definir senha');
          return;
        }
        window.location.href = 'pages/dashboard.html';
      } catch (erro) {
        mostrarErro(senhaErro, erro.message || 'Erro ao definir senha');
      }
    });
  }
});
