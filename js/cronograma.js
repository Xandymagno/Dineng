/* =========================================================
   Cronograma — visão estilo MS Project
   Tarefas à esquerda, linha do tempo ao lado direito.
   Visão: Dia / Mês / Ano + Semana atual (cards e modal independentes).
   Fonte de dados: API (Web App / Apps Script) — aba Cronograma.
   Mesma lógica de busca do planner.js.
========================================================= */

// ===== URL da API (definida no auth.js; fallback para não quebrar sem ele) =====
const URL_API_CRONOGRAMA = (typeof URL_API !== 'undefined' && URL_API)
  ? URL_API
  : 'https://script.google.com/macros/s/AKfycbx1juNc0tIefpx0e-_xb4Vya00FkuIP8FnVsCySfdTdGyckSMQn3Cwr5YYtyhAyIbR6/exec';

// Chamada única: action + dados via POST form-data (mesmo padrão do planner.js)
async function chamarApiCronograma(action, dados) {
  const fd = new FormData();
  fd.append('action', action);
  fd.append('dados', JSON.stringify(dados || {}));
  const resp = await fetch(URL_API_CRONOGRAMA, { method: 'POST', body: fd });
  return resp.json();
}

// ===== Estado =====
let dadosCronograma = [];
let filtroSemanaAtiva = false;   // filtro de semana dos cards
let filtroSemanaModal = false;   // filtro de semana do modal
let modoModal = 'Month';         // visão do modal (independente dos cards)

// Carrega tudo ao abrir a página (sem botão "atualizar dados")
document.addEventListener('DOMContentLoaded', carregarCronograma);

/** Carrega o cronograma real da aba Cronograma via Web App (padrão planner.js) */
async function carregarCronograma() {
  const container = document.getElementById('lista-obras');
  if (container) {
    container.innerHTML = '<p class="status-mensagem">Carregando cronograma…</p>';
  }

  try {
    const r = await chamarApiCronograma('getCronograma');
    if (r.success && Array.isArray(r.tarefas)) {
      dadosCronograma = r.tarefas;
    } else {
      throw new Error(r.erro || 'Não foi possível carregar o cronograma.');
    }
    popularFiltroObras();
    aplicarFiltro('');
  } catch (erro) {
    dadosCronograma = [];
    if (container) {
      container.innerHTML = '<p class="status-mensagem erro-api">' +
        escaparHTML(erro.message || String(erro)) + '</p>';
    }
    console.error('Erro ao carregar cronograma:', erro);
  }
}

/** Preenche o select de obras com os nomes únicos */
function popularFiltroObras() {
  const select = document.getElementById('filtro-obra');
  if (!select) return;

  const ids = [];
  dadosCronograma.forEach(function (t) {
    if (t.id_obra && ids.indexOf(t.id_obra) === -1) ids.push(t.id_obra);
  });
  ids.sort(function (a, b) { return String(a).localeCompare(String(b)); });

  select.innerHTML = '<option value="">Todas as obras</option>';
  ids.forEach(function (id) {
    const op = document.createElement('option');
    op.value = id;
    const t = dadosCronograma.find(function (x) { return x.id_obra === id; });
    op.textContent = (t && t.obra) ? t.obra : id;
    select.appendChild(op);
  });

  select.addEventListener('change', function (e) {
    aplicarFiltro(e.target.value);
  });
}

// ===== Filtro: semana atual =====
function semanaAtual() {
  const hoje = new Date();
  const dia = (hoje.getDay() + 6) % 7; // segunda-feira = 0
  const ini = new Date(hoje);
  ini.setDate(hoje.getDate() - dia);
  ini.setHours(0, 0, 0, 0);
  const fim = new Date(ini);
  fim.setDate(ini.getDate() + 6);
  return { ini: ini, fim: fim };
}

