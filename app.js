// ==========================================================================
// ¿Quién es más probable? - Lógica Principal (app.js)
// ==========================================================================

if (typeof Q === 'undefined') {
  document.getElementById('app').innerHTML = '<h1>Falta <b>preguntas.js</b></h1><p class="sub">Sube preguntas.js al mismo sitio que index.html.</p>';
  throw new Error('sin preguntas');
}

// ---------- Utilidades ----------
const $ = s => document.querySelector(s), app = $('#app');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }
};
const pid = ls.get('pid') || (() => {
  const p = Math.random().toString(36).slice(2, 10);
  ls.set('pid', p);
  return p;
})();

// Servidores WebSocket seguros (WSS sobre puerto 443 estándar)
// Garantizan compatibilidad 100% universal con cualquier teléfono móvil (iPhone, Android, Xiaomi, etc.)
// y cualquier red (WiFi, Datos móviles 4G/5G, CGNAT, Safari privado o iCloud Private Relay).
const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt'
];
let brokerIdx = 0;
let netClient = null;

let wl;
async function keepAwake() {
  try {
    if (navigator.wakeLock && document.visibilityState === 'visible') {
      wl = await navigator.wakeLock.request('screen');
    }
  } catch (e) {}
}

let mineV = [], mineInitV = [], mineTbV = [], step = 0, stepKey = '', lastSig = '';
let myName = ls.get('name') || '', isHost = false, code = '';
let H = null, S = null, me = null, myVote = null, err = '', cq = '', stage = '', busy = false;
let isWaiting = false, revealInterval = null;

const hashCode = () => (location.hash || '').replace('#', '').toUpperCase().slice(0, 4);

// ---------- Salir y Volver atrás ----------
function leaveGame(force = false) {
  if (!force && S && S.phase !== 'lobby' && !isWaiting && !confirm('¿Seguro que quieres salir de la partida?')) {
    return;
  }
  if (revealInterval) {
    clearInterval(revealInterval);
    revealInterval = null;
  }
  if (netClient) {
    try {
      if (isHost && code) {
        netClient.publish('vg2/' + code + '/state', JSON.stringify({ t: 'closed' }), { retain: true });
      } else if (!isHost && code) {
        netClient.publish('vg2/' + code + '/action', JSON.stringify({ t: 'leave', pid }));
      }
      netClient.end(true);
    } catch (e) {}
    netClient = null;
  }
  H = null;
  S = null;
  isHost = false;
  code = '';
  busy = false;
  err = '';
  myVote = null;
  me = null;
  isWaiting = false;
  mineV = [];
  mineInitV = [];
  mineTbV = [];
  try { history.replaceState(null, '', location.pathname); } catch(e){ location.hash = ''; }
  render();
}

// ---------- Anfitrión ----------
const TIMES = [0, 10, 15, 20, 30, 45, 60, 90];
const BOT_NAMES = ['Lucía', 'Pablo', 'María', 'Carlos', 'Elena', 'Javi', 'Ana', 'Marcos', 'Sara', 'Hugo', 'Laura', 'Álex', 'Sofía', 'Dani', 'Carmen', 'Adrián', 'Paula', 'Diego', 'Marta', 'Raúl'];
let decks = { colegueo: [], fuerte: [], retos_colegas: [], retos_fuertes: [], retos: [] };

const isDareMode = m => m === 'retos_colegas' || m === 'retos_fuertes' || m === 'retos';

function pickRandomPlayer(excludeN) {
  if (!H || !H.players || !H.players.length) return 1;
  const eligible = H.players.length > 1 && excludeN ? H.players.filter(p => p.n !== excludeN) : H.players;
  const pool = eligible.length ? eligible : H.players;
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  return chosen ? chosen.n : 1;
}

function completeDare(success) {
  if (!H || H.phase !== 'dare') return;
  const targetN = H.targetPlayer;
  const p = H.players.find(x => x.n === targetN);
  if (p && success) {
    p.wins++;
    p.total++;
  }
  H.res = { target: targetN, completed: !!success };
  H.deadline = 0;
  const ch = H.players.filter(x => x.wins >= H.cfg.target);
  const top = Math.max(0, ...ch.map(x => x.wins));
  H.champ = ch.length ? ch.filter(x => x.wins === top).map(x => x.n) : null;
  H.phase = 'result';
  step = 0;
  bc();
}

function rerollDarePlayer() {
  if (!H || H.phase !== 'dare') return;
  H.targetPlayer = pickRandomPlayer(H.targetPlayer);
  bc();
}

