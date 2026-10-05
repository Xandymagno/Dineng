// obras.js — lógica da gestão de obras (100% via planilha / code.gs)
// Estrutura conforme a aba "Geral" da planilha:
// id | cod | Interessado | End | Responsavel | Telefone | TIPO PROPOSTA | Responsavel_Dineng |
// Cadastro | Data Solicitacao | Status | Data Envio | data_novo_status | Status Anterior | aparelho

// ===== URL da API (definida no auth.js; fallback para não quebrar sem ele) =====
const URL_API_OBRAS = (typeof URL_API !== 'undefined' && URL_API)
  ? URL_API
  : 'https://script.google.com/macros/s/AKfycbx1juNc0tIefpx0e-_xb4Vya00FkuIP8FnVsCySfdTdGyckSMQn3Cwr5YYtyhAyIbR6/exec';

async function chamarApiObras(action, dados) {
  const fd = new FormData();
  fd.append('action', action);
  fd.append('dados', JSON.stringify(dados || {}));
  const resp = await fetch(URL_API_OBRAS, { method: 'POST', body: fd });
  return resp.json();
}

// =========================================================
// STATUS — base local com ícones (fallback) + carregado da planilha
// A aba status_geral fornece NOME | PRAZO | SEGUENCIA; o ícone
// é definido aqui para preservar o visual atual.
// =========================================================
const STATUS_BASE = [
  { nome: 'CADASTRADA',             icone: '📝', prazo: 2,    sequencia: 0 },
  { nome: 'ELABORAÇÃO DA PROPOSTA', icone: '✍️', prazo: 4,    sequencia: 1 },
  { nome: 'PROPOSTA ENVIADA',       icone: '📤', prazo: 8,    sequencia: 2 },
  { nome: 'CANCELADO',              icone: '❌', prazo: 0,    sequencia: 3 },
  { nome: 'CONTRATO EM ANDAMENTO',  icone: '📄', prazo: null, sequencia: 3 },
  { nome: 'CONTRATO ENCERRADO',     icone: '✅', prazo: 0,    sequencia: 4 },
  { nome: 'ANALISE ENERGISA',       icone: '🔍', prazo: 5,    sequencia: 5 },
  { nome: 'AGUARDANDO PAGAMENTO',   icone: '💰', prazo: 5,    sequencia: 5 }
];

let STATUS_ATIVOS = [...STATUS_BASE];

// Carrega os status da aba status_geral e mescla com os ícones locais
async function carregarStatus() {
  try {
    const r = await chamarApiObras('getStatusGeral');
    if (r.success && Array.isArray(r.status) && r.status.length) {
      STATUS_ATIVOS = r.status.map(function (s) {
        const base = STATUS_BASE.find(function (b) {
          return String(b.nome).trim().toUpperCase() === String(s.nome).trim().toUpperCase();
        });
        return {
          nome: s.nome,
          icone: base ? base.icone : '•',
          prazo: Number(s.prazo || 0),
          sequencia: Number(s.sequencia || 0)
        };
      });
    }
  } catch (e) {
    // mantém STATUS_BASE como fallback
  }
  popularSelects();
}

// Busca a configuração de um status pelo nome
function configStatus(nome) {
  const n = String(nome || '').trim();
  if (!n) return null;
  return STATUS_ATIVOS.find(function (s) {
    return String(s.nome || '').trim().toUpperCase() === n.toUpperCase();
  }) || null;
}

// Próximos status possíveis = statuses na menor sequência maior que a atual.
// Pode retornar mais de um (ex: da PROPOSTA ENVIADA saem CANCELADO e CONTRATO EM ANDAMENTO).
// CANCELADO como status atual é terminal: obra cancelada não avança.
function proximosStatus(nomeAtual) {
  const atual = configStatus(nomeAtual);
  if (!atual || String(atual.nome).toUpperCase() === 'CANCELADO') return [];

  const sequenciasMaiores = STATUS_ATIVOS
    .filter(function (s) { return s.sequencia > atual.sequencia; })
    .map(function (s) { return s.sequencia; });

  if (!sequenciasMaiores.length) return []; // última sequência do fluxo

  const proximaSequencia = Math.min.apply(null, sequenciasMaiores);
  return STATUS_ATIVOS.filter(function (s) { return s.sequencia === proximaSequencia; });
}