function tarefaNaSemana(t) {
  const s = parseISO(t.start);
  const e = parseISO(t.end);
  if (!s || !e) return false;
  const sem = semanaAtual();
  return s <= sem.fim && e >= sem.ini; // intersecta a semana atual
}
/** Filtra por obra e/ou semana atual e re-renderiza os cards */
function aplicarFiltro(idObra) {
  let tarefas = idObra
    ? dadosCronograma.filter(function (t) { return t.id_obra === idObra; })
    : dadosCronograma;

  if (filtroSemanaAtiva) {
    tarefas = tarefas.filter(tarefaNaSemana);
  }

  renderizarObras(tarefas);
}
/** Agrupa por obra e monta os cards com a visão MS Project */
function renderizarObras(tarefas) {
  const container = document.getElementById('lista-obras');
  container.innerHTML = '';

  if (!tarefas.length) {
    container.innerHTML = '<p class="status-mensagem">Nenhuma tarefa neste filtro.</p>';
    return;
  }

  const grupos = {};
  tarefas.forEach(function (t) {
    if (!grupos[t.id_obra]) grupos[t.id_obra] = [];
    grupos[t.id_obra].push(t);
  });

  Object.keys(grupos).forEach(function (idObra) {
    grupos[idObra].sort(function (a, b) { return a.start.localeCompare(b.start); });
    container.appendChild(montarCard(idObra, grupos[idObra]));
  });
}
/** Monta um card de obra: tarefas à esquerda, linha do tempo à direita */
function montarCard(idObra, lista) {
  const limites = limitesPeriodo(lista);
  if (!limites) return document.createElement('div');

  let soma = 0;
  lista.forEach(function (t) { soma += t.progress; });
  const media = Math.round(soma / lista.length);
  const card = document.createElement('div');
  card.className = 'card-obra';

  let linhasEsq = '';
  let linhasDir = '';

  lista.forEach(function (t, i) {
    const sit = situacaoTarefa(t);

    linhasEsq +=
      '<div class="gantt-linha" data-id="' + t.id + '">' +
        '<span class="seq-numero sit-' + sit + '">' + (i + 1) + '</span>' +
        '<div class="tarefa-info">' +
          '<div class="nome-tarefa" title="' + escaparHTML(t.name) + '">' + escaparHTML(t.name) + '</div>' +
          '<div class="periodo-tarefa">' + formatarBR(t.start) + ' → ' + formatarBR(t.end) + ' · ' + escaparHTML(t.responsavel || 'sem responsável') + '</div>' +
        '</div>' +
        '<div class="campo-percento">' +
          '<input type="number" min="0" max="100" step="5" value="' + t.progress + '" data-id="' + t.id + '" title="Percentual concluído">' +
        '</div>' +
      '</div>';

    const pos = posicaoBarra(limites, t);
    linhasDir +=
      '<div class="gantt-linha-barra">' +
        '<div class="barra-tarefa sit-' + sit + '" style="left:' + pos.ini + '%;width:' + pos.larg + '%">' +
          '<span class="barra-progresso" style="width:' + t.progress + '%"></span>' +
          '<span class="barra-rotulo">' + t.progress + '%</span>' +
        '</div>' +
      '</div>';
  });

  let detalhe = '';
  lista.forEach(function (t) {
    detalhe += '• ' + t.id + ' — ' + escaparHTML(t.name) + ' (' + formatarBR(t.start) + ' a ' + formatarBR(t.end) + ', ' + t.progress + '%, ' + rotuloSituacao(situacaoTarefa(t)) + ', ' + escaparHTML(t.responsavel || 'sem responsável') + ')<br>';
  });

  card.innerHTML =
    '<div class="cabecalho-obra">' +
      '<h3>' + escaparHTML(lista[0].obra || ('Obra ' + idObra)) + '</h3>' +
      '<span class="badge-obra" id="badge-' + idObra + '">' + media + '% · ' + lista.length + ' tarefa(s)</span>' +
    '</div>' +
    '<div class="gantt-msproject">' +
      '<div class="gantt-tarefas">' +
        '<div class="gantt-espaco"><span class="gantt-titulo-coluna">Tarefas / % concluído</span></div>' +
        linhasEsq +
      '</div>' +
      '<div class="gantt-barras">' +
        '<div class="gantt-conteudo' + (modoAtual() === 'Day' ? ' modo-day' : '') + '">' +
          '<div class="gantt-escala">' + escalaHTML(limites, modoAtual()) + '</div>' +
          linhasDir +
        '</div>' +
      '</div>' +
    '</div>' +
    '<button class="btn-detalhar">Ver detalhamento</button>' +
    '<div class="detalhamento">' + detalhe + '</div>';
  card.querySelector('.btn-detalhar').addEventListener('click', function () {
    card.classList.toggle('aberto');
  });

  card.querySelectorAll('.campo-percento input').forEach(function (input) {
    input.addEventListener('change', function () {
      atualizarPercento(card, idObra, lista, input);
    });
  });

  return card;
}
/** Aplica o % digitado na tarefa e atualiza barra, cor e média */
function atualizarPercento(card, idObra, lista, input) {
  let valor = parseInt(input.value, 10);
  if (isNaN(valor)) valor = 0;
  valor = Math.min(Math.max(valor, 0), 100);
  input.value = valor;

  const t = lista.find(function (x) { return x.id === input.dataset.id; });
  if (!t) return;
  t.progress = valor;

  const sit = situacaoTarefa(t);

  const linha = card.querySelector('.gantt-linha[data-id="' + t.id + '"]');
  if (linha) {
    linha.querySelector('.seq-numero').className = 'seq-numero sit-' + sit;
  }

  const indice = lista.indexOf(t);
  const barraLinha = card.querySelectorAll('.gantt-linha-barra')[indice];
  if (barraLinha) {
    const barra = barraLinha.querySelector('.barra-tarefa');
    barra.className = 'barra-tarefa sit-' + sit;
    barra.querySelector('.barra-progresso').style.width = valor + '%';
    barra.querySelector('.barra-rotulo').textContent = valor + '%';
  }

  let soma = 0;
  lista.forEach(function (x) { soma += x.progress; });
  const badge = document.getElementById('badge-' + idObra);
  if (badge) badge.textContent = Math.round(soma / lista.length) + '% · ' + lista.length + ' tarefa(s)';
}

