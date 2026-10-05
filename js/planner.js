// planner.js — Planner em modelo Kanban por STATUS (100% via planilha / code.gs)
// Colunas do quadro = status da tarefa (À Iniciar | Em Andamento | Concluído)
// Estrutura conforme a aba "Tarefas" da planilha:
// ID_Tarefa | ID_Projeto | Nome | Descrição | Prioridade | Data_Vencimento | Status |
// ID_Responsável | Esforço_Estimado | Previsão Inicio | Data_Inicio | Data_Conclusão |
// Data_criação | observação
// O NOME da tarefa é a coluna Descrição da planilha.
// Referências resolvidas por nome:
//   ID_Responsável -> aba Usuários (ID_Usuário -> Nome)
//   ID_Projeto     -> aba Geral (id -> Interessado), filtrada p/ CONTRATO EM ANDAMENTO
//   Etapa          -> label do modal renomeado para "Tipo"
// CRONOGRAMA: toda tarefa criada/alterada é sincronizada na aba Cronograma.
//   - Data de início: cadastrada no modal (campo "Data de início")
//   - Data de fim: calculada automaticamente = início + esforço estimado (dias)

// ===== URL da API (definida no auth.js; fallback para não quebrar sem ele) =====
const URL_API_PLANNER = (typeof URL_API !== 'undefined' && URL_API)
  ? URL_API
  : 'https://script.google.com/macros/s/AKfycbx1juNc0tIefpx0e-_xb4Vya00FkuIP8FnVsCySfdTdGyckSMQn3Cwr5YYtyhAyIbR6/exec';

async function chamarApiPlanner(action, dados) {
  const fd = new FormData();
  fd.append('action', action);
  fd.append('dados', JSON.stringify(dados || {}));
  const resp = await fetch(URL_API_PLANNER, { method: 'POST', body: fd });
  return resp.json();
}

// ===== Colunas do Kanban = status da tarefa =====
const STATUS_KANBAN = [
  { nome: 'À Iniciar',    icone: '⏳' },
  { nome: 'Em Andamento', icone: '🔄' },
  { nome: 'Concluído',    icone: '✅' }
];

// ===== Tipos (aba status_tarefas: id | nome) — base local com ícones =====
const ETAPAS_BASE = [
  { id: 1, nome: 'Levantamento de Campo',          icone: '📍' },
  { id: 2, nome: 'Elaboração de Projeto',          icone: '📐' },
  { id: 3, nome: 'Projeto em Analise',             icone: '🔍' },
  { id: 4, nome: 'Cotação/Aquisição de Materiais', icone: '🛒' },
  { id: 5, nome: 'Execução da Obra',               icone: '🏗️' },
  { id: 6, nome: 'Solicitação de Comissionamento', icone: '📤' },
  { id: 7, nome: 'Analise de Comissionamento',     icone: '✅' },
  { id: 8, nome: 'Elaboração de Proposta',         icone: '📝' }
];

let ETAPAS_ATIVAS = [...ETAPAS_BASE];

async function carregarEtapas() {
  try {
    const r = await chamarApiPlanner('getStatusTarefas');
    if (r.success && Array.isArray(r.status) && r.status.length) {
      ETAPAS_ATIVAS = r.status.map(function (s) {
        const base = ETAPAS_BASE.find(function (b) { return String(b.id) === String(s.id); });
        return { id: s.id, nome: s.nome || '', icone: base ? base.icone : '•' };
      });
    }
  } catch (e) { /* mantém ETAPAS_BASE como fallback */ }
}

function etapaPorId(id) {
  return ETAPAS_ATIVAS.find(function (s) { return String(s.id) === String(id); }) || null;
}

// =========================================================
// RESPONSÁVEIS — referência da aba Usuários (ID_Usuário -> Nome)
// =========================================================
let RESPONSAVEIS = [];

async function carregarResponsaveis() {
  try {
    const r = await chamarApiPlanner('getUsuarios');
    if (r.success && Array.isArray(r.usuarios)) {
      RESPONSAVEIS = r.usuarios.map(function (u) {
        return { id: String(u.id), nome: u.nome || '', email: u.email || '' };
      });
    }
  } catch (e) { RESPONSAVEIS = []; }
}