// ===== Obras (cache em memória, preenchido pelo getObras) =====
let obrasCache = null;

function normalizarObra(o) {
  let historico = [];
  if (o.status_anterior) {
    historico = [{ de: o.status_anterior, para: o.status, data: o.data_novo_status || '', usuario: '' }];
  }
  return {
    id: o.id,
    cod: o.cod || String(o.id),
    interessado: o.interessado || '',
    endereco: o.endereco || '',
    responsavel: o.responsavel || '',
    telefone: o.telefone || '',
    tipo: o.tipo_proposta || o.tipo || '',
    responsavel_dineng: o.responsavel_dineng || '',
    cadastro: o.cadastro || '',
    data_solicitacao: o.data_solicitacao || '',
    data_envio: o.data_envio || '',
    aparelho: o.aparelho || '',
    status: o.status || 'CADASTRADA',
    status_anterior: o.status_anterior || '',
    data_novo_status: o.data_novo_status || '',
    historico: historico
  };
}

async function carregarObras(refresh) {
  if (obrasCache && !refresh) return obrasCache;
  try {
    const r = await chamarApiObras('getObras');
    if (r.success && Array.isArray(r.obras)) {
      obrasCache = r.obras.map(normalizarObra);
      return obrasCache;
    }
    console.error('getObras falhou:', r.erro);
    return obrasCache || [];
  } catch (e) {
    console.error('Erro de conexão ao carregar obras:', e);
    return obrasCache || [];
  }
}

// Nome do usuário logado (sessão criada no login, definida no auth.js)
function usuarioLogado() {
  const sessao = typeof obterSessao === 'function' ? obterSessao() : null;
  return sessao && sessao.nome ? sessao.nome : '';
}