function createGame() {
  if (typeof mqtt === 'undefined') {
    err = 'Cargando conexión con el servidor… Espera un segundo y pulsa de nuevo.';
    return render();
  }
  isHost = true;
  busy = true;
  stage = 'Creando sala…';
  err = '';
  render();
  keepAwake();

  if (netClient) {
    try { netClient.end(true); } catch (e) {}
    netClient = null;
  }

  const c = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.random() * 24 | 0]).join('');
  code = c;

  const currentBroker = BROKERS[brokerIdx % BROKERS.length];
  const clientId = 'vgh_' + pid + '_' + Math.random().toString(36).slice(2, 7);

  let opened = false;
  const timeout = setTimeout(() => {
    if (!opened && !H) {
      busy = false;
      isHost = false;
      brokerIdx++;
      err = 'El servidor tardó en responder. Reintentando por ruta alternativa…';
      try { netClient && netClient.end(true); } catch (e) {}
      render();
    }
  }, 10000);

  try {
    netClient = mqtt.connect(currentBroker, {
      clientId,
      clean: true,
      connectTimeout: 8000,
      reconnectPeriod: 2000,
      keepalive: 30
    });
  } catch (e) {
    clearTimeout(timeout);
    busy = false;
    isHost = false;
    err = 'Error al conectar con la red: ' + (e.message || e);
    return render();
  }

  netClient.on('connect', () => {
    opened = true;
    clearTimeout(timeout);
    try { history.replaceState(null, '', '#' + c); } catch (e) { location.hash = c; }
    busy = false;
    H = {
      cfg: { mode: 'colegueo', target: 10, secs: 60 },
      phase: 'lobby',
      round: 0,
      q: '',
      targetPlayer: null,
      votes: {},
      res: null,
      initialRes: null,
      tbRes: null,
      tiebreak: null,
      deadline: 0,
      champ: null,
      players: [{ id: pid, n: 1, name: myName, total: 0, wins: 0 }],
      waiting: []
    };
    me = 1;

    // El host se suscribe a las acciones de los jugadores
    netClient.subscribe('vg2/' + c + '/action', { qos: 0 });

    bc();

    if (revealInterval) clearInterval(revealInterval);
    revealInterval = setInterval(() => {
      if (H && H.phase === 'vote' && H.deadline && Date.now() >= H.deadline) reveal();
    }, 500);
  });

  netClient.on('message', (topic, payload) => {
    if (!H) return;
    try {
      const m = JSON.parse(payload.toString());
      if (topic === 'vg2/' + c + '/action') {
        if (m.t === 'join' && m.pid) {
          const cleanName = String(m.name || '?').trim().slice(0, 14);
          if (!cleanName || cleanName === '?') {
            netClient.publish('vg2/' + c + '/direct/' + m.pid, JSON.stringify({ t: 'err', msg: 'Introduce un nombre válido para jugar.' }));
            return;
          }

          // Validar que el nombre no esté repetido
          const nameTaken = H.players.some(p => p.id !== m.pid && p.name.trim().toLowerCase() === cleanName.toLowerCase()) ||
            ((H.waiting || []).some(w => w.id !== m.pid && w.name.trim().toLowerCase() === cleanName.toLowerCase()));

          if (nameTaken) {
            netClient.publish('vg2/' + c + '/direct/' + m.pid, JSON.stringify({ t: 'err', msg: `El nombre "${cleanName}" ya está en uso. Elige otro nombre.` }));
            return;
          }

          let p = H.players.find(x => x.id === m.pid);
          if (p) {
            p.name = cleanName;
            bc();
            return;
          }

          if (H.phase === 'lobby') {
            p = { id: m.pid, n: H.players.length + 1, name: cleanName, total: 0, wins: 0 };
            H.players.push(p);
            bc();
          } else {
            // Partida ya empezada: entra en espera para la siguiente ronda
            if (!H.waiting) H.waiting = [];
            let w = H.waiting.find(x => x.id === m.pid);
            if (!w) {
              H.waiting.push({ id: m.pid, name: cleanName });
            } else {
              w.name = cleanName;
            }
            bc();
          }
        } else if (m.t === 'vote' && H.phase === 'vote' && m.pid) {
          castVote(m.pid, m.n);
        } else if (m.t === 'leave' && m.pid) {
          if (H && H.waiting) {
            H.waiting = H.waiting.filter(w => w.id !== m.pid);
            bcSoon();
          }
        }
      }
    } catch (e) {
      console.warn('Host msg err', e);
    }
  });

  netClient.on('error', e => {
    console.warn('Host net error', e);
  });
}

const pub = () => ({
  cfg: H.cfg,
  phase: H.phase,
  round: H.round,
  q: H.q,
  targetPlayer: H.targetPlayer || null,
  res: H.res ? (H.res.target != null ? { target: H.res.target, completed: H.res.completed } : { counts: H.res.counts, max: H.res.max, winners: H.res.winners }) : null,
  initialRes: H.initialRes ? { counts: H.initialRes.counts, max: H.initialRes.max, winners: H.initialRes.winners } : null,
  tbRes: H.tbRes ? { counts: H.tbRes.counts, max: H.tbRes.max, winners: H.tbRes.winners } : null,
  code,
  champ: H.champ,
  tiebreak: H.tiebreak || null,
  tiebreakLeft: H.tiebreakAt ? Math.max(0, H.tiebreakAt - Date.now()) : 0,
  tbWaiting: !!(H.tiebreakAt && Date.now() < H.tiebreakAt),
  timed: !!H.deadline,
  left: H.deadline ? Math.max(0, H.deadline - Date.now()) : 0,
  voted: Object.keys(H.votes).length,
  players: H.players.map(p => ({ id: p.id, n: p.n, name: p.name, total: p.total, wins: p.wins })),
  waitingCount: (H.waiting || []).length,
  waitingNames: (H.waiting || []).map(w => w.name),
  waitingIds: (H.waiting || []).map(w => w.id)
});

function bc() {
  S = pub();
  S.endAt = H.deadline;
  S.tiebreakEnd = H.tiebreakAt || 0;

  if (netClient && isHost && code) {
    const payload = JSON.stringify({
      t: 's',
      s: S,
      deadline: H.deadline,
      tiebreakAt: H.tiebreakAt || 0,
      left: H.deadline ? Math.max(0, H.deadline - Date.now()) : 0,
      tiebreakLeft: H.tiebreakAt ? Math.max(0, H.tiebreakAt - Date.now()) : 0,
      votesMap: (H.phase === 'reveal' || H.phase === 'end') ? H.votes : null,
      res: H.res,
      initialRes: H.initialRes,
      tbRes: H.tbRes
    });
    netClient.publish('vg2/' + code + '/state', payload, { retain: true, qos: 0 });
  }

  mineV = (H.res && me && H.res.voters && H.res.voters[me]) || [];
  mineInitV = (H.initialRes && me && H.initialRes.voters && H.initialRes.voters[me]) || [];
  mineTbV = (H.tbRes && me && H.tbRes.voters && H.tbRes.voters[me]) || [];
  myVote = H.votes[pid] != null ? H.votes[pid] : null;
  render();
}

let bt = 0;
function bcSoon() {
  if (bt) return;
  bt = setTimeout(() => { bt = 0; bc(); }, 150);
}

function castVote(id, n) {
  const v = H.players.find(p => p.id === id);
  if (H.phase !== 'vote' || !v || v.n === n || !H.players.some(p => p.n === n)) return;
  if (H.tiebreak) {
    if (H.tiebreakAt && Date.now() < H.tiebreakAt) return;
    if (H.tiebreak.includes(v.n)) return;
    if (!H.tiebreak.includes(n)) return;
  }
  H.votes[id] = n;
  bcSoon();
  const eligible = H.tiebreak ? H.players.filter(p => !H.tiebreak.includes(p.n)).length : H.players.length;
  if (eligible > 0 && Object.keys(H.votes).length >= eligible) setTimeout(reveal, 900);
}