// ===== Situação da tarefa (define a cor) =====
function situacaoTarefa(t) {
  if (t.progress >= 100) return 'no-prazo';

  const fim = parseISO(t.end);
  if (!fim) return 'no-prazo';

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dias = diasEntre(hoje, fim);

  if (dias < 0) return 'atrasada';
  if (dias <= 7) return 'proximo';
  if (t.progress > 0) return 'atencao';
  return 'no-prazo';
}

function rotuloSituacao(sit) {
  if (sit === 'atrasada') return 'ATRASADA';
  if (sit === 'proximo') return 'PRÓXIMO DE VENCER';
  if (sit === 'atencao') return 'PRESTAR ATENÇÃO';
  return 'NO PRAZO';
}

// ===== Limites e posicionamento =====
function limitesPeriodo(lista) {
  let minD = null;
  let maxD = null;
  lista.forEach(function (t) {
    const s = parseISO(t.start);
    const e = parseISO(t.end);
    if (s && (!minD || s < minD)) minD = s;
    if (e && (!maxD || e > maxD)) maxD = e;
  });
  if (!minD || !maxD) return null;

  minD = addDias(minD, -2);
  maxD = addDias(maxD, 2);
  return { min: minD, max: maxD, total: Math.max(diasEntre(minD, maxD), 1) };
}

function posicaoBarra(limites, t) {
  const ini = parseISO(t.start);
  const fim = parseISO(t.end);
  const iniPct = (diasEntre(limites.min, ini) / limites.total) * 100;
  const largPct = Math.max(((diasEntre(ini, fim) + 1) / limites.total) * 100, 2);
  return { ini: iniPct.toFixed(2), larg: largPct.toFixed(2) };
}