function hojeFormatado() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function agoraFormatado() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Data ISO 8601 (ex.: 2026-04-29T21:44:47.000Z ou 2026-04-29) para dd/mm/aaaa hh:mm:ss
function formatarDataBR(valor) {
  if (!valor) return '';
  const s = String(valor).trim();
  if (!s) return '';
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ===== Classes CSS por status =====
function classeStatus(s) {
  const nome = String(s || '').toUpperCase();
  if (nome === 'CANCELADO') return 'st-cancelado';
  if (nome === 'CONTRATO EM ANDAMENTO') return 'st-andamento';
  if (nome === 'PROPOSTA ENVIADA') return 'st-enviada';
  if (nome === 'ANALISE ENERGISA') return 'st-energisa';
  if (nome === 'CONTRATO ENCERRADO') return 'st-encerrado';
  if (nome === 'AGUARDANDO PAGAMENTO') return 'st-pagamento';
  return 'st-cadastrada';
}

// ===== KPIs =====
async function atualizarKpis() {
  const obras = await carregarObras();
  const contar = function (status) { return obras.filter(function (o) { return String(o.status).toUpperCase() === status; }).length; };

  const el = (id) => document.getElementById(id);
  if (el('kpi-total')) el('kpi-total').textContent = obras.length;
  if (el('kpi-andamento')) el('kpi-andamento').textContent = contar('CONTRATO EM ANDAMENTO');
  if (el('kpi-propostas')) el('kpi-propostas').textContent = contar('PROPOSTA ENVIADA');
  if (el('kpi-canceladas')) el('kpi-canceladas').textContent = contar('CANCELADO');
}

// ===== Renderização da tabela (com filtros, usando o cache) =====
async function renderizarTabela() {
  const corpo = document.getElementById('corpo-tabela-obras');
  if (!corpo) return;

  const busca = (document.getElementById('busca-obra') || {}).value ? document.getElementById('busca-obra').value.toLowerCase().trim() : '';
  const filtro = (document.getElementById('filtro-status') || {}).value || '';

  const obras = await carregarObras();

  const filtradas = obras.filter(function (o) {
    const casaBusca = !busca ||
      String(o.interessado || '').toLowerCase().includes(busca) ||
      String(o.tipo || '').toLowerCase().includes(busca) ||
      String(o.responsavel || '').toLowerCase().includes(busca);
    const casaStatus = !filtro || String(o.status) === filtro;
    return casaBusca && casaStatus;
  });

  if (!filtradas.length) {
    corpo.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--cor-texto-suave);">Nenhuma obra encontrada.</td></tr>';
    return;
  }

  corpo.innerHTML = filtradas.map(function (o) {
    const temProximo = proximosStatus(o.status).length > 0;
    const btnAvancar = temProximo
      ? '<button class="btn-acao avancar" data-avancar="' + o.id + '" title="Avançar status">➡️</button>'
      : '';

    const btnHistorico = '<button class="btn-acao" data-historico="' + o.id + '" title="Histórico de status">📜</button>';

    return (
      '<tr>' +
        '<td>' + o.cod + '</td>' +
        '<td>' + (o.interessado || '--') + '</td>' +
        '<td><span class="texto-longo" title="' + (o.tipo || '') + '">' + (o.tipo || '--') + '</span></td>' +
        '<td>' + (o.responsavel || '--') + '</td>' +
        '<td>' + (o.telefone || '--') + '</td>' +
        '<td style="white-space:nowrap;">' + (formatarDataBR(o.cadastro) || '--') + '</td>' +
        '<td><span class="etiqueta-status ' + classeStatus(o.status) + '">' + o.status + '</span></td>' +
        '<td style="white-space:nowrap;">' +
          '<span style="display:inline-flex;align-items:center;gap:6px;">' +
            btnHistorico + btnAvancar +
            '<button class="btn-acao" data-editar="' + o.id + '" title="Editar">✏️</button>' +
            '<button class="btn-acao excluir" data-excluir="' + o.id + '" title="Excluir">🗑️</button>' +
          '</span>' +
        '</td>' +
      '</tr>'
    );
  }).join('');
}

// ===== Preenche os selects (filtro e formulário) com os status carregados =====
function popularSelects() {
  const opcoesHtml = STATUS_ATIVOS.map(function (s) {
    return '<option value="' + s.nome + '">' + s.nome + '</option>';
  }).join('');

  const filtro = document.getElementById('filtro-status');
  if (filtro) {
    filtro.innerHTML = '<option value="">Todos os status</option>' + opcoesHtml;
  }

  const selStatus = document.getElementById('obra-status');
  if (selStatus) {
    selStatus.innerHTML = opcoesHtml;
  }
}

// ===== Modal: Avançar status =====
let obraPendenteStatus = null; // id da obra sendo avançada

function abrirModalStatus(id) {
  const obrasC = obrasCache || [];
  const obra = obrasC.find(function (o) { return String(o.id) === String(id); });
  const modal = document.getElementById('modal-status');
  if (!obra || !modal) return;

  const opcoes = proximosStatus(obra.status);

  if (!opcoes.length) {
    alert('Este status não possui próximo na sequência.');
    return;
  }

  obraPendenteStatus = id;

  const atual = configStatus(obra.status);
  const elNome = document.getElementById('status-obra-nome');
  if (elNome) elNome.textContent = obra.interessado;

  const elAtual = document.getElementById('status-atual-display');
  if (elAtual) {
    elAtual.innerHTML = '<span class="etiqueta-status ' + classeStatus(obra.status) + '">' + (atual && atual.icone ? atual.icone + ' ' : '') + obra.status + '</span>';
  }

  const container = document.getElementById('status-opcoes');
  if (container) {
    container.innerHTML = opcoes.map(function (s) {
      const prazoTexto = s.prazo ? 'Prazo: ' + s.prazo + (s.prazo > 1 ? ' dias' : ' dia') : 'Sem prazo definido';
      return (
        '<button class="btn-status-opcao ' + classeStatus(s.nome) + '" data-status="' + s.nome + '">' +
          '<span class="icone-status">' + s.icone + '</span>' +
          '<span class="info">' +
            '<span class="nome-status">' + s.nome + '</span>' +
            '<span class="prazo-status">Sequência ' + s.sequencia + ' · ' + prazoTexto + '</span>' +
          '</span>' +
        '</button>'
      );
    }).join('');
  }

  modal.classList.add('aberto');
}

