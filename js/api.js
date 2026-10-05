// =========================================================
// api.js — Camada de comunicação com a API REST (Node.js + SQLite)
// Substitui a antiga chamada ao Google Apps Script (code.gs)
// Todas as chamadas usam fetch + JSON; a sessão é um cookie httpOnly
// =========================================================

const API_BASE = '/api';

async function requisicao(caminho, opcoes = {}) {
  const config = {
    method: opcoes.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opcoes.headers || {}) },
    credentials: 'same-origin'
  };
  if (opcoes.body) {
    config.body = typeof opcoes.body === 'string' ? opcoes.body : JSON.stringify(opcoes.body);
  }
  const resp = await fetch(API_BASE + caminho, config);
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const erro = new Error(dados.erro || `Erro na requisição (HTTP ${resp.status})`);
    erro.status = resp.status;
    throw erro;
  }
  return dados;
}

// window.api garante que o objeto fica global (acessível em todos os scripts)
window.api = {
  // ===== Autenticação =====
  auth: {
    login: (email, senha) => requisicao('/auth/login', { method: 'POST', body: { email, senha } }),
    logout: () => requisicao('/auth/logout', { method: 'POST' }),
    me: () => requisicao('/auth/me'),
    definirSenha: (email, senha) => requisicao('/auth/senha', { method: 'POST', body: { email, senha } })
  },

  // ===== Obras =====
  obras: {
    listar: () => requisicao('/obras'),
    buscar: (id) => requisicao(`/obras/${id}`),
    criar: (dados) => requisicao('/obras', { method: 'POST', body: dados }),
    atualizar: (id, dados) => requisicao(`/obras/${id}`, { method: 'PUT', body: dados }),
    excluir: (id) => requisicao(`/obras/${id}`, { method: 'DELETE' }),
    avancarStatus: (id, dados) => requisicao(`/obras/${id}/avancar-status`, { method: 'POST', body: dados })
  },

  // ===== Tarefas =====
  tarefas: {
    listar: () => requisicao('/tarefas'),
    buscar: (id) => requisicao(`/tarefas/${id}`),
    criar: (dados) => requisicao('/tarefas', { method: 'POST', body: dados }),
    atualizar: (id, dados) => requisicao(`/tarefas/${id}`, { method: 'PUT', body: dados }),
    excluir: (id) => requisicao(`/tarefas/${id}`, { method: 'DELETE' })
  },

  // ===== Cronograma =====
  cronograma: {
    listar: () => requisicao('/cronograma'),
    salvar: (dados) => requisicao('/cronograma', { method: 'POST', body: dados }),
    excluir: (id) => requisicao(`/cronograma/${id}`, { method: 'DELETE' })
  },

  // ===== Usuários =====
  usuarios: {
    listar: () => requisicao('/usuarios'),
    criar: (dados) => requisicao('/usuarios', { method: 'POST', body: dados }),
    atualizar: (id, dados) => requisicao(`/usuarios/${id}`, { method: 'PUT', body: dados }),
    definirSituacao: (id, situacao) => requisicao(`/usuarios/${id}/situacao`, { method: 'PATCH', body: { situacao } })
  },

  // ===== Status e listas =====
  status: {
    geral: () => requisicao('/status/geral'),
    tarefas: () => requisicao('/status/tarefas'),
    financeiro: () => requisicao('/status/financeiro'),
    tiposProposta: () => requisicao('/status/tipos-proposta')
  },

  // ===== Histórico =====
  historico: {
    listar: (idObra) => requisicao(`/historico${idObra ? `?obra=${idObra}` : ''}`)
  },

  // ===== Relatório =====
  relatorio: {
    listar: () => requisicao('/relatorio')
  },

  // ===== Observações =====
  observacoes: {
    listarObra: (idObra) => requisicao(`/obras/${idObra}/observacoes`),
    listarTarefa: (idTarefa) => requisicao(`/tarefas/${idTarefa}/observacoes`),
    criarObra: (idObra, dados) => requisicao(`/obras/${idObra}/observacoes`, { method: 'POST', body: dados }),
    criarTarefa: (idTarefa, dados) => requisicao(`/tarefas/${idTarefa}/observacoes`, { method: 'POST', body: dados })
  }
};

// Mantém compatibilidade com os scripts antigos que chamam api.getObras() etc.
window.api.getObras = () => window.api.obras.listar();
window.api.getTarefas = () => window.api.tarefas.listar();
window.api.getUsuarios = () => window.api.usuarios.listar();
window.api.getCronograma = () => window.api.cronograma.listar();
window.api.chamarApi = requisicao;
