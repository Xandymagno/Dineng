// usuarios.js — lógica do controle de usuários (100% via planilha / code.gs)
// Estrutura de dados conforme a aba "Usuários":
// ID_Usuário | Nome | Email | Cargo | Departamento | Situaçao | data_cadastro | data_desativado | telefone | Senha

// =========================================================
// LISTAS DE CARGOS E DEPARTAMENTOS
// Para facilitar a edição: basta adicionar/remover itens
// nestas listas — os campos do modal se ajustam sozinhos.
// =========================================================
const CARGOS_LISTA = [
  'Gerente',
  'Diretor',
  'Coordenador',
  'Supervisor',
  'Encarregado'
];

const DEPARTAMENTOS_LISTA = [
  'Gestão',
  'Financeiro',
  'Obras'
];

// ===== URL da API (definida no auth.js; fallback para não quebrar sem ele) =====
const URL_API_USUARIOS = (typeof URL_API !== 'undefined' && URL_API)
  ? URL_API
  : 'https://script.google.com/macros/s/AKfycbx1juNc0tIefpx0e-_xb4Vya00FkuIP8FnVsCySfdTdGyckSMQn3Cwr5YYtyhAyIbR6/exec';

async function chamarApiUsuarios(action, dados) {
  const fd = new FormData();
  fd.append('action', action);
  fd.append('dados', JSON.stringify(dados || {}));
  const resp = await fetch(URL_API_USUARIOS, { method: 'POST', body: fd });
  return resp.json();
}

// ===== Carregamento DIRETO da planilha (action=getUsuarios) =====
// A senha nunca vem ao front — o backend retorna apenas tem_senha (true/false)
function normalizarUsuario(u) {
  return {
    id: u.id,
    nome: u.nome || '',
    email: u.email || '',
    cargo: u.cargo || '',
    departamento: u.departamento || '',
    situacao: (u.situacao || u.status || 'ATIVO').toUpperCase(),
    data_cadastro: u.data_cadastro || '',
    data_desativado: u.data_desativado || '',
    telefone: u.telefone || '',
    tem_senha: !!u.tem_senha
  };
}

async function carregarUsuarios() {
  try {
    const r = await chamarApiUsuarios('getUsuarios');
    if (r.success && Array.isArray(r.usuarios)) {
      return r.usuarios.map(normalizarUsuario);
    }
    console.error('getUsuarios falhou:', r.erro);
    return [];
  } catch (e) {
    console.error('Erro de conexão ao carregar usuários:', e);
    return [];
  }
}