function fecharModalStatus() {
  const modal = document.getElementById('modal-status');
  if (modal) modal.classList.remove('aberto');
  obraPendenteStatus = null;
}

// Aplica a transição escolhida no modal (chama avancarStatus no servidor)
async function aplicaStatus(id, novoStatus) {
  try {
    const r = await chamarApiObras('avancarStatus', {
      id_obra: String(id),
      novo_status: novoStatus,
      responsavel: usuarioLogado()
    });
    if (r.success) {
      obrasCache = null; // força recarregar da planilha
      await carregarObras(true);
      renderizarTabela();
      atualizarKpis();
      fecharModalStatus();
    } else {
      alert('Erro: ' + (r.erro || 'não foi possível avançar o status.'));
    }
  } catch (e) {
    alert('Erro de conexão com o servidor. Tente novamente.');
  }
}

// ===== Modal: Histórico de status (vindo da planilha) =====
async function abrirModalHistorico(id) {
  const modal = document.getElementById('modal-historico');
  if (!modal) return;

  const obra = (obrasCache || []).find(function (o) { return String(o.id) === String(id); });
  const elNome = document.getElementById('historico-obra-nome');
  if (elNome && obra) elNome.textContent = obra.interessado;

  const lista = document.getElementById('historico-lista');
  if (!lista) return;

  lista.innerHTML = '<p class="historico-vazio">Carregando histórico...</p>';
  modal.classList.add('aberto');

  try {
    const r = await chamarApiObras('getHistorico', { id_obra: String(id) });
    const itens = (r.success && Array.isArray(r.historico) ? r.historico : []).map(function (h) {
      return {
        de: h.status_anterior || '',
        para: h.status_novo || '',
        data: h.data || '',
        usuario: h.responsavel || ''
      };
    });

    if (!itens.length) {
      lista.innerHTML = '<p class="historico-vazio">Nenhuma mudança de status registrada ainda.</p>';
    } else {
      const itensHtml = itens.slice().reverse().map(function (h) {
        const deIcone = configStatus(h.de);
        const paraIcone = configStatus(h.para);
        const usuarioTexto = h.usuario ? '👤 ' + h.usuario : '👤 Registro da planilha';
        return (
          '<div class="historico-item">' +
            '<div class="historico-marcador ' + classeStatus(h.para) + '"></div>' +
            '<div class="historico-conteudo">' +
              '<div class="historico-transicao">' +
                '<span class="etiqueta-status ' + classeStatus(h.de) + '">' + (deIcone && deIcone.icone ? deIcone.icone + ' ' : '') + (h.de || '—') + '</span>' +
                '<span class="historico-seta">→</span>' +
                '<span class="etiqueta-status ' + classeStatus(h.para) + '">' + (paraIcone && paraIcone.icone ? paraIcone.icone + ' ' : '') + h.para + '</span>' +
              '</div>' +
              '<div class="historico-data">🕒 ' + (formatarDataBR(h.data) || 'sem data registrada') + ' · ' + usuarioTexto + '</div>' +
            '</div>' +
          '</div>'
        );
      }).join('');
      lista.innerHTML = itensHtml;
    }
  } catch (e) {
    lista.innerHTML = '<p class="historico-vazio">Não foi possível carregar o histórico.</p>';
  }
}

function fecharModalHistorico() {
  const modal = document.getElementById('modal-historico');
  if (modal) modal.classList.remove('aberto');
}