function respPorId(id) {
  if (RESPONSAVEIS.length) {
    const r = RESPONSAVEIS.find(function (x) { return String(x.id) === String(id); });
    if (r) return r.nome;
  }
  return '';
}

function nomeResp(responsavelId) {
  return respPorId(responsavelId) || responsavelId || '';
}

// ===== Obras (da aba Geral) =====
async function carregarObrasAndamento() {
  try {
    const r = await chamarApiPlanner('getObras');
    if (r.success && Array.isArray(r.obras)) {
      window.OBRAS_TODAS = r.obras.map(function (o) {
        return {
          id: String(o.id),
          cod: String(o.cod || o.id),
          nome: o.interessado || '',
          status: String(o.status || '').trim().toUpperCase()
        };
      });
      window.OBRAS_ANDAMENTO = window.OBRAS_TODAS.filter(function (o) {
        return o.status === 'CONTRATO EM ANDAMENTO';
      }).map(function (o) {
        return { id: o.id, cod: o.cod, nome: o.nome };
      });
    }
  } catch (e) {
    window.OBRAS_TODAS = window.OBRAS_TODAS || [];
    window.OBRAS_ANDAMENTO = window.OBRAS_ANDAMENTO || [];
  }
}

window.OBRAS_ANDAMENTO = window.OBRAS_ANDAMENTO || [];
window.OBRAS_TODAS = window.OBRAS_TODAS || [];

function obraPorId(id) {
  return (window.OBRAS_ANDAMENTO || []).find(function (o) { return String(o.id) === String(id); }) || null;
}

function obraPorIdCompleto(id) {
  const o = (window.OBRAS_TODAS || []).find(function (x) { return String(x.id) === String(id); });
  if (o) return o;
  return obraPorId(id);
}

function nomeObraPorId(id) {
  const o = obraPorIdCompleto(id);
  return o ? o.nome : (id || '');
}

// ===== Tarefas (aba Tarefas) =====
let tarefasCache = null;
const historicoLocal = {};

function normStatus(s) {
  const v = String(s || '').trim();
  if (!v || v.toUpperCase() === 'A FAZER') return 'À Iniciar';
  if (v.toUpperCase() === 'EM ANDAMENTO') return 'Em Andamento';
  if (v.toUpperCase() === 'CONCLUÍDO' || v.toUpperCase() === 'CONCLUIDO') return 'Concluído';
  return v;
}

function normalizarTarefa(t) {
  const id = String(t.id || '');
  const descricao = t.descricao || '';
  const nomeColuna = t.nome || '';
  return {
    id: id,
    projeto: String(t.id_projeto || t.projeto || ''),
    etapa: Number(t.etapa || 1),
    // BUSCA: o nome da tarefa vem da coluna Descrição (fallback: Nome)
    nome: descricao || nomeColuna,
    nome_coluna: nomeColuna,
    descricao: descricao,
    prioridade: t.prioridade || 'Média',
    vencimento: t.data_vencimento || t.vencimento || '',
    status: normStatus(t.status),
    responsavel: String(t.id_responsavel || t.responsavel || ''),
    esforco: t.esforco || '',
    observacao: t.observacao || '',
    previsao: t.previsao_inicio || '',
    inicio: t.data_inicio || '',
    conclusao: t.data_conclusao || '',
    criacao: t.data_criacao || '',
    get historico() { return historicoLocal[id] || []; },
    set historico(v) { historicoLocal[id] = v; }
  };
}

async function carregarTarefas(refresh) {
  if (tarefasCache && !refresh) return tarefasCache;
  try {
    const r = await chamarApiPlanner('getTarefas');
    if (r.success && Array.isArray(r.tarefas)) {
      tarefasCache = r.tarefas.map(normalizarTarefa);
      return tarefasCache;
    }
    console.error('getTarefas falhou:', r.erro);
    return tarefasCache || [];
  } catch (e) {
    console.error('Erro de conexão ao carregar tarefas:', e);
    return tarefasCache || [];
  }
}