// ===== Escala da linha do tempo: Dia / Mês / Ano =====
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function escalaHTML(limites, modo) {
  if (modo === 'Day') return escalaDias(limites);
  if (modo === 'Year') return escalaAnos(limites);
  return escalaMeses(limites);
}

function escalaMeses(limites) {
  let html = '';
  let atual = new Date(limites.min.getFullYear(), limites.min.getMonth(), 1);

  while (atual <= limites.max) {
    const fimMes = new Date(atual.getFullYear(), atual.getMonth() + 1, 0);
    const ini = atual < limites.min ? limites.min : new Date(atual.getTime());
    const fim = fimMes > limites.max ? limites.max : fimMes;
    const iniPct = (diasEntre(limites.min, ini) / limites.total) * 100;
    const largPct = Math.max(((diasEntre(ini, fim) + 1) / limites.total) * 100, 0);

    html += '<span class="escala-mes" style="left:' + iniPct.toFixed(2) + '%;width:' + largPct.toFixed(2) + '%">' + MESES[atual.getMonth()] + '/' +
      String(atual.getFullYear()).slice(-2) + '</span>';
    atual = new Date(atual.getFullYear(), atual.getMonth() + 1, 1);
  }
  return html;
}

function escalaDias(limites) {
  let html = '';
  const passo = Math.max(Math.ceil(limites.total / 15), 1);
  let i = 0;
  let atual = new Date(limites.min.getTime());

  while (atual <= limites.max) {
    if (i % passo === 0) {
      const iniPct = (i / limites.total) * 100;
      const largPct = Math.max((passo / limites.total) * 100, 0);
      const rotulo = ('0' + atual.getDate()).slice(-2) + '/' + ('0' + (atual.getMonth() + 1)).slice(-2);
      html += '<span class="escala-mes" style="left:' + iniPct.toFixed(2) + '%;width:' +
        largPct.toFixed(2) + '%">' + rotulo + '</span>';
    }
    atual = addDias(atual, 1);
    i++;
  }
  return html;
}

function escalaAnos(limites) {
  let html = '';
  let ano = limites.min.getFullYear();
  const anoFim = limites.max.getFullYear();

  while (ano <= anoFim) {
    const iniAno = new Date(ano, 0, 1);
    const fimAno = new Date(ano, 11, 31);
    const ini = iniAno < limites.min ? limites.min : iniAno;
    const fim = fimAno > limites.max ? limites.max : fimAno;
    const iniPct = (diasEntre(limites.min, ini) / limites.total) * 100;
    const largPct = Math.max(((diasEntre(ini, fim) + 1) / limites.total) * 100, 0);

    html += '<span class="escala-mes" style="left:' +
      iniPct.toFixed(2) + '%;width:' + largPct.toFixed(2) + '%">' + ano + '</span>';
    ano++;
  }
  return html;
}

// ===== Linha do tempo geral (modal) =====
// Usa os filtros PRÓPRIOS do modal: modoModal e filtroSemanaModal
function renderizarTimelineGeral() {
  const alvo = document.getElementById('timeline-geral');
  if (!alvo) return;
  // Aplica o filtro de semana do modal, se ativo
  let tarefas = filtroSemanaModal
    ? dadosCronograma.filter(tarefaNaSemana)
    : dadosCronograma;

  if (!tarefas.length) {
    alvo.innerHTML = '<p class="status-mensagem">Nenhuma tarefa nesta semana.</p>';
    return;
  }

  const limites = limitesPeriodo(tarefas);
  const ordenadas =
    tarefas.slice().sort(function (a, b) { return a.start.localeCompare(b.start); });

  let esq = '';
  let dir = '';

  ordenadas.forEach(function (t) {
    const sit = situacaoTarefa(t);
    const pos = posicaoBarra(limites, t);

    esq +=
      '<div class="gantt-linha">' +
        '<div class="tarefa-info">' +
          '<div class="obra-mini">' + escaparHTML(t.obra || '') + '</div>' +
          '<div class="nome-tarefa" title="' + escaparHTML(t.name) + '">' + escaparHTML(t.name) + '</div>' +
        '</div>' +
      '</div>';

    dir +=
      '<div class="gantt-linha-barra">' +
        '<div class="barra-tarefa sit-' + sit + '" style="left:' +
          pos.ini + '%;width:' + pos.larg + '%" title="' + escaparHTML(t.obra || '') + ' — ' + escaparHTML(t.name) + '">' +
          '<span class="barra-progresso" style="width:' + t.progress + '%"></span>' +
          '<span class="barra-rotulo">' + t.progress + '%</span>' +
        '</div>' +
      '</div>';
  });

  alvo.innerHTML =
    '<div class="gantt-msproject">' +
      '<div class="gantt-tarefas">' +
        '<div class="gantt-espaco"><span class="gantt-titulo-coluna">Todas as tarefas (' + ordenadas.length + ')</span></div>' +
        esq +
      '</div>' +
      '<div class="gantt-barras">' +
        '<div class="gantt-conteudo' + (modoModal === 'Day' ?
          ' modo-day' : '') + '">' +
          '<div class="gantt-escala">' + escalaHTML(limites, modoModal) + '</div>' +
          dir +
        '</div>' +
      '</div>' +
    '</div>';
}