function nextQ() {
  if (H.waiting && H.waiting.length) {
    H.waiting.forEach(w => {
      if (!H.players.some(p => p.id === w.id)) {
        H.players.push({
          id: w.id,
          n: H.players.length + 1,
          name: w.name,
          total: 0,
          wins: 0
        });
      }
    });
    H.waiting = [];
  }
  const m = H.cfg.mode;
  if (!decks[m]) decks[m] = [];
  if (!decks[m].length) {
    const src = Q[m] || Q.retos_colegas || [];
    decks[m] = src.map(q => [Math.random(), q]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  }
  H.q = cq.trim() || decks[m].pop() || '¡Reto sorpresa!';
  cq = '';
  H.round++;
  H.votes = {};
  H.res = null;
  H.initialRes = null;
  H.tbRes = null;
  H.tiebreak = null;
  H.tiebreakAt = 0;

  if (isDareMode(m)) {
    H.phase = 'dare';
    H.targetPlayer = pickRandomPlayer(H.targetPlayer);
    H.deadline = H.cfg.secs ? Date.now() + H.cfg.secs * 1000 : 0;
    bc();
  } else {
    H.phase = 'vote';
    H.targetPlayer = null;
    H.deadline = H.cfg.secs ? Date.now() + H.cfg.secs * 1000 : 0;
    bc();
    botVotes();
  }
}

function botVotes() {
  const r = H.round, tb = H.tiebreak;
  H.players.filter(p => p.bot && (!tb || !tb.includes(p.n))).forEach(b => setTimeout(() => {
    if (!H || H.phase !== 'vote' || H.round !== r) return;
    const o = tb ? H.players.filter(p => tb.includes(p.n)) : H.players.filter(p => p.id !== b.id);
    if (o.length) castVote(b.id, o[Math.random() * o.length | 0].n);
  }, 1000 + Math.random() * 8000));
}

function toggleBots() {
  if (H.players.some(p => p.bot)) {
    H.players = H.players.filter(p => !p.bot);
    H.players.forEach((p, i) => p.n = i + 1);
  } else {
    const existing = new Set([
      ...H.players.map(p => p.name.trim().toLowerCase()),
      ...(H.waiting || []).map(w => w.name.trim().toLowerCase())
    ]);
    const available = BOT_NAMES.filter(b => !existing.has(b.toLowerCase()));
    let bi = 0;
    while (H.players.length < 15 && bi < available.length) {
      const i = H.players.length + 1;
      H.players.push({ id: 'bot' + i, n: i, name: available[bi++], total: 0, wins: 0, bot: true });
    }
  }
  bc();
}

function skipQ() {
  H.round--;
  nextQ();
}

function reveal() {
  if (!H || H.phase !== 'vote') return;
  const counts = {}, voters = {};
  for (const id in H.votes) {
    const t = H.votes[id], v = H.players.find(p => p.id === id);
    counts[t] = (counts[t] || 0) + 1;
    (voters[t] = voters[t] || []).push(v ? v.n : 0);
  }
  const max = Math.max(0, ...Object.values(counts));
  const winners = max ? H.players.filter(p => counts[p.n] === max).map(p => p.n) : [];
  if (!H.tiebreak && winners.length > 1) {
    const eligible = H.players.filter(p => !winners.includes(p.n));
    if (eligible.length > 0) {
      H.players.forEach(p => { p.total += counts[p.n] || 0; });
      H.initialRes = { counts, voters, max, winners };
      H.tiebreak = winners;
      H.votes = {};
      H.tiebreakAt = Date.now() + 5000;
      H.deadline = 0;
      bc();
      setTimeout(() => {
        if (!H || !H.tiebreak || H.phase !== 'vote') return;
        H.tiebreakAt = 0;
        H.deadline = H.cfg.secs ? Date.now() + H.cfg.secs * 1000 : 0;
        bc();
        botVotes();
      }, 5000);
      return;
    }
  }
  if (H.tiebreak) {
    H.tbRes = { counts, voters, max, winners: winners.length === 1 ? winners : [] };
  }
  H.tiebreak = null;
  H.players.forEach(p => {
    p.total += counts[p.n] || 0;
    if (winners.length === 1 && winners.includes(p.n)) p.wins++;
  });
  H.res = { counts, voters, max, winners: winners.length === 1 ? winners : [] };
  H.deadline = 0;
  const ch = H.players.filter(p => p.wins >= H.cfg.target), top = Math.max(0, ...ch.map(p => p.wins));
  H.champ = ch.length ? ch.filter(p => p.wins === top).map(p => p.n) : null;
  H.phase = 'result';
  bc();
}

function resetGame() {
  if (H.waiting && H.waiting.length) {
    H.waiting.forEach(w => {
      if (!H.players.some(p => p.id === w.id)) {
        H.players.push({
          id: w.id,
          n: H.players.length + 1,
          name: w.name,
          total: 0,
          wins: 0
        });
      }
    });
    H.waiting = [];
  }
  H.players.forEach(p => { p.total = 0; p.wins = 0; });
  H.round = 0;
  H.champ = null;
  H.res = null;
  H.initialRes = null;
  H.tbRes = null;
  H.tiebreak = null;
  H.tiebreakAt = 0;
  H.votes = {};
  H.targetPlayer = null;
  H.phase = 'lobby';
  bc();
}

// ---------- Jugador ----------
function setStage(t) {
  stage = t;
  if (busy && !S) render();
}

function joinGame(c, retry) {
  if (typeof mqtt === 'undefined') {
    err = 'Cargando conexión con el servidor… Espera un segundo y pulsa de nuevo.';
    return render();
  }
  code = c;
  try { history.replaceState(null, '', '#' + c); } catch (e) { location.hash = c; }
  busy = true;
  err = '';
  setStage('1/2 conectando');
  render();
  keepAwake();

  if (netClient) {
    try { netClient.end(true); } catch (e) {}
    netClient = null;
  }

  let done = false;
  const currentBroker = BROKERS[brokerIdx % BROKERS.length];
  const clientId = 'vgp_' + pid + '_' + Math.random().toString(36).slice(2, 7);

  const fail = () => {
    if (done) return;
    done = true;
    if (S) { setTimeout(() => joinGame(c), 2000); return; }
    brokerIdx++;
    err = 'No se pudo conectar a la sala ' + code + '. Comprueba el código o que el anfitrión esté en la sala.';
    busy = false;
    render();
  };

  const to = setTimeout(fail, 10000);

  try {
    netClient = mqtt.connect(currentBroker, {
      clientId,
      clean: true,
      connectTimeout: 7000,
      reconnectPeriod: 2000,
      keepalive: 30
    });
  } catch (e) {
    clearTimeout(to);
    err = 'Error de conexión: ' + (e.message || e);
    busy = false;
    return render();
  }

  netClient.on('connect', () => {
    setStage('2/2 entrando');
    netClient.subscribe(['vg2/' + code + '/state', 'vg2/' + code + '/direct/' + pid], { qos: 0 });
    netClient.publish('vg2/' + code + '/action', JSON.stringify({ t: 'join', pid, name: myName }));
  });

  netClient.on('message', (topic, payload) => {
    try {
      const m = JSON.parse(payload.toString());
      if (topic === 'vg2/' + code + '/state') {
        if (m.t === 'closed') {
          err = 'El anfitrión ha cerrado la partida.';
          leaveGame(true);
          return;
        }
        if (m.t === 's') {
          clearTimeout(to);
          done = true;
          busy = false;
          S = m.s;
          if (S.timed) S.endAt = Date.now() + (m.left || S.left || 0);
          if (S.tiebreakLeft) S.tiebreakEnd = Date.now() + (m.tiebreakLeft || S.tiebreakLeft || 0);

          const myPlayer = (S.players || []).find(p => p.id === pid);
          if (myPlayer) {
            me = myPlayer.n;
            isWaiting = false;
          } else if ((S.waitingIds || []).includes(pid)) {
            me = null;
            isWaiting = true;
          }

          if (m.votesMap && m.votesMap[pid] != null) {
            myVote = m.votesMap[pid];
          }

          mineV = (m.res && me && m.res.voters && m.res.voters[me]) || [];
          mineInitV = (m.initialRes && me && m.initialRes.voters && m.initialRes.voters[me]) || [];
          mineTbV = (m.tbRes && me && m.tbRes.voters && m.tbRes.voters[me]) || [];
          render();
        }
      } else if (topic === 'vg2/' + code + '/direct/' + pid) {
        if (m.t === 'err') {
          clearTimeout(to);
          done = true;
          busy = false;
          err = m.msg || 'No se pudo entrar a la partida.';
          render();
        }
      }
    } catch (e) {
      console.warn('Player msg err', e);
    }
  });

  netClient.on('error', e => {
    console.warn('Player net error', e);
  });
}

function vote(n) {
  if (n === me) return;
  if (S && S.tiebreak) {
    if (S.tiebreakEnd && Date.now() < S.tiebreakEnd) return;
    if (S.tiebreak.includes(me)) return;
    if (!S.tiebreak.includes(n)) return;
  }
  if (isHost) {
    castVote(pid, n);
  } else if (netClient) {
    netClient.publish('vg2/' + code + '/action', JSON.stringify({ t: 'vote', pid, n }));
    myVote = n;
    render();
  }
}

// ---------- Pantallas y Efectos ----------
const RM = matchMedia('(prefers-reduced-motion:reduce)').matches;
let lastKey = '';
function enter(k) {
  app.classList.toggle('enter', k !== lastKey);
  lastKey = k;
}

// Confeti de celebración neutral (no Halloween)
function burst(list = ['🎉', '✨', '👑', '🔥', '⚡', '🌟']) {
  if (RM) return;
  for (let i = 0; i < 26; i++) {
    const e = document.createElement('span');
    e.className = 'fx';
    e.textContent = list[i % list.length];
    e.style.left = Math.random() * 96 + 'vw';
    e.style.animationDelay = Math.random() * .9 + 's';
    e.style.fontSize = (22 + Math.random() * 18) + 'px';
    document.body.appendChild(e);
    setTimeout(() => e.remove(), 4200);
  }
}

// Fondo ambiental con formas elegantes y sutiles
(function () {
  const bg = $('#bg');
  if (!bg) return;
  const em = ['✨', '⭐', '💫', '⚡', '🌟', '💎'];
  for (let i = 0; i < 14; i++) {
    const e = document.createElement('i');
    e.textContent = em[i % em.length];
    e.style.left = (i * 7.3 + Math.random() * 5) % 96 + 'vw';
    e.style.fontSize = (22 + Math.random() * 24) + 'px';
    e.style.animationDuration = (14 + Math.random() * 14) + 's';
    e.style.animationDelay = (-Math.random() * 20) + 's';
    bg.appendChild(e);
  }
})();

const MODE = m => {
  if (m === 'fuerte') return '🌶️ Fuerte';
  if (m === 'retos_colegas') return '🎉 Retos Colegas';
  if (m === 'retos_fuertes' || m === 'retos') return '🔥 Retos Fuertes';
  return '😄 Colegueo';
};

function cfgPanel(modeOnly) {
  const c = S.cfg;
  const isD = isDareMode(c.mode);
  const seg = m => `<button class="${c.mode === m ? 'on' : ''}" data-a="mode" data-m="${m}">${MODE(m)}</button>`;
  const stp = (l, k, v) => `<div class="stp"><span>${l}</span><button data-a="${k}" data-d="-1">−</button><b>${v}</b><button data-a="${k}" data-d="1">+</button></div>`;
  return `<div class="cfg"><div class="seg seg-grid">${seg('colegueo')}${seg('fuerte')}${seg('retos_colegas')}${seg('retos_fuertes')}</div>${modeOnly ? '' : stp(isD ? 'Retos para ganar' : 'Rondas para ganar', 'tg', c.target) + stp(isD ? 'Tiempo por reto' : 'Tiempo por pregunta', 'sc', c.secs ? c.secs + ' s' : 'sin límite')}</div>`;
}

let lastBurst = '';

function render() {
  if (!S) {
    const hc = hashCode();
    app.innerHTML = `
      <h1>¿Quién es más <b>probable</b>?</h1>
      <p class="sub">El juego para destapar verdades entre amigos. Cada uno vota en secreto desde su móvil.</p>
      
      <input id="nm" placeholder="Tu nombre o apodo" maxlength="14" value="${esc(myName)}" autocomplete="off">
      
      ${busy ? `
        <p class="mute" style="text-align:center;padding:12px 0;">⏳ ${esc(stage || 'Conectando…')}</p>
        <button class="btn-back" data-a="cancel-join" style="margin:0 auto;display:flex;">Cancelar</button>
      ` : hc.length === 4 ? `
        <button class="pri" data-a="join" data-c="${esc(hc)}">Unirme a la partida ${esc(hc)}</button>
        <button class="btn-back" data-a="clear-hash" style="margin:10px auto 0;display:flex;">O crear mi propia partida</button>
      ` : `
        <button class="pri" data-a="create">Crear partida</button>
        <div class="or">o entra con un código</div>
        <div class="row">
          <input id="cd" maxlength="4" placeholder="CÓDIGO" autocomplete="off">
          <button data-a="join">Unirme</button>
        </div>
      `}
      <p class="err">${esc(err)}</p>
    `;
    document.body.dataset.mode = '';
    enter('home' + busy + err);
    return;
  }

  const k0 = S.phase + S.round;
  if (k0 !== stepKey) { stepKey = k0; step = 0; }
  const tbWaiting = !!(S.tiebreak && S.tiebreakEnd && Date.now() < S.tiebreakEnd);
  const sig = JSON.stringify([S.phase, S.round, S.q, S.cfg, S.res, S.targetPlayer, S.initialRes, S.tbRes, S.champ, S.tiebreak, tbWaiting, S.timed, S.players, myVote, me, step, mineV, mineInitV, mineTbV, isWaiting, S.waitingCount]);
  
  if (sig === lastSig) {
    const vc = $('#vc');
    if (vc) {
      const el = S.tiebreak ? S.players.length - S.tiebreak.length : S.players.length;
      vc.textContent = S.voted + ' de ' + el + ' han votado';
    }
    return;
  }
  lastSig = sig;

  const ps = S.players, total = ps.length, cf = S.cfg, nm = n => esc((ps.find(p => p.n === n) || {}).name || '?');
  document.body.dataset.mode = cf.mode;
  const chips = ps.map(p => `<span class="chip"><b>${p.n}</b>${esc(p.name)}${p.n === me ? ' (tú)' : ''}</span>`).join('');
  
  // Pantalla de espera para nuevos jugadores que se unen a una partida ya empezada
  if (isWaiting) {
    let hw = `
      <div class="top">
        <div class="top-left">
          <button class="btn-back" data-a="leave" title="Salir de la partida">← Salir</button>
          <span>${S.round ? 'Ronda ' + S.round : 'En espera'}</span>
        </div>
        <span class="chip">${MODE(cf.mode)} · ${S.code}</span>
      </div>
      <div class="win sm" style="text-align:center;margin-top:12px;">
        <div class="big">⏳ Ronda en curso</div>
        ¡Te has conectado con éxito! Entrarás a jugar en la <b>Ronda ${S.round + 1}</b> en cuanto termine esta ronda.
      </div>
    `;

    if (S.phase === 'vote') {
      hw += `
        <p class="mute" style="text-align:center;margin:18px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:1px">Pregunta en votación ahora:</p>
        <div class="q" style="font-size:${S.q.length > 100 ? 17 : S.q.length > 70 ? 21 : 25}px;text-align:center">${esc(S.q)}</div>
      `;
      if (S.timed) {
        hw += `
          <div class="tbar"><i id="tb" style="width:${S.cfg.secs ? Math.max(0, ((S.endAt || 0) - Date.now()) / (S.cfg.secs * 1000) * 100) : 0}%"></i></div>
          <div id="tm" class="mute">⏱ ${Math.ceil(Math.max(0, (S.endAt || 0) - Date.now()) / 1000)} s</div>
        `;
      }
      hw += `
        <p class="mute" style="text-align:center;margin-top:14px;">
          <span id="vc">${S.voted} de ${total} han votado</span>
        </p>
      `;
    } else if (S.phase === 'dare') {
      hw += `
        <p class="mute" style="text-align:center;margin:18px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:1px">Reto de la ronda en curso:</p>
        <div class="q dare-q" style="font-size:${S.q.length > 100 ? 17 : S.q.length > 70 ? 21 : 25}px;text-align:center">${esc(S.q)}</div>
        <p class="mute" style="text-align:center;margin-top:12px;font-size:16px;">🎯 Le toca cumplirlo a: <b>${nm(S.targetPlayer)}</b></p>
      `;
      if (S.timed) {
        hw += `
          <div class="tbar"><i id="tb" style="width:${S.cfg.secs ? Math.max(0, ((S.endAt || 0) - Date.now()) / (S.cfg.secs * 1000) * 100) : 0}%"></i></div>
          <div id="tm" class="mute">⏱ ${Math.ceil(Math.max(0, (S.endAt || 0) - Date.now()) / 1000)} s</div>
        `;
      }
    } else if (S.phase === 'result') {
      hw += `
        <p class="mute" style="text-align:center;margin:18px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:1px">Prueba de esta ronda:</p>
        <div class="q" style="font-size:20px;text-align:center">${esc(S.q)}</div>
        <div class="mine" style="text-align:center;">Viendo resultados de la ronda... El anfitrión pasará a la siguiente prueba en breve.</div>
      `;
    }

    hw += `
      <h2 style="font-size:18px;margin-top:24px;">Jugadores en la partida (${total})</h2>
      <div class="players">${chips}</div>
      <p class="mute" style="text-align:center;margin-top:22px;font-size:13px;line-height:1.5;">
        ✨ Mantén esta pantalla abierta. Te incorporarás automáticamente en cuanto empiece la siguiente ronda.
      </p>
    `;

    const kw = 'waiting-' + S.phase + S.round;
    app.innerHTML = hw;
    enter(kw);
    updTimer();
    return;
  }

  // Barra superior con botón para salir / volver atrás
  let h = `
    <div class="top">
      <div class="top-left">
        <button class="btn-back" data-a="leave" title="Salir de la sala">← Salir</button>
        <span>${S.round ? 'Ronda ' + S.round : 'Sala de espera'}</span>
      </div>
      <span class="chip">${MODE(cf.mode)} · ${S.code}</span>
    </div>
  `;

  if (S.phase === 'lobby') {
    const url = location.href.split('#')[0] + '#' + S.code;
    h += `<h1>Tu número es el <b>${me || '…'}</b></h1>`;
    if (isHost) {
      let q = '';
      try {
        const g = qrcode(0, 'M');
        g.addData(url);
        g.make();
        q = g.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
      } catch (e) {}
      h += `
        <p class="sub">Que escaneen el QR o entren con el código:</p>
        ${q ? `<div class="qr">${q}</div>` : ''}
        <div class="code">${S.code}</div>
        <p class="mute" style="text-align:center;word-break:break-all;font-size:13px">${esc(url)}</p>
      `;
    } else {
      h += `
        <p class="sub">Esperando a que el anfitrión empiece…</p>
        <p class="mute">Gana quien consiga ${cf.target} ${isDareMode(cf.mode) ? 'retos' : 'rondas'} · ${cf.secs ? cf.secs + (isDareMode(cf.mode) ? ' s por reto' : ' s por pregunta') : 'sin límite de tiempo'}</p>
      `;
    }
    h += `<div class="players">${chips}</div>`;
    if (isHost) {
      h += cfgPanel() + `
        <button class="pri" data-a="next" ${total < (isDareMode(cf.mode) ? 1 : 2) ? 'disabled' : ''}>Empezar (${total} ${total === 1 ? 'jugador' : 'jugadores'})</button>
        <button data-a="bots">${ps.length && H.players.some(p => p.bot) ? 'Quitar bots de prueba' : '🤖 Rellenar con bots de prueba (hasta 15)'}</button>
      `;
    }
  } else if (S.phase === 'dare') {
    const isTarget = me === S.targetPlayer;
    const targetName = nm(S.targetPlayer);

    if (isTarget) {
      h += `
        <div class="dare-banner is-me">
          <div class="dare-pulse">🚨 ¡TE TOCA A TI! 🚨</div>
          <div class="dare-sub">¡Eres el elegido de la ronda para cumplir este reto ante el grupo!</div>
        </div>
      `;
    } else {
      h += `
        <div class="dare-banner">
          <div class="dare-sub">🎯 Le toca cumplir el reto a:</div>
          <div class="dare-target-name">${targetName} <small>(#${S.targetPlayer})</small></div>
        </div>
      `;
    }

    h += `<div class="q dare-q" style="font-size:${S.q.length > 100 ? 18 : S.q.length > 60 ? 22 : 26}px">${esc(S.q)}</div>`;

    if (S.timed) {
      h += `<div class="tbar"><i id="tb" style="width:${S.cfg.secs ? Math.max(0, ((S.endAt || 0) - Date.now()) / (S.cfg.secs * 1000) * 100) : 0}%"></i></div><div id="tm" class="mute">⏱ ${Math.ceil(Math.max(0, (S.endAt || 0) - Date.now()) / 1000)} s</div>`;
    }

    h += `
      <div class="players">
        ${ps.map(p => `
          <span class="chip ${p.n === S.targetPlayer ? 'chip-target on' : ''}">
            <b>${p.n}</b>${esc(p.name)}${p.n === S.targetPlayer ? ' 🎯' : ''}${p.n === me ? ' (tú)' : ''}
          </span>
        `).join('')}
      </div>
    `;

    if (isHost) {
      if (S.waitingCount > 0) {
        h += `<p class="mute" style="text-align:center;font-size:13px;color:var(--pri);margin-top:10px;">⏳ ${S.waitingCount} nuevo(s) jugador(es) esperando entrar: <b>${esc(S.waitingNames.join(', '))}</b></p>`;
      }
      h += `
        <div style="margin-top:18px;display:flex;flex-direction:column;gap:10px;">
          <button class="pri btn-dare-ok" data-a="dare-ok">✅ ¡Reto cumplido! (+1 punto)</button>
          <button class="sec btn-dare-fail" data-a="dare-fail">❌ Se raja / Castigo (0 puntos)</button>
          <div class="row">
            <button class="sec" data-a="dare-reroll">🎲 Cambiar persona</button>
            <button class="sec" data-a="skip">⏭️ Saltar reto</button>
          </div>
        </div>
      `;
    } else {
      if (isTarget) {
        h += `<div class="mine" style="text-align:center;margin-top:16px;">🔥 <b>¡Demuestra de qué estás hecho!</b> El anfitrión confirmará si has cumplido la prueba.</div>`;
      } else {
        h += `<div class="mine" style="text-align:center;margin-top:16px;">👀 Atentos todos a <b>${targetName}</b>. El anfitrión registrará el resultado.</div>`;
      }
    }
  } else if (S.phase === 'vote') {
    const tb = S.tiebreak, iAmTied = tb && tb.includes(me);
    if (tbWaiting) {
      h += `
        <div class="win sm"><div class="big">⚔️ ¡Empate!</div>Han empatado: <b>${tb.map(n => nm(n)).join(' y ')}</b></div>
        <p class="sub" style="text-align:center">¡Se prepara el desempate!</p>
        <div class="code" id="tbcd" style="font-size:52px;margin:16px 0">${Math.ceil(Math.max(0, (S.tiebreakEnd || 0) - Date.now()) / 1000)}</div>
        <p class="mute" style="text-align:center">La pregunta vuelve a salir en unos segundos…</p>
      `;
    } else {
      if (tb) h += `<div class="win sm"><div class="big">⚔️ Desempate</div>Solo se puede votar a los empatados</div>`;
      h += `<div class="q" style="font-size:${S.q.length > 100 ? 17 : S.q.length > 70 ? 21 : 26}px">${esc(S.q)}</div>`;
      if (S.timed) {
        h += `<div class="tbar"><i id="tb" style="width:${S.cfg.secs ? Math.max(0, ((S.endAt || 0) - Date.now()) / (S.cfg.secs * 1000) * 100) : 0}%"></i></div><div id="tm" class="mute">⏱ ${Math.ceil(Math.max(0, (S.endAt || 0) - Date.now()) / 1000)} s</div>`;
      }
      const votables = tb ? ps.filter(p => tb.includes(p.n)) : ps;
      h += `
        <div class="grid">
          ${votables.map(p => `<button class="opt ${myVote === p.n ? 'on' : ''}" data-a="vote" data-n="${p.n}" ${p.n === me || iAmTied ? 'disabled' : ''}><span class="n">${p.n}</span><span>${esc(p.name)}${p.n === me ? ' (tú)' : ''}</span></button>`).join('')}
        </div>
        <p class="mute" style="text-align:center;margin-top:14px;">
          ${iAmTied ? 'Estás en el desempate. No puedes votarte en esta ronda.' : myVote ? '✓ Voto enviado. Puedes cambiarlo hasta que se revele.' : tb ? 'Vota para deshacer el empate.' : 'Toca el número de la persona que elijas (a ti no puedes votarte).'}<br>
          <span id="vc">${S.voted} de ${tb ? total - tb.length : total} han votado</span>
        </p>
      `;
      if (isHost) {
        if (S.waitingCount > 0) {
          h += `<p class="mute" style="text-align:center;font-size:13px;color:var(--pri);margin-bottom:10px;">⏳ ${S.waitingCount} nuevo(s) jugador(es) esperando entrar en la siguiente ronda: <b>${esc(S.waitingNames.join(', '))}</b></p>`;
        }
        h += `<button class="pri" data-a="reveal">Finalizar y ver resultados</button><button class="sec" data-a="skip">Saltar pregunta (no cuenta)</button>`;
      }
    }
  } else if (S.phase === 'result') {
    const isDareRound = (S.res && S.res.target != null) || isDareMode(cf.mode);

    h += `<div class="dots">${[0, 1].map(i => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>`;

    if (isDareRound) {
      const r = S.res || {};
      const targetN = r.target != null ? r.target : S.targetPlayer;
      const targetName = nm(targetN);

      if (step === 0) {
        h += `
          <div style="text-align:center;font-size:12px;font-weight:800;letter-spacing:1.5px;color:var(--pri);margin-bottom:6px;text-transform:uppercase;">🎲 RESULTADO DEL RETO</div>
          <div class="mute" style="text-align:center;margin-bottom:14px;font-size:16px;line-height:1.4;">"${esc(S.q)}"</div>
        `;

        if (r.completed) {
          h += `
            <div class="win sm" style="background:rgba(16,185,129,0.18);border:2px solid var(--win);margin-bottom:14px;">
              <div class="big" style="color:#10b981;">🎉 ¡RETO SUPERADO! 🎉</div>
              <b>${targetName}</b> ha tenido valor y ha cumplido el reto (+1 punto para su marcador).
            </div>
          `;
        } else {
          h += `
            <div class="win sm" style="background:rgba(239,68,68,0.18);border:2px solid var(--danger);margin-bottom:14px;">
              <div class="big" style="color:#ef4444;">🐔 ¡SE HA RAJADO! 🐔</div>
              <b>${targetName}</b> no se ha atrevido a cumplir el reto.<br>¡Le toca beber o pagar castigo ante el grupo! 😈
            </div>
          `;
        }

        if (me === targetN) {
          h += r.completed
            ? `<div class="mine" style="text-align:center;color:var(--win);border-color:var(--win);margin-bottom:16px;">⭐ ¡Enhorabuena! Has sumado 1 punto a tu marcador</div>`
            : `<div class="mine" style="text-align:center;color:var(--danger);border-color:var(--danger);margin-bottom:16px;">🍺 ¡Te has rajado! Paga el trago o castigo ante el grupo</div>`;
        }

        h += `<h2>Marcador de retos</h2>`;
        h += [...ps].sort((a, b) => b.wins - a.wins || b.total - a.total).map(p => `
          <div class="rank" style="${p.n === targetN ? (r.completed ? 'border:1.5px solid var(--win);background:rgba(16,185,129,0.1);' : 'border:1.5px solid var(--danger);background:rgba(239,68,68,0.1);') : ''}">
            <span class="badge">${p.n}</span>
            <span>${esc(p.name)}${p.n === targetN ? (r.completed ? ' ⭐' : ' ❌') : ''}${p.n === me ? ' (tú)' : ''}</span>
            <span class="mute">🏆 ${p.wins}/${cf.target}</span>
          </div>
        `).join('');

        if (isHost && !S.champ) {
          h += `<button class="pri" data-a="next" style="margin-top:16px;">Siguiente reto para todos ›</button>`;
        }
      } else {
        const top = Math.max(0, ...ps.map(p => p.wins)), lsW = ps.filter(p => top > 0 && p.wins === top);
        h += `<h2>Clasificación general</h2>`;
        h += top
          ? `<div class="mine">👑 Va liderando <b>${lsW.map(p => esc(p.name)).join(' y ')}</b> con ${top} ${top > 1 ? 'retos completados' : 'reto completado'}</div>`
          : `<div class="mine">Todavía nadie ha completado un reto</div>`;
        h += ps.filter(p => p.wins > 0).sort((a, b) => b.wins - a.wins || b.total - a.total).map(p => `
          <div class="rank">
            <span class="badge">${p.n}</span>
            <span>${esc(p.name)}</span>
            <span class="mute">🏆 ${p.wins}/${cf.target}</span>
          </div>
        `).join('');
        if (S.champ) {
          h += `<div class="win" style="margin-top:16px"><div class="big">🏆 ${S.champ.map(nm).join(' y ')}</div>${S.champ.length > 1 ? 'llegan' : 'llega'} a ${cf.target} retos superados y ${S.champ.length > 1 ? 'ganan' : 'gana'} el juego!</div>`;
        }
      }
    } else {
      const hasTb = !!S.initialRes;
      const baseRes = hasTb ? S.initialRes : S.res;
      const r = S.res, ct = n => baseRes.counts[n] || 0, sorted = [...ps].sort((a, b) => ct(b.n) - ct(a.n));

      if (step === 0) {
        h += `<div class="mute" style="margin-bottom:12px;">${esc(S.q)}</div>`;
        if (hasTb) {
          const anyVote = mineInitV.length > 0 || mineTbV.length > 0;
          if (anyVote) {
            h += `<div class="mine">`;
            if (mineTbV.length) {
              h += `<div>⚔️ Te han votado en el desempate (<b>${mineTbV.length}</b>):</div><div class="players">${mineTbV.map(n => `<span class="chip"><b>${n}</b>${nm(n)}</span>`).join('')}</div>`;
            }
            if (mineInitV.length) {
              h += `<div style="color:var(--mute);font-size:15px;margin-top:${mineTbV.length ? '10px' : '0'}">🗳️ Votos de la primera votación (en gris):</div><div class="players">${mineInitV.map(n => `<span class="chip prev"><b>${n}</b>${nm(n)}</span>`).join('')}</div>`;
            }
            h += `</div>`;
          } else {
            h += `<div class="mine">Nadie te ha votado esta ronda 😅</div>`;
          }
        } else {
          h += mineV.length
            ? `<div class="mine">Te han votado <b>${mineV.length}</b> ${mineV.length > 1 ? 'personas' : 'persona'}</div><div class="players">${mineV.map(n => `<span class="chip"><b>${n}</b>${nm(n)}</span>`).join('')}</div>`
            : `<div class="mine">Nadie te ha votado esta ronda 😅</div>`;
        }
        h += `<h2>Resumen de la ronda</h2>`;
        if (hasTb) {
          h += r.winners.length
            ? `<div class="win sm"><div class="big">${r.winners.map(n => n + ' · ' + nm(n)).join('<br>')}</div>Gana la ronda tras el desempate con ${r.max} ${r.max > 1 ? 'votos' : 'voto'}</div>`
            : `<div class="win sm"><div class="big">Empate en el desempate</div>Nadie gana esta ronda</div>`;
          h += `<p class="mute" style="margin:4px 0 8px;font-size:14px">Votación general:</p>`;
        } else {
          h += r.max ? (r.winners.length ? `<div class="win sm"><div class="big">${r.winners.map(n => n + ' · ' + nm(n)).join('<br>')}</div>Gana la ronda con ${r.max} ${r.max > 1 ? 'votos' : 'voto'}</div>` : `<div class="win sm"><div class="big">Empate total</div>Nadie gana esta ronda</div>`) : `<div class="win sm"><div class="big">Nadie votó</div></div>`;
        }
        h += sorted.map(p => `
          <div class="bar">
            <span class="badge">${p.n}</span>
            <div class="t">
              <div class="f" style="width:${baseRes.max ? ct(p.n) / baseRes.max * 100 : 0}%"></div>
              <span>${esc(p.name)}${hasTb && S.initialRes.winners.includes(p.n) ? ' ⚔️' : ''}</span>
            </div>
            <span class="v">${ct(p.n)}</span>
          </div>
        `).join('');
      } else {
        const top = Math.max(0, ...ps.map(p => p.wins)), lsW = ps.filter(p => top > 0 && p.wins === top);
        h += `<h2>Clasificación general</h2>`;
        h += top
          ? `<div class="mine">👑 Va ganando <b>${lsW.map(p => esc(p.name)).join(' y ')}</b> con ${top} ${top > 1 ? 'rondas ganadas' : 'ronda ganada'}</div>`
          : `<div class="mine">Todavía nadie ha ganado una ronda</div>`;
        h += ps.filter(p => p.wins > 0).sort((a, b) => b.wins - a.wins || b.total - a.total).map(p => `
          <div class="rank">
            <span class="badge">${p.n}</span>
            <span>${esc(p.name)}</span>
            <span class="mute">🏆 ${p.wins}/${cf.target}</span>
          </div>
        `).join('');
        if (S.champ) {
          h += `<div class="win" style="margin-top:16px"><div class="big">🏆 ${S.champ.map(nm).join(' y ')}</div>${S.champ.length > 1 ? 'llegan' : 'llega'} a ${cf.target} rondas ganadas</div>`;
        }
      }
    }
    
    // Botones de navegación atrás / adelante
    h += `
      <div class="row nav">
        ${step > 0 ? `<button data-a="step" data-d="-1">‹ Ronda anterior</button>` : ''}
        ${step < 1 ? `<button class="pri" data-a="step" data-d="1">Ver clasificación ›</button>` : ''}
      </div>
    `;

    if (step === 1) {
      if (isHost) {
        if (S.champ) {
          h += `<button class="pri" data-a="end">Terminar partida</button>`;
        } else {
          h += cfgPanel(true);
          if (S.waitingCount > 0) {
            h += `<div class="mine" style="border:1.5px solid var(--pri);background:rgba(255,100,50,0.1);margin:12px 0;text-align:center;">👋 <b>${S.waitingCount}</b> jugador(es) en espera: <b>${esc(S.waitingNames.join(', '))}</b> (se incorporarán al pulsar siguiente)</div>`;
          }
          h += `
            <input id="cq" placeholder="${isDareRound ? 'Escribe tu propio reto (opcional)' : 'Escribe tu propia pregunta (opcional)'}" value="${esc(cq)}">
            <button class="pri" data-a="next">${isDareRound ? 'Siguiente reto para todos' : 'Siguiente pregunta para todos'}</button>
            <button class="sec btn-danger" data-a="end">Terminar partida ahora</button>
          `;
        }
      } else {
        h += `<p class="mute" style="text-align:center">${S.champ ? 'Fin de la partida…' : 'Esperando a que el anfitrión avance…'}</p>`;
      }
    }
  } else {
    const win = (S.champ && S.champ.length ? S.champ : [[...ps].sort((a, b) => b.wins - a.wins || b.total - a.total)[0].n]);
    h += `
      <div class="win"><div class="big">🏆 ${win.map(nm).join(' y ')}</div>${win.length > 1 ? 'ganan' : 'gana'} la partida</div>
      <h2>Clasificación final</h2>
    `;
    h += [...ps].filter(p => p.wins > 0).sort((a, b) => b.wins - a.wins || b.total - a.total).map(p => `
      <div class="rank">
        <span class="badge">${p.n}</span>
        <span>${esc(p.name)}</span>
        <span class="mute">🏆 ${p.wins}</span>
      </div>
    `).join('');
    if (isHost) {
      h += `<button class="pri" data-a="again" style="margin-top:16px">Nueva partida (mismos jugadores)</button>`;
    }
    h += `<button class="sec" data-a="leave" style="margin-top:8px">Volver al inicio</button>`;
  }

  const k = S.phase + S.round + '-' + step, y = window.scrollY || 0, changed = k !== lastKey;
  app.innerHTML = h;
  window.scrollTo(0, changed ? 0 : y);
  enter(k);
  
  const bk = S.phase === 'result' ? ((step === 0 || (step === 1 && S.champ)) ? k : '') : (S.phase === 'end' ? k : '');
  if (bk && bk !== lastBurst) {
    lastBurst = bk;
    burst(S.champ ? ['🏆', '🎉', '👑', '✨', '🔥'] : ['🎉', '✨', '⚡', '🌟']);
  }
  updTimer();
}

function updTimer() {
  if (!S) return;
  const tbcd = $('#tbcd');
  if (tbcd && S.tiebreakEnd) {
    const rem = Math.max(0, S.tiebreakEnd - Date.now());
    tbcd.textContent = Math.ceil(rem / 1000);
    if (rem <= 0) {
      S.tiebreakEnd = 0;
      render();
    }
  }
  if ((S.phase !== 'vote' && S.phase !== 'dare') || !S.timed) return;
  const tm = $('#tm'), tb = $('#tb');
  if (!tm || !tb) return;
  const l = Math.max(0, (S.endAt || 0) - Date.now());
  tm.textContent = '⏱ ' + Math.ceil(l / 1000) + ' s';
  tb.style.width = (S.cfg.secs ? l / (S.cfg.secs * 1000) * 100 : 0) + '%';
}

setInterval(updTimer, 250);

// ---------- Manejador de Clics ----------
app.addEventListener('click', e => {
  const b = e.target.closest('[data-a]');
  if (!b || b.disabled) return;
  const a = b.dataset.a, nmI = $('#nm');
  if (nmI) {
    myName = nmI.value.trim().slice(0, 14);
    ls.set('name', myName);
  }

  if (a === 'leave') return leaveGame();
  if (a === 'cancel-join') {
    busy = false;
    err = '';
    if (netClient) {
      try { netClient.end(true); } catch(e) {}
      netClient = null;
    }
    render();
    return;
  }
  if (a === 'clear-hash') {
    location.hash = '';
    render();
    return;
  }

  if (a === 'create' || a === 'join') {
    if (!myName) {
      err = 'Escribe tu nombre primero.';
      return render();
    }
    if (a === 'create') return createGame();
    const c = (b.dataset.c || ($('#cd') || {}).value || '').trim().toUpperCase();
    if (c.length !== 4) {
      err = 'El código tiene 4 letras.';
      return render();
    }
    return joinGame(c);
  }

  if (a === 'vote') return vote(+b.dataset.n);
  if (a === 'step') {
    step = Math.max(0, Math.min(1, step + (+b.dataset.d)));
    return render();
  }

  if (!isHost || !H) return;
  const d = +b.dataset.d;
  if (a === 'next') nextQ();
  else if (a === 'dare-ok') completeDare(true);
  else if (a === 'dare-fail') completeDare(false);
  else if (a === 'dare-reroll') rerollDarePlayer();
  else if (a === 'reveal') reveal();
  else if (a === 'skip') skipQ();
  else if (a === 'end') { H.phase = 'end'; H.deadline = 0; bc(); }
  else if (a === 'again') resetGame();
  else if (a === 'bots') toggleBots();
  else if (a === 'mode') { H.cfg.mode = b.dataset.m; bc(); }
  else if (a === 'tg') { H.cfg.target = Math.min(30, Math.max(1, H.cfg.target + d)); bc(); }
  else if (a === 'sc') { const i = TIMES.indexOf(H.cfg.secs); H.cfg.secs = TIMES[Math.min(TIMES.length - 1, Math.max(0, i + d))]; bc(); }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  keepAwake();
  if (netClient && (!netClient.connected || netClient.disconnected)) {
    try { netClient.reconnect(); } catch (e) {}
  }
});

// Reconectar si el móvil recupera cobertura o cambia entre WiFi y Datos
window.addEventListener('online', () => {
  keepAwake();
  if (netClient && (!netClient.connected || netClient.disconnected)) {
    try { netClient.reconnect(); } catch (e) {}
  } else if (code && !isHost && !S) {
    joinGame(code);
  }
});

app.addEventListener('input', e => {
  if (e.target.id === 'cq') cq = e.target.value;
});

window.addEventListener('beforeunload', e => {
  if (H || (S && S.phase !== 'lobby')) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// Inicializar la aplicación
render();