// GRAVAÇÃO: o nome digitado no modal vai para a coluna Descrição
async function salvarTarefaBackend(t) {
  const dados = {
    id: t.id || '',
    id_projeto: t.projeto,
    nome: t.nome_coluna || '',
    descricao: t.nome || t.descricao || '',
    prioridade: t.prioridade,
    data_vencimento: t.vencimento,
    status: t.status,
    id_responsavel: t.responsavel,
    esforco: t.esforco,
    observacao: t.observacao,
    previsao_inicio: t.previsao,
    data_inicio: t.inicio,
    data_conclusao: t.conclusao,
    data_criacao: t.criacao
  };
  const r = await chamarApiPlanner('salvarTarefa', dados);
  if (!r.success) throw new Error(r.erro || 'Não foi possível salvar a tarefa.');
  return r;
}

// ===== Utilitários de data =====
function hojeISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

// yyyy-mm-dd (input date) -> dd/mm/aaaa (planilha)
function dataInputParaBR(valor) {
  const iso = formatarDataInput(valor);
  if (!iso) return '';
  const p = iso.split('-');
  return `${p[2]}/${p[1]}/${p[0]}`;
}

function formatarDataInput(valor) {
  if (!valor) return '';
  const s = String(valor).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    const p = s.split('/');
    return `${p[2]}-${p[1]}-${p[0]}`;
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatarDataBR(valor) {
  if (!valor) return '';
  const s = String(valor).trim();
  if (!s) return '';
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Calcula a data de fim = início + quantidade de dias (esforço estimado)
function calcularFimISO(inicioISO, dias) {
  if (!inicioISO) return '';
  const d = new Date(inicioISO + 'T12:00:00');
  if (isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + (Number(dias) || 0));
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// =========================================================
// SINCRONIZAÇÃO COM O CRONOGRAMA (aba Cronograma)
// Toda tarefa criada/alterada é refletida no cronograma.
//   - Data de início: a cadastrada no modal (ou hoje se em andamento)
//   - Data de fim: calculada = início + esforço estimado (dias)
// A % de evolução lançada manualmente no cronograma é preservada.
// =========================================================
async function sincronizarCronograma(dados) {
  try {
    const r = await chamarApiPlanner('salvarCronograma', dados);
    if (!r || !r.success) {
      console.warn('salvarCronograma retornou erro:', r && r.erro);
    }
  } catch (e) {
    console.error('Falha ao sincronizar cronograma:', e);
  }
}

function dadosCronogramaDaTarefa(t, idTarefa) {
  const inicioBR = t.previsao || t.inicio || '';
  const inicioISO = formatarDataInput(inicioBR);
  const esforcoDias = Number(t.esforco) || 0;
  const fimISO = calcularFimISO(inicioISO, esforcoDias);
  return {
    id_tarefa: String(idTarefa),
    id_obra: t.projeto || '',
    obra: nomeObraPorId(t.projeto),
    tarefa: t.nome || '',
    inicio: inicioISO,
    fim: fimISO,
    esforco_dias: esforcoDias,
    responsavel: nomeResp(t.responsavel)
  };
}

// ===== Estado =====
let obraSelecionada = null;

async function renderListaObras() {
  const tarefas = await carregarTarefas();
  const container = document.getElementById('lista-obras');
  if (!container) return;

  const contar = function (id) { return tarefas.filter(function (t) { return String(t.projeto) === String(id); }).length; };

  const itens = [
    '<button class="obra-item ' + (obraSelecionada === null ? 'ativo' : '') + '" data-obra="">' +
      '<span class="obra-nome">📋 Todas as obras</span>' +
      '<span class="obra-contagem">' + tarefas.length + '</span>' +
    '</button>'
  ];

  (window.OBRAS_ANDAMENTO || []).forEach(function (o) {
    const qtd = contar(o.id);
    if (!qtd) return;
    itens.push(
      '<button class="obra-item ' + (String(obraSelecionada) === String(o.id) ? 'ativo' : '') + '" data-obra="' + o.id + '">' +
        '<span class="obra-nome"><strong>Cod ' + o.cod + '</strong> · ' + o.nome + '</span>' +
        '<span class="obra-contagem">' + qtd + '</span>' +
      '</button>'
    );
  });

  container.innerHTML = itens.join('');
}

// ===== Kanban por STATUS =====
function classeStatusTarefa(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'concluído' || s === 'concluido') return 'st-concluido';
  if (s === 'em andamento') return 'st-andamento';
  return 'st-iniciar';
}

async function renderKanban() {
  const tarefas = await carregarTarefas();
  const kanban = document.getElementById('kanban');
  if (!kanban) return;

  const rotulo = document.getElementById('kanban-obra-nome');
  if (rotulo) {
    const obra = obraSelecionada ? obraPorIdCompleto(obraSelecionada) : null;
    rotulo.textContent = obra ? '🏗️ ' + obra.nome : 'Todas as obras em andamento';
  }

  const visiveis = obraSelecionada
    ? tarefas.filter(function (t) { return String(t.projeto) === String(obraSelecionada); })
    : tarefas;

  kanban.innerHTML = STATUS_KANBAN.map(function (coluna) {
    const cartoes = visiveis.filter(function (t) { return t.status === coluna.nome; });

    const cartoesHtml = cartoes.map(function (t) {
      const obra = obraPorIdCompleto(t.projeto);
      const etapa = etapaPorId(t.etapa);
      const respNome = respPorId(t.responsavel) || t.responsavel || '--';
      const venc = formatarDataBR(t.vencimento) || '--';
      return (
        '<div class="kanban-cartao prio-' + String(t.prioridade || '').toLowerCase() + '" draggable="true" data-id="' + t.id + '">' +
          '<div class="cartao-nome" title="' + t.nome + '">' + t.nome + '</div>' +
          '<div class="cartao-chips">' +
            (etapa ? '<span class="chip chip-etapa" title="Tipo">' + etapa.icone + ' ' + etapa.nome + '</span>' : '') +
            '<span class="chip chip-prio">' + (t.prioridade || '--') + '</span>' +
          '</div>' +
          '<div class="cartao-rodape">' +
            (obraSelecionada === null && obra ? '<span title="Código ' + obra.cod + '">🏗️ ' + obra.nome + '</span>' : '') +
            '<span title="Vencimento">📅 ' + venc + '</span>' +
            '<span title="Responsável">👤 ' + respNome + '</span>' +
          '</div>' +
          '<div class="cartao-acoes">' +
            (t.historico.length ? '<button class="btn-acao" data-historico="' + t.id + '" title="Histórico (' + t.historico.length + ')">📜</button>' : '') +
            '<button class="btn-acao" data-editar="' + t.id + '" title="Editar">✏️</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    return (
      '<div class="kanban-coluna" data-status="' + coluna.nome + '">' +
        '<div class="kanban-coluna-cabecalho">' +
          '<span class="coluna-icone">' + coluna.icone + '</span>' +
          '<span class="coluna-nome">' + coluna.nome + '</span>' +
          '<span class="coluna-contagem">' + cartoes.length + '</span>' +
        '</div>' +
        '<div class="kanban-coluna-corpo">' + cartoesHtml + '</div>' +
      '</div>'
    );
  }).join('');

  kanban.querySelectorAll('.kanban-cartao').forEach(function (cartao) {
    cartao.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', cartao.dataset.id);
      cartao.classList.add('arrastando');
    });
    cartao.addEventListener('dragend', function () {
      cartao.classList.remove('arrastando');
    });
  });

  kanban.querySelectorAll('.kanban-coluna').forEach(function (coluna) {
    coluna.addEventListener('dragover', function (e) {
      e.preventDefault();
      coluna.classList.add('sobre');
    });
    coluna.addEventListener('dragleave', function () {
      coluna.classList.remove('sobre');
    });
    coluna.addEventListener('drop', function (e) {
      e.preventDefault();
      coluna.classList.remove('sobre');
      const id = e.dataTransfer.getData('text/plain');
      if (id) moverTarefa(id, coluna.dataset.status);
    });
  });
}

async function moverTarefa(id, novoStatus) {
  const tarefas = await carregarTarefas();
  const tarefa = tarefas.find(function (t) { return String(t.id) === String(id); });
  if (!tarefa || tarefa.status === novoStatus) return;

  const data = agoraFormatado();

  historicoLocal[tarefa.id] = historicoLocal[tarefa.id] || [];
  historicoLocal[tarefa.id].push({ de: tarefa.status, para: novoStatus, data: data, usuario: usuarioLogado() });

  if (novoStatus === 'Em Andamento' && !tarefa.inicio && !tarefa.previsao) tarefa.inicio = data;
  if (novoStatus === 'Concluído') tarefa.conclusao = data;
  if (novoStatus === 'À Iniciar') tarefa.conclusao = '';
  tarefa.status = novoStatus;

  try {
    await salvarTarefaBackend(tarefa);
  } catch (e) {
    alert('Erro ao mover a tarefa: ' + e.message);
    return;
  }

  // Atualiza a linha do cronograma com início e fim calculado (preserva a %)
  await sincronizarCronograma(dadosCronogramaDaTarefa(tarefa, tarefa.id));

  renderKanban();
  renderListaObras();
}

// ===== Modal: Histórico da tarefa =====
async function abrirModalHistorico(id) {
  const tarefas = await carregarTarefas();
  const tarefa = tarefas.find(function (t) { return String(t.id) === String(id); });
  const modal = document.getElementById('modal-historico');
  if (!tarefa || !modal) return;

  const elNome = document.getElementById('historico-tarefa-nome');
  if (elNome) elNome.textContent = tarefa.nome;

  const lista = document.getElementById('historico-lista');
  if (!lista) return;

  if (!tarefa.historico.length) {
    lista.innerHTML = '<p class="historico-vazio">Nenhuma mudança de status registrada ainda.</p>';
  } else {
    lista.innerHTML = tarefa.historico.slice().reverse().map(function (h) {
      return (
        '<div class="historico-item">' +
          '<div class="historico-marcador ' + classeStatusTarefa(h.para) + '"></div>' +
          '<div class="historico-conteudo">' +
            '<div class="historico-transicao">' +
              '<span class="chip chip-status ' + classeStatusTarefa(h.de) + '">' + h.de + '</span>' +
              '<span class="historico-seta">→</span>' +
              '<span class="chip chip-status ' + classeStatusTarefa(h.para) + '">' + h.para + '</span>' +
            '</div>' +
            '<div class="historico-data">🕒 ' + (h.data || 'sem data registrada') + ' · 👤 ' + (h.usuario || 'Registro da planilha') + '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  modal.classList.add('aberto');
}

function fecharModalHistorico() {
  const modal = document.getElementById('modal-historico');
  if (modal) modal.classList.remove('aberto');
}

// ===== Responsável: converte o campo em select mostrando o NOME =====
function prepararSelectResponsavel() {
  const campo = document.getElementById('tarefa-responsavel');
  if (!campo || campo.tagName === 'SELECT') return;

  const select = document.createElement('select');
  select.id = campo.id;
  select.name = campo.name;
  select.className = campo.className;
  select.style.cssText = campo.style.cssText;

  const opVazia = document.createElement('option');
  opVazia.value = '';
  opVazia.textContent = 'Selecione o responsável...';
  select.appendChild(opVazia);

  RESPONSAVEIS.forEach(function (r) {
    const opt = document.createElement('option');
    opt.value = r.id;
    opt.textContent = r.nome;
    select.appendChild(opt);
  });

  const valorAtual = campo.value || '';
  if (valorAtual && !RESPONSAVEIS.some(function (r) { return String(r.id) === String(valorAtual); })) {
    const opt = document.createElement('option');
    opt.value = valorAtual;
    opt.textContent = valorAtual;
    select.appendChild(opt);
  }

  campo.parentNode.replaceChild(select, campo);
  select.value = valorAtual;
}

function garantirOpcaoSelect(select, valor, texto) {
  if (!select || !valor) return;
  const existe = Array.from(select.options || []).some(function (o) { return String(o.value) === String(valor); });
  if (existe) return;
  const opt = document.createElement('option');
  opt.value = valor;
  opt.textContent = texto || valor;
  select.appendChild(opt);
}

// ===== Campo "Data de início" injetado no modal (antes do esforço) =====
function prepararCampoDataInicio() {
  if (document.getElementById('tarefa-inicio')) return;
  const ref = document.getElementById('tarefa-esforco');
  if (!ref) return;
  const bloco = document.createElement('div');
  bloco.style.cssText = 'margin-bottom:14px;';
  bloco.innerHTML =
    '<label for="tarefa-inicio" style="display:block;margin-bottom:6px;color:#33475b;font-size:14px;font-weight:600;">Data de início</label>' +
    '<input type="date" id="tarefa-inicio" style="display:block;width:100%;padding:12px 14px;border:1px solid #ccd6e0;border-radius:10px;background:#f7f9fc;font-size:15px;outline:none;box-sizing:border-box;">';
  const pai = ref.closest('div') || ref.parentNode;
  pai.parentNode.insertBefore(bloco, pai);
}

// ===== Modal: abrir / fechar =====
function abrirModal(tarefa) {
  const modal = document.getElementById('modal-tarefa');
  if (!modal) return;

  renomearLabelEtapa();
  prepararSelectResponsavel();
  prepararCampoDataInicio();

  const selectObra = document.getElementById('tarefa-obra');
  if (selectObra && !selectObra.options.length) {
    selectObra.innerHTML = (window.OBRAS_ANDAMENTO || []).map(function (o) {
      return '<option value="' + o.id + '">' + o.nome + ' · Cod ' + o.cod + '</option>';
    }).join('');
  }

  const selectEtapa = document.getElementById('tarefa-etapa');
  if (selectEtapa && !selectEtapa.options.length) {
    selectEtapa.innerHTML = ETAPAS_ATIVAS.map(function (s) {
      return '<option value="' + s.id + '">' + (s.icone ? s.icone + ' ' : '') + s.nome + '</option>';
    }).join('');
  }

  const titulo = document.getElementById('modal-titulo');
  const ui = (id) => document.getElementById(id);

  if (tarefa) {
    titulo.textContent = 'Editar Tarefa';
    if (ui('tarefa-id')) ui('tarefa-id').value = tarefa.id;
    if (ui('tarefa-nome')) ui('tarefa-nome').value = tarefa.nome;

    if (selectObra) {
      selectObra.value = tarefa.projeto;
      const ob = obraPorIdCompleto(tarefa.projeto);
      garantirOpcaoSelect(selectObra, tarefa.projeto, ob ? ob.nome + ' · Cod ' + ob.cod : tarefa.projeto);
      selectObra.value = tarefa.projeto;
    }

    if (ui('tarefa-etapa')) ui('tarefa-etapa').value = tarefa.etapa;
    if (ui('tarefa-status')) ui('tarefa-status').value = tarefa.status;
    if (ui('tarefa-prioridade')) ui('tarefa-prioridade').value = tarefa.prioridade;
    if (ui('tarefa-vencimento')) ui('tarefa-vencimento').value = formatarDataInput(tarefa.vencimento);
    if (ui('tarefa-inicio')) ui('tarefa-inicio').value = formatarDataInput(tarefa.previsao || tarefa.inicio);

    const selResp = ui('tarefa-responsavel');
    if (selResp) {
      const nomeRespAtual = respPorId(tarefa.responsavel);
      garantirOpcaoSelect(selResp, tarefa.responsavel, nomeRespAtual || tarefa.responsavel);
      selResp.value = tarefa.responsavel;
    }

    if (ui('tarefa-esforco')) ui('tarefa-esforco').value = tarefa.esforco;
    if (ui('tarefa-observacao')) ui('tarefa-observacao').value = tarefa.observacao;
  } else {
    titulo.textContent = 'Nova Tarefa';
    const form = document.getElementById('form-tarefa');
    if (form) form.reset();
    if (ui('tarefa-id')) ui('tarefa-id').value = '';
    if (document.getElementById('tarefa-inicio')) document.getElementById('tarefa-inicio').value = '';
    if (obraSelecionada && ui('tarefa-obra')) ui('tarefa-obra').value = obraSelecionada;
  }

  modal.classList.add('aberto');
}

function fecharModal() {
  const modal = document.getElementById('modal-tarefa');
  if (modal) modal.classList.remove('aberto');
}

// ===== Renomeia o rótulo "Etapa (status_tarefas)" para "Tipo" =====
function renomearLabelEtapa() {
  const label = document.querySelector('label[for="tarefa-etapa"]');
  if (label) { label.textContent = 'Tipo'; return; }
  document.querySelectorAll('label').forEach(function (l) {
    const texto = (l.textContent || '');
    if (texto.indexOf('Etapa') !== -1 && texto.indexOf('status_tarefas') !== -1) {
      l.textContent = 'Tipo';
    }
  });
}

// ===== Eventos =====
document.addEventListener('DOMContentLoaded', () => {
  renomearLabelEtapa();

  const btnNova = document.getElementById('btn-nova-tarefa');
  if (btnNova) btnNova.addEventListener('click', () => abrirModal(null));

  const btnFechar = document.getElementById('btn-fechar-modal');
  if (btnFechar) btnFechar.addEventListener('click', fecharModal);

  const btnCancelar = document.getElementById('btn-cancelar');
  if (btnCancelar) btnCancelar.addEventListener('click', fecharModal);

  const modalFundo = document.getElementById('modal-tarefa');
  if (modalFundo) {
    modalFundo.addEventListener('click', (e) => {
      if (e.target.id === 'modal-tarefa') fecharModal();
    });
  }

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

  const lista = document.getElementById('lista-obras');
  if (lista) {
    lista.addEventListener('click', (e) => {
      const item = e.target.closest('.obra-item');
      if (!item) return;
      obraSelecionada = item.dataset.obra || null;
      renderListaObras();
      renderKanban();
    });
  }

  const kanban = document.getElementById('kanban');
  if (kanban) {
    kanban.addEventListener('click', async (e) => {
      const idHistorico = e.target.dataset.historico;
      const idEditar = e.target.dataset.editar;

      if (idHistorico) {
        abrirModalHistorico(idHistorico);
        return;
      }

      if (idEditar) {
        const tarefas = await carregarTarefas();
        const tarefa = tarefas.find((t) => String(t.id) === String(idEditar));
        if (tarefa) abrirModal(tarefa);
      }
    });
  }

  const form = document.getElementById('form-tarefa');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const id = (document.getElementById('tarefa-id') || {}).value || '';
      const dadosForm = {
        projeto: (document.getElementById('tarefa-obra') || {}).value || '',
        etapa: Number((document.getElementById('tarefa-etapa') || {}).value) || 1,
        status: (document.getElementById('tarefa-status') || {}).value || 'À Iniciar',
        prioridade: (document.getElementById('tarefa-prioridade') || {}).value || 'Média',
        nome: (document.getElementById('tarefa-nome') || {}).value ? document.getElementById('tarefa-nome').value.trim() : '',
        vencimento: (document.getElementById('tarefa-vencimento') || {}).value || '',
        inicio: (document.getElementById('tarefa-inicio') || {}).value || '',
        responsavel: (document.getElementById('tarefa-responsavel') || {}).value || '',
        esforco: (document.getElementById('tarefa-esforco') || {}).value || '',
        observacao: (document.getElementById('tarefa-observacao') || {}).value ? document.getElementById('tarefa-observacao').value.trim() : ''
      };

      const emAndamento = dadosForm.status === 'Em Andamento' || dadosForm.status === 'Concluído';
      const prevBR = dataInputParaBR(dadosForm.inicio);

      try {
        if (id) {
          const tarefas = await carregarTarefas();
          const indice = tarefas.findIndex((t) => String(t.id) === String(id));
          if (indice === -1) {
            alert('Tarefa não encontrada.');
            return;
          }
          const tarefa = tarefas[indice];

          if (dadosForm.status !== tarefa.status) {
            const data = agoraFormatado();
            historicoLocal[tarefa.id] = historicoLocal[tarefa.id] || [];
            historicoLocal[tarefa.id].push({ de: tarefa.status, para: dadosForm.status, data: data, usuario: usuarioLogado() });
            if (dadosForm.status === 'Em Andamento' && !tarefa.inicio && !prevBR) tarefa.inicio = data;
            if (dadosForm.status === 'Concluído') tarefa.conclusao = data;
          }

          // Data de início cadastrada no modal -> Previsão Inicio (e Data_Inicio se em andamento)
          const atualizada = {
            ...tarefa,
            projeto: dadosForm.projeto,
            etapa: dadosForm.etapa,
            status: dadosForm.status,
            prioridade: dadosForm.prioridade,
            nome: dadosForm.nome || tarefa.descricao,
            nome_coluna: tarefa.nome_coluna || '',
            descricao: dadosForm.nome || tarefa.descricao,
            vencimento: dataInputParaBR(dadosForm.vencimento),
            responsavel: dadosForm.responsavel,
            esforco: dadosForm.esforco,
            observacao: dadosForm.observacao,
            previsao: prevBR || tarefa.previsao,
            inicio: emAndamento ? (prevBR || tarefa.inicio || agoraFormatado()) : (tarefa.inicio || '')
          };
          await salvarTarefaBackend(atualizada);

          // Sincroniza cronograma com início cadastrado e fim calculado (preserva a %)
          await sincronizarCronograma(dadosCronogramaDaTarefa(atualizada, id));
        } else {
          // Nova tarefa: data de início cadastrada + fim calculado no cronograma
          const inicioBR = emAndamento ? (prevBR || agoraFormatado()) : (prevBR || '');
          const r = await chamarApiPlanner('salvarTarefa', {
            id: '',
            id_projeto: dadosForm.projeto,
            nome: '',
            descricao: dadosForm.nome,
            prioridade: dadosForm.prioridade,
            data_vencimento: dataInputParaBR(dadosForm.vencimento),
            status: dadosForm.status,
            id_responsavel: dadosForm.responsavel,
            esforco: dadosForm.esforco,
            observacao: dadosForm.observacao,
            previsao_inicio: prevBR,
            data_inicio: inicioBR,
            data_conclusao: dadosForm.status === 'Concluído' ? agoraFormatado() : '',
            data_criacao: hojeFormatado()
          });
          if (!r.success) throw new Error(r.erro || 'Não foi possível salvar.');

          const idNova = r && r.id ? String(r.id) : '';
          const inicioISO = formatarDataInput(prevBR || inicioBR);
          const esforcoDias = Number(dadosForm.esforco) || 0;

          // Inclui no cronograma: início cadastrado + fim calculado (início + dias)
          await sincronizarCronograma({
            id_tarefa: idNova,
            id_obra: dadosForm.projeto,
            obra: nomeObraPorId(dadosForm.projeto),
            tarefa: dadosForm.nome || '',
            inicio: inicioISO,
            fim: calcularFimISO(inicioISO, esforcoDias),
            esforco_dias: esforcoDias,
            responsavel: nomeResp(dadosForm.responsavel),
            percentual: dadosForm.status === 'Concluído' ? 100 : 0
          });
        }

        tarefasCache = null;
        await carregarTarefas(true);
        renderKanban();
        renderListaObras();
        fecharModal();
      } catch (err) {
        alert('Erro ao salvar: ' + err.message);
      }
    });
  }

  carregarEtapas()
    .then(carregarResponsaveis)
    .then(carregarObrasAndamento)
    .then(function () { return carregarTarefas(true); })
    .then(function () {
      prepararSelectResponsavel();
      prepararCampoDataInicio();
      renderListaObras();
      renderKanban();
    });
});
