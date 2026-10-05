// dashboard.js — painel principal (KPIs + gráficos) 100% via planilha / code.gs
// Fontes:
//   getObras       -> aba Geral        (status das obras)
//   getTarefas     -> aba Tarefas      (tarefas pendentes)
//   getCronograma  -> aba Cronograma   (% concluído de cada tarefa)

// ===== URL da API (definida no auth.js; fallback para não quebrar sem ele) =====
const URL_API_DASH = (typeof URL_API !== 'undefined' && URL_API)
  ? URL_API
  : 'https://script.google.com/macros/s/AKfycbx1juNc0tIefpx0e-_xb4Vya00FkuIP8FnVsCySfdTdGyckSMQn3Cwr5YYtyhAyIbR6/exec';

async function chamarApiDash(action, dados) {
  const fd = new FormData();
  fd.append('action', action);
  fd.append('dados', JSON.stringify(dados || {}));
  const resp = await fetch(URL_API_DASH, { method: 'POST', body: fd });
  return resp.json();
}

// ===== Dados em cache =====
let dadosObras = [];
let dadosTarefas = [];
let dadosCronograma = [];

async function carregarDados() {
  try {
    const alvo = document.getElementById('dashboard-status');
    if (alvo) alvo.textContent = 'Carregando dados...';

    const respostas = await Promise.all([
      chamarApiDash('getObras'),
      chamarApiDash('getTarefas'),
      chamarApiDash('getCronograma')
    ]);

    dadosObras     = respostas[0].success && Array.isArray(respostas[0].obras)    ? respostas[0].obras    : [];
    dadosTarefas   = respostas[1].success && Array.isArray(respostas[1].tarefas)  ? respostas[1].tarefas  : [];
    dadosCronograma = respostas[2].success && Array.isArray(respostas[2].tarefas) ? respostas[2].tarefas : [];

    if (alvo) alvo.textContent = '';
  } catch (e) {
    console.error('Erro ao carregar dados do dashboard:', e);
    const alvo = document.getElementById('dashboard-status');
    if (alvo) alvo.textContent = 'Não foi possível carregar os dados.';
  }
}

// ===== Cálculo dos KPIs =====
function calcularKpis() {
  // Obras Ativas: todas exceto canceladas e com contrato encerrado
  const statusTerminal = ['CANCELADO', 'CONTRATO ENCERRADO'];
  const obrasAtivas = dadosObras.filter(function (o) {
    const s = String(o.status || '').trim().toUpperCase();
    return s && statusTerminal.indexOf(s) === -1;
  }).length;

  // Tarefas Pendentes: tudo que não estiver concluído
  const tarefasPendentes = dadosTarefas.filter(function (t) {
    const s = String(t.status || '').trim().toUpperCase();
    return s !== 'CONCLUÍDO' && s !== 'CONCLUIDO' && s !== 'CONCLUIDA';
  }).length;

  // Progresso Médio: média do % concluído das tarefas do cronograma
  const progressos = dadosCronograma
    .map(function (c) { return Number(c.progress); })
    .filter(function (n) { return !isNaN(n) && n >= 0; });
  const progressoMedio = progressos.length
    ? Math.round(progressos.reduce(function (a, b) { return a + b; }, 0) / progressos.length)
    : 0;

  return { obrasAtivas: obrasAtivas, tarefasPendentes: tarefasPendentes, progressoMedio: progressoMedio };
}