// ===== Modal: Criar / Editar obra =====
function abrirModal(obra) {
  const modal = document.getElementById('modal-obra');
  if (!modal) return;

  const titulo = document.getElementById('modal-titulo');

  if (obra) {
    titulo.textContent = 'Editar Obra';
    const ui = (id) => document.getElementById(id);
    if (ui('obra-id')) ui('obra-id').value = obra.id;
    if (ui('obra-interessado')) ui('obra-interessado').value = obra.interessado;
    if (ui('obra-tipo')) ui('obra-tipo').value = obra.tipo;
    if (ui('obra-responsavel')) ui('obra-responsavel').value = obra.responsavel;
    if (ui('obra-telefone')) ui('obra-telefone').value = obra.telefone;
    if (ui('obra-endereco')) ui('obra-endereco').value = obra.endereco;
    if (ui('obra-data-solicitacao')) ui('obra-data-solicitacao').value = formatarDataBR(obra.data_solicitacao);
    if (ui('obra-status')) ui('obra-status').value = obra.status;
    if (ui('obra-cadastro')) ui('obra-cadastro').value = formatarDataBR(obra.cadastro);
  } else {
    titulo.textContent = 'Nova Obra';
    const form = document.getElementById('form-obra');
    if (form) form.reset();
    const ui = (id) => document.getElementById(id);
    if (ui('obra-id')) ui('obra-id').value = '';
    if (ui('obra-cadastro')) ui('obra-cadastro').value = hojeFormatado();
  }

  modal.classList.add('aberto');
}

function fecharModal() {
  const modal = document.getElementById('modal-obra');
  if (modal) modal.classList.remove('aberto');
}