// Data/hora atual no formato usado pela planilha (dd/mm/aaaa hh:mm:ss)
function agoraFormatado() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Converte qualquer data (ISO 8601, dd/mm/aaaa, etc.) para exibição dd/mm/aaaa hh:mm:ss
function formatarDataBR(valor) {
  if (!valor) return '';
  const s = String(valor).trim();
  if (!s) return '';
  // Já está no formato brasileiro? Retorna como veio
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s;
  // ISO 8601 (ex.: 2026-04-29T21:44:47.000Z) — converte para o fuso local
  const d = new Date(s);
  if (isNaN(d.getTime())) return s; // não reconheceu: exibe o texto original
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ===== Cargos/Departamentos viram listas suspensas (select) =====
// Converte o campo (input) em select com as opções das listas acima.
// Se o usuário tiver um valor fora da lista (ex.: "CEO", "Projeto"),
// ele é preservado como opção — nada se perde na edição.
function transformarCampoEmSelect(idCampo, opcoes) {
  const campo = document.getElementById(idCampo);
  if (!campo || campo.tagName === 'SELECT') return campo;

  const select = document.createElement('select');
  select.id = campo.id;
  select.name = campo.name;
  select.className = campo.className;
  select.style.cssText = campo.style.cssText;

  const valorAtual = campo.value || '';

  const opcaoVazia = document.createElement('option');
  opcaoVazia.value = '';
  opcaoVazia.textContent = 'Selecione...';
  select.appendChild(opcaoVazia);

  opcoes.forEach((opcao) => {
    const opt = document.createElement('option');
    opt.value = opcao;
    opt.textContent = opcao;
    select.appendChild(opt);
  });

  // Preserva valor que não está na lista
  if (valorAtual && !opcoes.includes(valorAtual)) {
    const optAtual = document.createElement('option');
    optAtual.value = valorAtual;
    optAtual.textContent = valorAtual;
    select.appendChild(optAtual);
  }

  campo.parentNode.replaceChild(select, campo);
  select.value = valorAtual;
  return select;
}

function prepararCamposLista() {
  transformarCampoEmSelect('usuario-cargo', CARGOS_LISTA);
  transformarCampoEmSelect('usuario-departamento', DEPARTAMENTOS_LISTA);
}

// ===== Renderização da tabela =====
async function renderizarTabela() {
  const corpo = document.getElementById('corpo-tabela-usuarios');
  if (!corpo) return;

  corpo.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#889;">Carregando usuários...</td></tr>';

  const usuarios = await carregarUsuarios();

  if (!usuarios.length) {
    corpo.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#889;">Nenhum usuário encontrado.</td></tr>';
    return;
  }

  corpo.innerHTML = usuarios.map((u) => {
    const classeSituacao = (u.situacao || 'ATIVO').toLowerCase() === 'ativo' ? 'ativo' : 'inativo';
    const dataCadastro = formatarDataBR(u.data_cadastro) || '--';
    return `
      <tr>
        <td>${u.id}</td>
        <td>${u.nome || '--'}</td>
        <td>${u.email || '--'}</td>
        <td>${u.cargo || '--'}</td>
        <td>${u.departamento || '--'}</td>
        <td><span class="etiqueta ${classeSituacao}">${u.situacao}</span></td>
        <td>${u.telefone || '--'}</td>
        <td style="white-space:nowrap;">${dataCadastro}</td>
        <td style="white-space:nowrap;">
          <span style="display:inline-flex;align-items:center;gap:6px;">
            <button class="btn-acao senha" data-senha="${u.id}" title="${u.tem_senha ? 'Trocar senha (definida)' : 'Definir senha (sem senha)'}">${u.tem_senha ? '🔒' : '🔓'}</button>
            <button class="btn-acao" data-editar="${u.id}" title="Editar">✏️</button>
            <button class="btn-acao excluir" data-situacao="${u.id}" title="${u.situacao === 'INATIVO' ? 'Reativar' : 'Inativar'}">${u.situacao === 'INATIVO' ? '✅' : '🚫'}</button>
          </span>
        </td>
      </tr>
    `;
  }).join('');
}

// ===== Modal: abrir / fechar =====
function abrirModal(usuario) {
  const modal = document.getElementById('modal-usuario');
  if (!modal) return;

  const titulo = modal.querySelector('.modal-titulo, h2');
  if (titulo) titulo.textContent = usuario ? 'Editar Usuário' : 'Novo Usuário';

  const ui = (id) => document.getElementById(id);
  if (ui('usuario-id')) ui('usuario-id').value = usuario ? usuario.id : '';
  if (ui('usuario-nome')) ui('usuario-nome').value = usuario ? usuario.nome || '' : '';
  if (ui('usuario-email')) ui('usuario-email').value = usuario ? usuario.email || '' : '';
  if (ui('usuario-cargo')) ui('usuario-cargo').value = usuario ? usuario.cargo || '' : '';
  if (ui('usuario-departamento')) ui('usuario-departamento').value = usuario ? usuario.departamento || '' : '';
  if (ui('usuario-telefone')) ui('usuario-telefone').value = usuario ? usuario.telefone || '' : '';
  if (ui('usuario-situacao')) ui('usuario-situacao').value = usuario ? usuario.situacao || 'ATIVO' : 'ATIVO';
  if (ui('usuario-data-cadastro')) ui('usuario-data-cadastro').value = usuario ? formatarDataBR(usuario.data_cadastro) : agoraFormatado();
  if (ui('usuario-data-desativado')) ui('usuario-data-desativado').value = usuario ? formatarDataBR(usuario.data_desativado) : '';

  modal.classList.add('aberto');
}

function fecharModal() {
  const modal = document.getElementById('modal-usuario');
  if (modal) modal.classList.remove('aberto');
}

// =========================================================
// SENHA DO USUÁRIO — action definirSenha grava o hash na coluna "Senha"
// =========================================================

let usuarioSenhaEmail = null;

function injetarModalSenha() {
  if (document.getElementById('modal-senha')) return;

  const modal = document.createElement('div');
  modal.id = 'modal-senha';
  modal.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.45);z-index:10000;justify-content:center;align-items:center;';
  modal.innerHTML =
    '<div style="background:#fff;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.35);padding:28px;width:92%;max-width:380px;box-sizing:border-box;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
        '<h2 style="margin:0;font-size:18px;color:#0d3b7d;">Definir Senha</h2>' +
        '<button id="btn-fechar-senha" style="border:none;background:transparent;font-size:22px;cursor:pointer;color:#55677d;line-height:1;" title="Fechar">&times;</button>' +
      '</div>' +
      '<p id="senha-usuario-info" style="margin:0 0 16px;color:#55677d;font-size:13px;"></p>' +
      '<label style="display:block;margin-bottom:6px;color:#33475b;font-size:14px;font-weight:600;">Nova senha</label>' +
      '<input type="password" id="nova-senha" autocomplete="new-password" placeholder="Mínimo 4 caracteres" style="display:block;width:100%;padding:12px 14px;margin-bottom:14px;border:1px solid #ccd6e0;border-radius:10px;background:#f7f9fc;font-size:15px;outline:none;box-sizing:border-box;">' +
      '<label style="display:block;margin-bottom:6px;color:#33475b;font-size:14px;font-weight:600;">Confirmar senha</label>' +
      '<input type="password" id="confirmar-senha" autocomplete="new-password" style="display:block;width:100%;padding:12px 14px;margin-bottom:18px;border:1px solid #ccd6e0;border-radius:10px;background:#f7f9fc;font-size:15px;outline:none;box-sizing:border-box;">' +
      '<p id="senha-erro-modal" style="display:none;background:#fdecea;color:#c0392b;padding:9px;border-radius:8px;font-size:13px;margin:0 0 14px;text-align:center;"></p>' +
      '<div style="display:flex;justify-content:flex-end;gap:10px;">' +
        '<button id="btn-cancelar-senha" style="padding:11px 18px;border:1px solid #ccd6e0;background:#fff;border-radius:10px;font-size:14px;cursor:pointer;color:#33475b;">Cancelar</button>' +
        '<button id="btn-salvar-senha" style="padding:11px 18px;border:none;background:linear-gradient(135deg,#1e88e5,#1565c0);color:#fff;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;">Salvar</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);

  document.getElementById('btn-fechar-senha').addEventListener('click', fecharModalSenha);
  document.getElementById('btn-cancelar-senha').addEventListener('click', fecharModalSenha);
  modal.addEventListener('click', (e) => { if (e.target === modal) fecharModalSenha(); });
  document.getElementById('btn-salvar-senha').addEventListener('click', salvarSenhaUsuario);
}