// Atualiza um KPI: tenta por ID (vários candidatos) e, se não achar,
// procura o bloco que contém o rótulo (ex.: "Obras Ativas") e atualiza o valor.
function definirKpi(idCandidatos, rotulo, valor) {
  let alvo = null;

  for (let i = 0; i < idCandidatos.length; i++) {
    const el = document.getElementById(idCandidatos[i]);
    if (el) { alvo = el; break; }
  }

  if (!alvo) {
    const label = String(rotulo || '').trim().toLowerCase();
    const blocos = document.querySelectorAll('.kpi, .kpi-card, .card-kpi, .card, [class*="kpi"], [class*="card"]');
    for (let i = 0; i < blocos.length; i++) {
      const bloco = blocos[i];
      if (label && (bloco.textContent || '').toLowerCase().indexOf(label) === -1) continue;
      // Prioriza o filho que exibe o número (classe de valor ou texto '--')
      const filho = bloco.querySelector('.valor, .numero, .kpi-valor, .kpi-numero, [data-kpi], b, strong, span');
      if (filho && filho !== bloco && filho.parentNode === bloco) { alvo = filho; break; }
      if (bloco.textContent.indexOf('--') !== -1) { alvo = bloco; break; }
      alvo = bloco;
      break;
    }
  }

  if (!alvo) return;

  // Não sobrescreve o rótulo num card que contenha texto descritivo
  if (alvo.textContent && String(alvo.textContent).trim() && String(alvo.textContent).indexOf(rotulo || '') !== -1) {
    const num = String(valor);
    const texto = String(alvo.textContent).replace(/--|\d+/g, num);
    alvo.textContent = texto;
  } else {
    alvo.textContent = valor;
  }
}

function atualizarKpis() {
  const k = calcularKpis();
  definirKpi(['kpi-obras-ativas', 'kpi-obras', 'kpi-ativas', 'obras-ativas'], 'Obras Ativas', k.obrasAtivas);
  definirKpi(['kpi-tarefas-pendentes', 'kpi-tarefas', 'tarefas-pendentes'], 'Tarefas Pendentes', k.tarefasPendentes);
  definirKpi(['kpi-progresso-medio', 'kpi-progresso', 'progresso-medio'], 'Progresso Médio', k.progressoMedio + '%');
}

// ===== Gráfico: obras por status (canvas) =====
const CORES_STATUS = {
  'CANCELADO':             '#e74c3c',
  'CONTRATO EM ANDAMENTO': '#27ae60',
  'PROPOSTA ENVIADA':      '#2980b9',
  'ANALISE ENERGISA':      '#f39c12',
  'CONTRATO ENCERRADO':    '#2ecc71',
  'AGUARDANDO PAGAMENTO':  '#8e44ad',
  'ELABORAÇÃO DA PROPOSTA':'#16a085',
  'CADASTRADA':            '#7f8c8d'
};

function renderizarGraficoStatus() {
  const canvas = document.getElementById('grafico-status')
    || document.getElementById('grafico-obras-status')
    || document.querySelector('canvas[data-grafico="status"]');
  if (!canvas || !canvas.getContext) return;

  // Conta obras por status (ordena da maior para a menor)
  const contagem = {};
  dadosObras.forEach(function (o) {
    const s = String(o.status || 'SEM STATUS').trim();
    contagem[s] = (contagem[s] || 0) + 1;
  });
  const itens = Object.keys(contagem)
    .map(function (s) { return { status: s, total: contagem[s] }; })
    .sort(function (a, b) { return b.total - a.total; });

  if (!itens.length) return;

  const W = 640, H = 320;
  const padEsq = 190, padDir = 20, padTop = 24, padBase = 46;
  const largBarra = W - padEsq - padDir;
  const maxTotal = itens[0].total || 1;
  const altLinha = (H - padTop - padBase) / itens.length;

  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  itens.forEach(function (item, i) {
    const y = padTop + i * altLinha + (altLinha - 22) / 2;
    const cor = CORES_STATUS[String(item.status).toUpperCase()] || '#95a5a6';

    // Rótulo
    ctx.fillStyle = '#55677d';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.status, padEsq - 12, y + 11);

    // Barra
    const comprimento = Math.max(4, (item.total / maxTotal) * largBarra);
    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(padEsq, y, comprimento, 22, 6) : ctx.rect(padEsq, y, comprimento, 22);
    ctx.fill();

    // Valor
    ctx.fillStyle = '#33475b';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(String(item.total), padEsq + comprimento + 10, y + 11);
  });
}

// ===== Inicialização =====
document.addEventListener('DOMContentLoaded', async () => {
  await carregarDados();
  atualizarKpis();
  renderizarGraficoStatus();
});