// ===== Eventos =====
document.addEventListener('DOMContentLoaded', () => {
  // 1) Carrega status (popular selects) e depois a tabela
  carregarStatus().then(function () {
    renderizarTabela();
    atualizarKpis();
  });

  // Botão "Nova Obra"
  const btnNova = document.getElementById('btn-nova-obra');
  if (btnNova) btnNova.addEventListener('click', () => abrirModal(null));

  // Fechar modal de obra (X, Cancelar e clique fora)
  const btnFechar = document.getElementById('btn-fechar-modal');
  if (btnFechar) btnFechar.addEventListener('click', fecharModal);

  const btnCancelar = document.getElementById('btn-cancelar');
  if (btnCancelar) btnCancelar.addEventListener('click', fecharModal);

  const modalFundo = document.getElementById('modal-obra');
  if (modalFundo) {
    modalFundo.addEventListener('click', (e) => {
      if (e.target.id === 'modal-obra') fecharModal();
    });
  }

  // Fechar modal de status (X, Cancelar e clique fora)
  const btnFecharStatus = document.getElementById('btn-fechar-modal-status');
  if (btnFecharStatus) btnFecharStatus.addEventListener('click', fecharModalStatus);

  const btnCancelarStatus = document.getElementById('btn-cancelar-status');
  if (btnCancelarStatus) btnCancelarStatus.addEventListener('click', fecharModalStatus);

  const modalStatusFundo = document.getElementById('modal-status');
  if (modalStatusFundo) {
    modalStatusFundo.addEventListener('click', (e) => {
      if (e.target.id === 'modal-status') fecharModalStatus();
    });
  }

  // Clique em uma das opções de próximo status
  const opcoesContainer = document.getElementById('status-opcoes');
  if (opcoesContainer) {
    opcoesContainer.addEventListener('click', (e) => {
      const botao = e.target.closest('.btn-status-opcao');
      if (!botao || obraPendenteStatus === null) return;
      aplicaStatus(obraPendenteStatus, botao.dataset.status);
    });
  }

  // Fechar modal de histórico (X, Fechar e clique fora)
  const btnFecharHistorico = document.getElementById('btn-fechar-modal-historico');
  if (btnFecharHistorico) btnFecharHistorico.addEventListener('click', fecharModalHistorico);

  const btnCancelarHistorico = document.getElementById('btn-cancelar-historico');
  if (btnCancelarHistorico) btnCancelarHistorico.addEventListener('click', fecharModalHistorico);

  const modalHistoricoFundo = document.getElementById('modal-historico');
  if (modalHistoricoFundo) {
    modalHistoricoFundo.addEventListener('click', (e) => {
      if (e.target.id === 'modal-historico') fecharModalHistorico();
    });
  }

  // Filtros: buscar ao digitar e ao trocar o status
  const busca = document.getElementById('busca-obra');
  const filtro = document.getElementById('filtro-status');
  if (busca) busca.addEventListener('input', renderizarTabela);
  if (filtro) filtro.addEventListener('change', renderizarTabela);

  // Botões da tabela: histórico, avançar status, editar e excluir
  const corpo = document.getElementById('corpo-tabela-obras');
  if (corpo) {
    corpo.addEventListener('click', async (e) => {
      const idHistorico = e.target.dataset.historico;
      const idAvancar = e.target.dataset.avancar;
      const idEditar = e.target.dataset.editar;
      const idExcluir = e.target.dataset.excluir;

      if (idHistorico) {
        abrirModalHistorico(idHistorico);
        return;
      }

      if (idAvancar) {
        await carregarObras(true);
        abrirModalStatus(idAvancar);
        return;
      }

      if (idEditar) {
        const obras = await carregarObras();
        const obra = obras.find(function (o) { return String(o.id) === String(idEditar); });
        if (obra) abrirModal(obra);
      }

      if (idExcluir) {
        const obras = await carregarObras();
        const obra = obras.find(function (o) { return String(o.id) === String(idExcluir); });
        if (obra && confirm('Excluir a obra "' + obra.interessado + '"?')) {
          try {
            const r = await chamarApiObras('excluirObra', { id: String(idExcluir) });
            if (r.success) {
              obrasCache = null;
              renderizarTabela();
              atualizarKpis();
            } else {
              alert('Erro: ' + (r.erro || 'não foi possível excluir.'));
            }
          } catch (err) {
            alert('Erro de conexão com o servidor. Tente novamente.');
          }
        }
      }
    });
  }

  // Salvar (criar ou editar) — via API salvarObra
  const form = document.getElementById('form-obra');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const id = (document.getElementById('obra-id') || {}).value || '';
      const dados = {
        interessado: (document.getElementById('obra-interessado') || {}).value ? document.getElementById('obra-interessado').value.trim() : '',
        tipo_proposta: (document.getElementById('obra-tipo') || {}).value ? document.getElementById('obra-tipo').value.trim() : '',
        responsavel: (document.getElementById('obra-responsavel') || {}).value ? document.getElementById('obra-responsavel').value.trim() : '',
        telefone: (document.getElementById('obra-telefone') || {}).value ? document.getElementById('obra-telefone').value.trim() : '',
        endereco: (document.getElementById('obra-endereco') || {}).value ? document.getElementById('obra-endereco').value.trim() : '',
        data_solicitacao: (document.getElementById('obra-data-solicitacao') || {}).value ? document.getElementById('obra-data-solicitacao').value.trim() : '',
        status: (document.getElementById('obra-status') || {}).value || 'CADASTRADA'
      };

      // Edição: preserva campos que o modal não edita
      if (id) {
        const obras = await carregarObras();
        const obra = obras.find(function (o) { return String(o.id) === String(id); });
        if (obra) {
          dados.cod = obra.cod;
          dados.cadastro = obra.cadastro;
          dados.responsavel_dineng = obra.responsavel_dineng || '';
          dados.data_envio = obra.data_envio || '';
          dados.aparelho = obra.aparelho || '';
          dados.status_anterior = obra.status_anterior || '';
          dados.data_novo_status = obra.data_novo_status || '';
        }
      } else {
        dados.cadastro = (document.getElementById('obra-cadastro') || {}).value || hojeFormatado();
      }

      try {
        const r = await chamarApiObras('salvarObra', { id: id, ...dados });
        if (r.success) {
          obrasCache = null;
          await carregarObras(true);
          renderizarTabela();
          atualizarKpis();
          fecharModal();
        } else {
          alert('Erro ao salvar: ' + (r.erro || 'tente novamente.'));
        }
      } catch (err) {
        alert('Erro de conexão com o servidor. Tente novamente.');
      }
    });
  }
});