// ===== Eventos do modal, modos de visão e semana atual =====
document.addEventListener('DOMContentLoaded', function () {
  const modal = document.getElementById('modal-timeline');
  const btnAbrir = document.getElementById('btn-timeline-geral');
  const btnFechar = document.getElementById('btn-fechar-timeline');

  if (btnAbrir) {
    btnAbrir.addEventListener('click', function () {
      renderizarTimelineGeral();
      modal.classList.add('aberto');
    });
  }

  if (btnFechar) {
    btnFechar.addEventListener('click', function () {
      modal.classList.remove('aberto');
    });
  }

  // Botão: semana atual dos cards
  const btnSemana = document.getElementById('btn-semana-atual');
  if (btnSemana) {
    btnSemana.addEventListener('click', function () {
      filtroSemanaAtiva = !filtroSemanaAtiva;
      btnSemana.classList.toggle('ativo', filtroSemanaAtiva);
      aplicarFiltro(document.getElementById('filtro-obra').value);
    });
  }

  // Botão: semana atual do modal (independente)
  const btnSemanaModal = document.getElementById('btn-semana-modal');
  if (btnSemanaModal) {
    btnSemanaModal.addEventListener('click', function () {
      filtroSemanaModal = !filtroSemanaModal;
      btnSemanaModal.classList.toggle('ativo', filtroSemanaModal);
      renderizarTimelineGeral();
    });
  }

  // Troca de visão dos CARDS: Dia / Mês / Ano
  document.querySelectorAll('.btn-modo[data-modo]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.btn-modo[data-modo]').forEach(function (b) {
        b.classList.remove('ativo');
      });
      btn.classList.add('ativo');
      aplicarFiltro(document.getElementById('filtro-obra').value);
    });
  });

  // Troca de visão do MODAL: Dia / Mês / Ano (independente)
  document.querySelectorAll('.btn-modo[data-modo-modal]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.btn-modo[data-modo-modal]').forEach(function (b) {
        b.classList.remove('ativo');
      });
      btn.classList.add('ativo');
      modoModal = btn.dataset.modoModal;
      renderizarTimelineGeral();
    });
  });
});

/** Modo de visão dos cards selecionado nos botões */
function modoAtual() {
  const ativo = document.querySelector('.btn-modo[data-modo].ativo');
  return ativo ? ativo.dataset.modo : 'Month';
}
// ===== Utilitários de data e texto =====
function parseISO(iso) {
  if (!iso) return null;
  const p = iso.split('-');
  return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
}

function addDias(d, n) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

function diasEntre(a, b) {
  return Math.round((b - a) / 86400000);
}

function formatarBR(iso) {
  if (!iso) return '—';
  const p = iso.split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

function escaparHTML(texto) {
  const div = document.createElement('div');
  div.textContent = String(texto);
  return div.innerHTML;
}