function abrirModalSenha(email) {
  usuarioSenhaEmail = email || '';
  document.getElementById('senha-usuario-info').textContent = 'Usuário: ' + (email || '—');
  document.getElementById('nova-senha').value = '';
  document.getElementById('confirmar-senha').value = '';
  document.getElementById('senha-erro-modal').style.display = 'none';
  document.getElementById('modal-senha').style.display = 'flex';
}

function fecharModalSenha() {
  const modal = document.getElementById('modal-senha');
  if (modal) modal.style.display = 'none';
}

async function salvarSenhaUsuario() {
  const s1 = document.getElementById('nova-senha').value;
  const s2 = document.getElementById('confirmar-senha').value;
  const erroEl = document.getElementById('senha-erro-modal');

  erroEl.style.display = 'none';

  if (!usuarioSenhaEmail) {
    erroEl.textContent = 'Usuário sem e-mail cadastrado. Defina o e-mail antes da senha.';
    erroEl.style.display = 'block';
    return;
  }
  if (s1.length < 4) {
    erroEl.textContent = 'A senha deve ter pelo menos 4 caracteres.';
    erroEl.style.display = 'block';
    return;
  }
  if (s1 !== s2) {
    erroEl.textContent = 'As senhas não conferem.';
    erroEl.style.display = 'block';
    return;
  }

  const btnSalvar = document.getElementById('btn-salvar-senha');
  btnSalvar.disabled = true;

  try {
    const r = await chamarApiUsuarios('definirSenha', { email: usuarioSenhaEmail, senha: s1 });
    if (r.success) {
      fecharModalSenha();
      renderizarTabela();
      alert(r.mensagem || 'Senha definida com sucesso.');
    } else {
      erroEl.textContent = r.erro || 'Não foi possível salvar a senha.';
      erroEl.style.display = 'block';
    }
  } catch (e) {
    erroEl.textContent = 'Erro de conexão com o servidor. Tente novamente.';
    erroEl.style.display = 'block';
  } finally {
    btnSalvar.disabled = false;
  }
}

// ===== Eventos =====
document.addEventListener('DOMContentLoaded', () => {
  // Converte Cargo e Departamento em listas suspensas (select)
  prepararCamposLista();

  // Botão "Novo Usuário"
  const btnNovo = document.getElementById('btn-novo-usuario');
  if (btnNovo) btnNovo.addEventListener('click', () => abrirModal(null));

  // Fechar modal (X, Cancelar e clique fora)
  const btnFechar = document.getElementById('btn-fechar-modal');
  if (btnFechar) btnFechar.addEventListener('click', fecharModal);

  const btnCancelar = document.getElementById('btn-cancelar');
  if (btnCancelar) btnCancelar.addEventListener('click', fecharModal);

  const modalFundo = document.getElementById('modal-usuario');
  if (modalFundo) {
    modalFundo.addEventListener('click', (e) => {
      if (e.target.id === 'modal-usuario') fecharModal();
    });
  }

  // Botões de editar, senha e ativar/inativar da tabela
  const corpo = document.getElementById('corpo-tabela-usuarios');
  if (corpo) {
    corpo.addEventListener('click', async (e) => {
      const idEditar = e.target.dataset.editar;
      const idSenha = e.target.dataset.senha;
      const idSituacao = e.target.dataset.situacao;
      const usuarios = await carregarUsuarios();

      if (idEditar) {
        const usuario = usuarios.find((u) => u.id == idEditar);
        if (usuario) abrirModal(usuario);
      }

      if (idSenha) {
        const usuario = usuarios.find((u) => u.id == idSenha);
        if (usuario) {
          if (!usuario.email) {
            alert('Este usuário não tem e-mail cadastrado. Edite e informe o e-mail primeiro.');
            return;
          }
          injetarModalSenha();
          abrirModalSenha(usuario.email);
        }
      }

      if (idSituacao) {
        const usuario = usuarios.find((u) => u.id == idSituacao);
        if (usuario) {
          const inativar = usuario.situacao !== 'INATIVO';
          const acao = inativar ? 'inativar' : 'reativar';
          if (!confirm(`${acao === 'inativar' ? 'Inativar' : 'Reativar'} o usuário "${usuario.nome}"?`)) return;
          const r = await chamarApiUsuarios('definirSituacaoUsuario', {
            id: usuario.id,
            situacao: inativar ? 'INATIVO' : 'ATIVO'
          });
          if (r.success) {
            renderizarTabela();
          } else {
            alert('Erro: ' + (r.erro || 'não foi possível alterar a situação.'));
          }
        }
      }
    });
  }

  // Salvar (criar ou editar) — via API salvarUsuario
  const form = document.getElementById('form-usuario');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const dados = {
        id: (document.getElementById('usuario-id') || {}).value || '',
        nome: document.getElementById('usuario-nome').value.trim(),
        email: document.getElementById('usuario-email').value.trim(),
        cargo: document.getElementById('usuario-cargo').value.trim(),
        departamento: document.getElementById('usuario-departamento').value.trim(),
        telefone: document.getElementById('usuario-telefone').value.trim(),
        situacao: document.getElementById('usuario-situacao').value,
        data_cadastro: (document.getElementById('usuario-data-cadastro') || {}).value || '',
        data_desativado: (document.getElementById('usuario-data-desativado') || {}).value || ''
      };

      // Novo registro: data de cadastro automática se vazia
      if (!dados.id && !dados.data_cadastro) dados.data_cadastro = agoraFormatado();
      // Ao ativar pela edição, limpa a data de desativação
      if (dados.situacao === 'ATIVO') dados.data_desativado = '';

      try {
        const r = await chamarApiUsuarios('salvarUsuario', dados);
        if (r.success) {
          renderizarTabela();
          fecharModal();
        } else {
          alert('Erro ao salvar: ' + (r.erro || 'tente novamente.'));
        }
      } catch (err) {
        alert('Erro de conexão com o servidor. Tente novamente.');
      }
    });
  }

  // Renderização inicial
  renderizarTabela();
});
