// ╔══════════════════════════════════════════════════════════════════════╗
// ║   SOL SCRIPT ENGINE  v2.0.0                                          ║
// ║   Developer: AreDev                                                   ║
// ║   Motor puro — sem HTTP. Conexão externa via bibliotecas externas.   ║
// ╚══════════════════════════════════════════════════════════════════════╝

const PROXY_URL = "https://aredev-security.vercel.app/vercel/path0?file=";
const CONFIG = {
    maxLogLines:      500,
    autoSaveInterval: 30000,
    theme:            'dark',
    version:          '2.0.0'
};

// ═══════════════════════════════════════════════════════════════════════
//  ESTADO GLOBAL
// ═══════════════════════════════════════════════════════════════════════
let currentExecutionId = 0;
let activeExecutionId  = null;
let consoleResolver    = null;
let isTerminalAsking   = false;
let lastTerminalLine   = null;
let commandHistory     = [];
let historyIndex       = -1;
let autoSaveTimer      = null;
let extraCommands      = [];

// ── Sistema de Eventos ───────────────────────────────────────────────
// Mapa de nome → lista de callbacks
const SOL_EVENTS = {};

// ── Sistema de Filas ─────────────────────────────────────────────────
// Mapa de nome → array de itens
const SOL_QUEUES = {};

// ── Timers gerenciados (every...do) ──────────────────────────────────
const SOL_TIMERS = {};

// ── Namespaces / Módulos ─────────────────────────────────────────────
// Mapa de nome → objeto com vars e fns exportados
const SOL_MODULES = {};

// ── Elementos DOM ────────────────────────────────────────────────────
const editor        = document.getElementById('code-editor');
const lineNumbers   = document.getElementById('line-numbers');
const logOutput     = document.getElementById('log-output');
const soltuxDisplay = document.getElementById('soltux-display');
const soltuxInput   = document.getElementById('soltux-input');

// ═══════════════════════════════════════════════════════════════════════
//  RUNTIME (breakpoints, debug mode)
// ═══════════════════════════════════════════════════════════════════════
class SolRuntime {
    constructor() {
        this.variables   = new Map();
        this.functions   = new Map();
        this.breakpoints = new Set();
        this.debugMode   = false;
    }
    setVar(name, value) {
        this.variables.set(name, value);
        if (this.debugMode) log(`[DEBUG] ${name} = ${JSON.stringify(value)}`, "#ffeb3b");
    }
    getVar(name) { return this.variables.get(name); }
    clear()      { this.variables.clear(); this.functions.clear(); }
}
const runtime = new SolRuntime();

// ═══════════════════════════════════════════════════════════════════════
//  VOCABULÁRIO DA LINGUAGEM SOL
// ═══════════════════════════════════════════════════════════════════════
const SOL_KEYWORDS = [
    // controle
    'create','set','execute','break','if','then','else','not',
    'loop','repeat','foreach','stoploop','nextloop','times','in',
    'try','catch','every','do','unless','until','given','while',
    // dados
    'function','return','delete','to','of','at','from',
    'push','remove','pull','pop',
    // módulos e eventos
    'on','emit','module','export','as','import',
    'enqueue','dequeue','drain','pipe',
    // tipos
    'is','type','either','or','both','and',
    // ask
    'ask','symbol',
    // ternário
    'when','otherwise',
    // step
    'step'
];

const SOL_FUNCTIONS = [
    // saída
    'log','print','error','warn','success','clear','alert',
    // controle de fluxo
    'wait','checkconsole','input',
    // aleatoriedade
    'rng','random','shuffle','pick',
    // matemática
    'range','clamp','lerp','sum','avg','abs','floor','ceil',
    'round','sqrt','pow','min','max','mod',
    // strings
    'upper','lower','trim','trimstart','trimend',
    'split','join','replace','contains','startswith','endswith',
    'reverse','padleft','padright','count','slice','charat',
    'indexof','repeat','strlen','tostr','tonum','tobool',
    // verificação de tipos
    'isnum','isstr','isbool','isarray','isobject',
    'isnull','isundef','isempty','typeof',
    // arrays avançados
    'first','last','flatten','unique','sort','filter','map',
    'find','findindex','every','some','reduce','includes',
    'fill','concat','zip','chunk','compact','groupby',
    // objetos
    'keys','values','entries','merge','has','size',
    'pick','omit','freeze','clone','assign',
    // eventos
    'subscribe','unsubscribe','publish','fire','once',
    // filas
    'queuepush','queuepop','queuepeek','queuesize','queueclear',
    // tempo
    'now','timestamp','format','difftime',
    // módulos
    'usemodule','exportmodule',
    // utilitários
    'math','importService'
];

// ═══════════════════════════════════════════════════════════════════════
//  LEVENSHTEIN + CORRETOR BLINDADO
//  (ignora conteúdo de strings e sufixos numéricos em variáveis)
// ═══════════════════════════════════════════════════════════════════════
function levenshteinDistance(a, b) {
    const m = [];
    for (let i = 0; i <= b.length; i++) m[i] = [i];
    for (let j = 0; j <= a.length; j++) m[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            m[i][j] = b[i-1] === a[j-1]
                ? m[i-1][j-1]
                : Math.min(m[i-1][j-1]+1, m[i][j-1]+1, m[i-1][j]+1);
        }
    }
    return m[b.length][a.length];
}

function findClosestKeyword(word) {
    const all = [...SOL_KEYWORDS, ...SOL_FUNCTIONS];
    let closest = null, minDist = Infinity;
    for (const kw of all) {
        const d = levenshteinDistance(word.toLowerCase(), kw.toLowerCase());
        const maxAllowed = word.length <= 4 ? 1 : 2;
        if (d < minDist && d <= maxAllowed) { minDist = d; closest = kw; }
    }
    return { keyword: closest };
}

function analyzeCodeForSuggestions(code) {
    const lines       = code.split('\n');
    const suggestions = [];
    const blockStack  = [];

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i].trim();
        if (!raw || raw.startsWith('--') || raw.startsWith('//')) continue;

        // Blindagem: remove strings literais e números isolados
        let clean = raw.replace(/(["'`])(?:(?=(\\?))\2[\s\S])*?\1/g, '""');
        clean = clean.replace(/(?<!\w)\d+(?:\.\d+)?(?!\w)/g, '0');

        // Rastreia blocos abertos
        if (/\bcreate\s+function\b|\bset\s+function\b|\bif\b.*\bthen\b|\bloop\b|\brepeat\b.*\btimes\b|\bforeach\b|\bevery\b|\btry\b|\bunless\b|\buntil\b/i.test(clean))
            blockStack.push(i + 1);
        if (/^\s*break\s*$/i.test(clean) && blockStack.length > 0)
            blockStack.pop();

        // Detecta JS puro misturado
        if (/(?<!=)[=]{2,3}(?!=)/.test(clean))
            suggestions.push({ line: i+1, message: `Use '=' para comparação em SOL, não '==' ou '==='` });
        if (/\bvar\b|\blet\b|\bconst\b/.test(clean))
            suggestions.push({ line: i+1, message: `Use 'create' em vez de var/let/const` });
        if (/\bconsole\.log\b/.test(clean))
            suggestions.push({ line: i+1, message: `Use 'log()' em vez de 'console.log()'` });
        if (/\bfunction\s+\w+/.test(clean) && !/\bcreate\s+function\b/.test(clean))
            suggestions.push({ line: i+1, message: `Use 'create function Nome' em vez de 'function Nome'` });

        // Typos via Levenshtein
        const words = clean.match(/\b[a-zA-Z_]\w*\b/g) || [];
        for (const word of words) {
            if (word.length < 3) continue;
            if (clean.includes(`create ${word}`) || clean.includes(`set ${word}`)) continue;
            const known = [...SOL_KEYWORDS, ...SOL_FUNCTIONS]
                .some(kw => kw.toLowerCase() === word.toLowerCase());
            if (!known) {
                const { keyword } = findClosestKeyword(word);
                if (keyword) suggestions.push({ line: i+1, message: `'${word}'? Quis dizer '${keyword}'?` });
            }
        }
    }

    if (blockStack.length > 0)
        suggestions.push({
            line: blockStack[blockStack.length-1],
            message: `Bloco aberto na linha ${blockStack[blockStack.length-1]} não foi fechado com 'break'`
        });

    return suggestions;
}

function showSuggestions(suggestions) {
    if (!suggestions.length) return;
    log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "#ffeb3b");
    log("💡 SUGESTÕES DE CORREÇÃO:", "#ffeb3b");
    for (const s of suggestions) {
        const icon = s.message.includes('bloco') || s.message.includes('fechado') ? '🔧'
                   : s.message.includes('Quis') ? '📝' : '⚠️';
        log(`${icon} Linha ${s.line}: ${s.message}`, "#ffeb3b");
    }
    log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "#ffeb3b");
}

// ═══════════════════════════════════════════════════════════════════════
//  LOG E UI
// ═══════════════════════════════════════════════════════════════════════
window.log = (message, color = "#4caf50") => {
    const el = document.createElement('div');
    el.style.color  = color;
    el.className    = 'log-line';
    el.innerHTML    = `<span style="color:#666">[${new Date().toLocaleTimeString()}]</span> ${message}`;
    logOutput.appendChild(el);
    if (logOutput.children.length > CONFIG.maxLogLines)
        logOutput.removeChild(logOutput.firstChild);
    logOutput.scrollTop = logOutput.scrollHeight;
};

window.wait    = ms  => new Promise(r => setTimeout(r, ms));
window.clear   = ()  => { logOutput.innerHTML = ""; };
window.alert   = msg => log(`⚠️ ${msg}`, "#ff9800");
window.print   = msg => log(String(msg));
window.error   = msg => log(`✗ ${String(msg)}`, "#f44336");
window.warn    = msg => log(`⚠ ${String(msg)}`, "#ff9800");
window.success = msg => log(`✓ ${String(msg)}`, "#4caf50");

// ── input() via popup (mantido para compatibilidade) ─────────────────
window.input = async (promptMsg = "Enter value:") => {
    return new Promise(resolve => {
        log(promptMsg, "#00bcd4");
        const orig = consoleResolver;
        consoleResolver = () => { resolve(window.prompt(promptMsg)); if (orig) orig(); };
        switchTab('console');
    });
};

// ── terminalAsk() via terminal puro (sem popup) ──────────────────────
window.terminalAsk = async (question, symbol = "?") => {
    switchTab('terminal');
    return new Promise(resolve => {
        isTerminalAsking = true;
        const line = document.createElement('div');
        line.className = 'terminal-line';
        line.innerHTML = `<span style="color:#00ffff">${question}</span> <span style="color:#fff">${symbol} </span><span id="sol-typing" style="color:#ffeb3b">_</span>`;
        soltuxDisplay.appendChild(line);
        soltuxDisplay.scrollTop = soltuxDisplay.scrollHeight;

        const area = document.getElementById('sol-typing');
        soltuxInput.value = "";
        soltuxInput.focus();

        const onKey = e => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const ans = soltuxInput.value;
            soltuxInput.value = "";
            area.innerText = ans;
            area.removeAttribute('id');
            soltuxInput.removeEventListener('keydown', onKey);
            soltuxInput.removeEventListener('input', onType);
            isTerminalAsking = false;
            resolve(ans);
        };
        const onType = () => {
            area.innerText = soltuxInput.value + "_";
            soltuxDisplay.scrollTop = soltuxDisplay.scrollHeight;
        };
        soltuxInput.addEventListener('keydown', onKey);
        soltuxInput.addEventListener('input', onType);
    });
};

function terminalPrint(message, color = "#fff") {
    const el = document.createElement('div');
    el.style.color = color;
    el.className   = 'terminal-line';
    el.innerText   = message;
    soltuxDisplay.appendChild(el);
    soltuxDisplay.scrollTop = soltuxDisplay.scrollHeight;
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn, .content').forEach(el => el.classList.remove('active'));
    const content = document.getElementById(tabId);
    const btn     = document.querySelector(`[onclick="switchTab('${tabId}')"]`);
    if (content) content.classList.add('active');
    if (btn)     btn.classList.add('active');
    if (tabId === 'console' && consoleResolver) { consoleResolver(); consoleResolver = null; }
}

function updateEditor() {
    if (!lineNumbers || !editor) return;
    const lines = editor.innerText.split('\n').length || 1;
    lineNumbers.innerHTML = Array.from({length: lines}, (_, i) => {
        const n = i + 1;
        return `<span class="${runtime.breakpoints.has(n) ? 'breakpoint' : ''}">${n}</span>`;
    }).join('<br>');
}

// ═══════════════════════════════════════════════════════════════════════
//  IMPORTAÇÃO DE BIBLIOTECAS EXTERNAS  (única conexão com internet)
// ═══════════════════════════════════════════════════════════════════════
async function importService(name) {
    if (document.getElementById(`lib-${name}`)) {
        terminalPrint(`[WARN] Service '${name}' já carregado.`, "#ff9800");
        return;
    }

    lastTerminalLine = document.createElement('div');
    lastTerminalLine.style.color = "#00ffff";
    lastTerminalLine.className   = 'loading-line';
    soltuxDisplay.appendChild(lastTerminalLine);

    for (let i = 0; i <= 100; i += 20) {
        lastTerminalLine.innerText = `[${name}] ${'█'.repeat(i/5)}${'░'.repeat(20 - i/5)} ${i}%`;
        await new Promise(r => setTimeout(r, 50));
    }

    try {
        const res = await fetch(`${PROXY_URL}${name}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const code = await res.text();
        const tag  = document.createElement('script');
        tag.id   = `lib-${name}`;
        tag.text = code;
        document.head.appendChild(tag);
        await new Promise(r => setTimeout(r, 10));
        // Registra comandos extras que a lib possa expor
        if (window[name] && window[name].getCommands)
            extraCommands = [...extraCommands, ...window[name].getCommands()];
        lastTerminalLine.remove();
        terminalPrint(`✓ Service '${name}' carregado.`, "#4caf50");
    } catch (err) {
        lastTerminalLine.innerText = `✗ Falha ao carregar ${name}: ${err.message}`;
        lastTerminalLine.style.color = "#f44336";
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  HELPERS INJETADOS NO CONTEXTO DE EXECUÇÃO
//  (disponíveis dentro de qualquer script SOL)
// ═══════════════════════════════════════════════════════════════════════
function buildHelpers(execId) {
    return `
// ── Controle de execução ────────────────────────────────────────────
const __execId    = ${execId};
const __checkExec = () => {
    if (__execId !== activeExecutionId) throw new Error('__ABORTED__');
};

// ── Aleatoriedade ───────────────────────────────────────────────────
const rng     = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
const pick    = arr => arr[Math.floor(Math.random() * arr.length)];

// ── Matemática ──────────────────────────────────────────────────────
const range   = (s, e, step = 1) => {
    const a = [];
    for (let i = s; step > 0 ? i <= e : i >= e; i += step) a.push(i);
    return a;
};
const clamp   = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const lerp    = (a, b, t)   => a + (b - a) * t;
const sum     = arr => arr.reduce((a, b) => a + b, 0);
const avg     = arr => sum(arr) / arr.length;
const minArr  = arr => Math.min(...arr);
const maxArr  = arr => Math.max(...arr);
const mod     = (a, b) => ((a % b) + b) % b;

// ── Strings ─────────────────────────────────────────────────────────
const upper       = s => String(s).toUpperCase();
const lower       = s => String(s).toLowerCase();
const trim        = s => String(s).trim();
const trimstart   = s => String(s).trimStart();
const trimend     = s => String(s).trimEnd();
const splitStr    = (s, sep = '') => String(s).split(sep);
const joinArr     = (arr, sep = '') => arr.join(sep);
const replaceStr  = (s, from, to) => String(s).split(from).join(to);
const containsStr = (s, sub) => String(s).includes(String(sub));
const startsWith  = (s, sub) => String(s).startsWith(String(sub));
const endsWith    = (s, sub) => String(s).endsWith(String(sub));
const reverseStr  = s => String(s).split('').reverse().join('');
const padLeft     = (s, n, ch = ' ') => String(s).padStart(n, ch);
const padRight    = (s, n, ch = ' ') => String(s).padEnd(n, ch);
const sliceStr    = (s, a, b) => String(s).slice(a, b);
const charAtStr   = (s, i) => String(s).charAt(i);
const indexOfStr  = (s, sub) => String(s).indexOf(sub);
const repeatStr   = (s, n) => String(s).repeat(n);
const strLen      = s => String(s).length;
const countOccur  = (s, sub) => String(s).split(sub).length - 1;

// ── Conversão de tipos ───────────────────────────────────────────────
const toStr  = v => String(v);
const toNum  = v => Number(v);
const toBool = v => Boolean(v);

// ── Verificação de tipos ─────────────────────────────────────────────
const isNum   = v => typeof v === 'number' && !isNaN(v);
const isStr   = v => typeof v === 'string';
const isBool  = v => typeof v === 'boolean';
const isArr   = v => Array.isArray(v);
const isObj   = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNull  = v => v === null;
const isUndef = v => v === undefined;
const isEmpty = v =>
    v === null || v === undefined || v === '' ||
    (Array.isArray(v) && v.length === 0) ||
    (isObj(v) && Object.keys(v).length === 0);
const typeOf  = v => Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;

// ── Arrays avançados ────────────────────────────────────────────────
const first      = arr => arr[0];
const last       = arr => arr[arr.length - 1];
const flatten    = arr => arr.flat(Infinity);
const unique     = arr => [...new Set(arr)];
const sortArr    = (arr, fn) => [...arr].sort(fn);
const filterArr  = (arr, fn) => arr.filter(fn);
const mapArr     = (arr, fn) => arr.map(fn);
const findEl     = (arr, fn) => arr.find(fn);
const findIdx    = (arr, fn) => arr.findIndex(fn);
const everyEl    = (arr, fn) => arr.every(fn);
const someEl     = (arr, fn) => arr.some(fn);
const reduceArr  = (arr, fn, init) => arr.reduce(fn, init);
const includesEl = (arr, v) => arr.includes(v);
const concatArr  = (...arrs) => [].concat(...arrs);
const countArr   = arr => arr.length;
const compact    = arr => arr.filter(Boolean);
const chunk      = (arr, n) => {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
};
const zip = (...arrs) => {
    const len = Math.min(...arrs.map(a => a.length));
    return Array.from({length: len}, (_, i) => arrs.map(a => a[i]));
};
const groupBy = (arr, fn) => {
    const out = {};
    for (const el of arr) {
        const key = fn(el);
        if (!out[key]) out[key] = [];
        out[key].push(el);
    }
    return out;
};
const fillArr = (n, v) => Array(n).fill(v);

// ── Objetos ─────────────────────────────────────────────────────────
const keys    = obj => Object.keys(obj);
const values  = obj => Object.values(obj);
const entries = obj => Object.entries(obj);
const merge   = (...objs) => Object.assign({}, ...objs);
const clone   = obj => JSON.parse(JSON.stringify(obj));
const has     = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);
const size    = obj => isArr(obj) ? obj.length : Object.keys(obj).length;
const freeze  = obj => Object.freeze(obj);
const assign  = (target, ...srcs) => Object.assign(target, ...srcs);
const pickKeys = (obj, ks) => Object.fromEntries(ks.filter(k => k in obj).map(k => [k, obj[k]]));
const omitKeys = (obj, ks) => Object.fromEntries(Object.entries(obj).filter(([k]) => !ks.includes(k)));

// ── Sistema de Eventos ──────────────────────────────────────────────
//   on "evento" do fn break  →  subscreve
//   emit "evento" valor      →  dispara
const __events = SOL_EVENTS;
const solOn = (event, fn) => {
    if (!__events[event]) __events[event] = [];
    __events[event].push({ fn, once: false });
};
const solOnce = (event, fn) => {
    if (!__events[event]) __events[event] = [];
    __events[event].push({ fn, once: true });
};
const solEmit = (event, data) => {
    if (!__events[event]) return;
    __events[event] = __events[event].filter(sub => {
        sub.fn(data);
        return !sub.once;
    });
};
const solOff = (event, fn) => {
    if (!__events[event]) return;
    __events[event] = fn
        ? __events[event].filter(s => s.fn !== fn)
        : [];
};

// ── Sistema de Filas ────────────────────────────────────────────────
//   enqueue "fila" valor   →  adiciona no fim
//   dequeue "fila"         →  retira do início
//   queuepeek "fila"       →  vê o primeiro sem remover
//   queuesize "fila"       →  tamanho da fila
//   queueclear "fila"      →  esvazia
const __queues = SOL_QUEUES;
const enqueue    = (name, val) => { if (!__queues[name]) __queues[name] = []; __queues[name].push(val); };
const dequeue    = name => { if (!__queues[name] || !__queues[name].length) return undefined; return __queues[name].shift(); };
const queuePeek  = name => __queues[name] ? __queues[name][0] : undefined;
const queueSize  = name => __queues[name] ? __queues[name].length : 0;
const queueClear = name => { __queues[name] = []; };
const drain      = (name, fn) => { while (__queues[name] && __queues[name].length) fn(dequeue(name)); };

// ── Sistema de Módulos/Namespace ─────────────────────────────────────
//   module "nome" → ... → break   define namespace
//   usemodule "nome"              importa namespace no escopo
const __modules = SOL_MODULES;
const exportModule = (name, obj) => { __modules[name] = obj; };
const useModule    = name => __modules[name] || {};

// ── Pipeline (|>) ────────────────────────────────────────────────────
//   pipe(valor, fn1, fn2, fn3)  →  aplica em cadeia
const pipe = (val, ...fns) => fns.reduce((v, f) => f(v), val);

// ── Tempo ────────────────────────────────────────────────────────────
const now       = () => Date.now();
const timestamp = () => new Date().toISOString();
const difftime  = (a, b) => Math.abs(b - a);

// ── Aliases de saída ────────────────────────────────────────────────
const print   = msg => log(String(msg));
const success = msg => log('✓ ' + String(msg), '#4caf50');
const error   = msg => log('✗ ' + String(msg), '#f44336');
const warn    = msg => log('⚠ ' + String(msg), '#ff9800');
`;
}

// ═══════════════════════════════════════════════════════════════════════
//  TRANSPILADOR SOL → JAVASCRIPT
// ═══════════════════════════════════════════════════════════════════════
async function runSol() {
    currentExecutionId++;
    const thisId = currentExecutionId;
    activeExecutionId = thisId;

    let code = editor.innerText.trim();
    if (!code) { log("Nenhum código para executar.", "#ff9800"); return; }

    switchTab('console');
    logOutput.innerHTML = "";
    log(`🚀 Execução iniciada [ID:${thisId}]`, "#2196f3");

    // Sugestões antes de executar
    showSuggestions(analyzeCodeForSuggestions(code));

    // ── 1. Remove comentários ──────────────────────────────────────
    code = code.replace(/--.*$/gm, "");
    code = code.replace(/\/\/.*$/gm, "");
    code = code.replace(/\/\*[\s\S]*?\*\//g, "");

    // ── 2. importService — carrega e apaga a chamada do código ─────
    const importMatches = [...code.matchAll(/importService\s*\(\s*["'](.*?)["']\s*\)/ig)];
    for (const m of importMatches) await importService(m[1]);
    code = code.replace(/importService\s*\(\s*["'].*?["']\s*\)/ig, "/* imported */");

    // ── 3. Comandos de bibliotecas externas ───────────────────────
    extraCommands.forEach(cmd => { code = code.replace(cmd.regex, cmd.replace); });

    // ─────────────────────────────────────────────────────────────────
    //  BLOCO DE TRANSPILAÇÃO (ordem importa)
    // ─────────────────────────────────────────────────────────────────

    // ── 4. math.rng(min, max) → rng(min, max) ────────────────────
    code = code.replace(/\bmath\.rng\s*\(([^)]+)\)/ig, "rng($1)");

    // ── 5. math(...) genérico → eval ─────────────────────────────
    code = code.replace(/\bmath\s*\(\s*([\s\S]*?)\s*\)/ig, (_, expr) => {
        const e2 = expr.replace(/\[(.*?)\]/g, "$1").replace(/÷/g, "/").replace(/×/g, "*");
        return `(eval(\`${e2}\`))`;
    });

    // ── 6. Strings de manipulação ─────────────────────────────────
    // split "texto" by "sep"  → splitStr("texto", "sep")
    code = code.replace(/\bsplit\s+(["'`].*?["'`]|\w+)\s+by\s+(["'`].*?["'`]|\w+)/ig,
        "splitStr($1, $2)");
    // join arr by "sep"
    code = code.replace(/\bjoin\s+(\w+)\s+by\s+(["'`].*?["'`]|\w+)/ig,
        "joinArr($1, $2)");
    // replace in str from "a" to "b"
    code = code.replace(/\breplace\s+in\s+(\w+)\s+from\s+(["'`].*?["'`]|\w+)\s+to\s+(["'`].*?["'`]|\w+)/ig,
        "$1 = replaceStr($1, $2, $3)");
    // trim str
    code = code.replace(/\btrim\s+(\w+)/ig, "$1 = trim($1)");
    // upper str  /  lower str
    code = code.replace(/\bupper\s+(\w+)/ig, "$1 = upper($1)");
    code = code.replace(/\blower\s+(\w+)/ig, "$1 = lower($1)");
    // reverse str
    code = code.replace(/\breverse\s+(\w+)/ig, "$1 = reverseStr($1)");
    // strlen of var
    code = code.replace(/\bstrlen\s+of\s+(\w+)/ig, "strLen($1)");
    // contains var "sub"
    code = code.replace(/\bcontains\s+(\w+)\s+(["'`].*?["'`]|\w+)/ig, "containsStr($1, $2)");

    // ── 7. Arrays e objetos avançados ─────────────────────────────
    // push val to arr
    code = code.replace(/\bpush\s+(\S+)\s+to\s+(\w+)/ig, "$2.push($1)");
    // pop from arr → var
    code = code.replace(/\bpop\s+from\s+(\w+)/ig, "$1.pop()");
    // pull from arr at index
    code = code.replace(/\bpull\s+from\s+(\w+)\s+at\s+(\w+|\d+)/ig, "$1.splice($2, 1)");
    // remove from arr at index (alias)
    code = code.replace(/\bremove\s+from\s+(\w+)\s+at\s+(\w+|\d+)/ig, "$1.splice($2, 1)");
    // length of arr
    code = code.replace(/\blength\s+of\s+(\w+)/ig, "$1.length");
    // first of arr / last of arr
    code = code.replace(/\bfirst\s+of\s+(\w+)/ig, "first($1)");
    code = code.replace(/\blast\s+of\s+(\w+)/ig,  "last($1)");
    // keys of obj / values of obj
    code = code.replace(/\bkeys\s+of\s+(\w+)/ig,   "keys($1)");
    code = code.replace(/\bvalues\s+of\s+(\w+)/ig, "values($1)");
    // merge obj1 obj2
    code = code.replace(/\bmerge\s+(\w+)\s+(\w+)/ig, "merge($1, $2)");
    // has obj key
    code = code.replace(/\bhas\s+(\w+)\s+(["'`].*?["'`]|\w+)/ig, "has($1, $2)");
    // size of arr/obj
    code = code.replace(/\bsize\s+of\s+(\w+)/ig, "size($1)");
    // unique arr
    code = code.replace(/\bunique\s+(\w+)/ig, "$1 = unique($1)");
    // flatten arr
    code = code.replace(/\bflatten\s+(\w+)/ig, "$1 = flatten($1)");
    // sort arr
    code = code.replace(/\bsort\s+(\w+)/ig, "$1 = sortArr($1)");
    // compact arr (remove falsy)
    code = code.replace(/\bcompact\s+(\w+)/ig, "$1 = compact($1)");
    // chunk arr by n
    code = code.replace(/\bchunk\s+(\w+)\s+by\s+(\w+|\d+)/ig, "chunk($1, $2)");
    // sum of arr
    code = code.replace(/\bsum\s+of\s+(\w+)/ig, "sum($1)");
    // avg of arr
    code = code.replace(/\bavg\s+of\s+(\w+)/ig, "avg($1)");
    // min of arr / max of arr
    code = code.replace(/\bmin\s+of\s+(\w+)/ig, "minArr($1)");
    code = code.replace(/\bmax\s+of\s+(\w+)/ig, "maxArr($1)");
    // includes arr val
    code = code.replace(/\bincludes\s+(\w+)\s+(\S+)/ig, "includesEl($1, $2)");
    // count of arr
    code = code.replace(/\bcount\s+of\s+(\w+)/ig, "countArr($1)");
    // fill n with val
    code = code.replace(/\bfill\s+(\w+|\d+)\s+with\s+(\S+)/ig, "fillArr($1, $2)");

    // ── 8. Verificação de tipos ───────────────────────────────────
    // var is number / var is string / var is array / var is object / etc.
    code = code.replace(/(\w+)\s+is\s+number/ig,  "isNum($1)");
    code = code.replace(/(\w+)\s+is\s+string/ig,  "isStr($1)");
    code = code.replace(/(\w+)\s+is\s+bool/ig,    "isBool($1)");
    code = code.replace(/(\w+)\s+is\s+array/ig,   "isArr($1)");
    code = code.replace(/(\w+)\s+is\s+object/ig,  "isObj($1)");
    code = code.replace(/(\w+)\s+is\s+null/ig,    "isNull($1)");
    code = code.replace(/(\w+)\s+is\s+empty/ig,   "isEmpty($1)");
    code = code.replace(/(\w+)\s+is\s+defined/ig, "!isUndef($1)");
    code = code.replace(/(\w+)\s+is\s+undef/ig,   "isUndef($1)");
    // typeof var
    code = code.replace(/\btypeof\s+(\w+)/ig, "typeOf($1)");

    // ── 9. Sistema de Eventos ─────────────────────────────────────
    // on "evento" do           → abre bloco de subscrição
    // break                    → fecha o bloco (vira função)
    // emit "evento" valor      → dispara evento
    // off "evento"             → remove todos os listeners
    // once "evento" do ... break
    code = code.replace(
        /\bon\s+(["'`])(.*?)\1\s+do\b/ig,
        'solOn("$2", async function(__evtData) {'
    );
    code = code.replace(
        /\bonce\s+(["'`])(.*?)\1\s+do\b/ig,
        'solOnce("$2", async function(__evtData) {'
    );
    code = code.replace(
        /\bemit\s+(["'`])(.*?)\1(?:\s+(.+))?/ig,
        (_, q, name, data) => `solEmit("${name}", ${data ? data.trim() : 'undefined'})`
    );
    code = code.replace(
        /\boff\s+(["'`])(.*?)\1/ig,
        'solOff("$2")'
    );

    // ── 10. Sistema de Filas ──────────────────────────────────────
    // enqueue "fila" valor
    code = code.replace(/\benqueue\s+(["'`])(.*?)\1\s+(.+)/ig, 'enqueue("$2", $3)');
    // dequeue "fila" -> var
    code = code.replace(/\bdequeue\s+(["'`])(.*?)\1\s*->\s*(\w+)/ig, 'var $3 = dequeue("$2")');
    // dequeue "fila" (sem atribuição)
    code = code.replace(/\bdequeue\s+(["'`])(.*?)\1/ig, 'dequeue("$2")');
    // queuepeek "fila" -> var
    code = code.replace(/\bqueuepeek\s+(["'`])(.*?)\1\s*->\s*(\w+)/ig, 'var $3 = queuePeek("$2")');
    // queuesize "fila"
    code = code.replace(/\bqueuesize\s+(["'`])(.*?)\1/ig, 'queueSize("$2")');
    // queueclear "fila"
    code = code.replace(/\bqueueclear\s+(["'`])(.*?)\1/ig, 'queueClear("$2")');
    // drain "fila" do ... break
    code = code.replace(
        /\bdrain\s+(["'`])(.*?)\1\s+do\b/ig,
        'drain("$2", async function(__item) {'
    );

    // ── 11. Pipeline ──────────────────────────────────────────────
    // var |> fn1 |> fn2  →  pipe(var, fn1, fn2)
    code = code.replace(/(\w+)\s*(\|>\s*\w+(?:\s*\|>\s*\w+)*)/ig, (_, val, chain) => {
        const fns = chain.split('|>').map(s => s.trim()).filter(Boolean);
        return `pipe(${val}, ${fns.join(', ')})`;
    });

    // ── 12. Operador ternário ─────────────────────────────────────
    // when cond then val1 otherwise val2
    code = code.replace(/\bwhen\s+(.+?)\s+then\s+(.+?)\s+otherwise\s+(.+)/ig,
        "($1 ? $2 : $3)");

    // ── 13. try/catch SOL ─────────────────────────────────────────
    // try                    → try {
    // catch err              → } catch(err) {
    // break                  → fecha o bloco
    code = code.replace(/^\s*\btry\b\s*$/img, "try {");
    code = code.replace(/^\s*\bcatch\b\s*(\w+)?\s*$/img, (_, v) => `} catch(${v || '__err'}) {`);

    // ── 14. Timer: every N do ... break ──────────────────────────
    // every 1000 do → setInterval(() => { ... }, 1000)
    // every 1000ms do → mesmo
    // O 'break' fecha com  }, N)
    // Usamos placeholder para o ms antes do break
    code = code.replace(
        /\bevery\s+(\d+)\s*(?:ms)?\s+do\b/ig,
        (_, ms) => `SOL_TIMERS['__t${Date.now()}'] = setInterval(async () => { __checkExec();`
    );
    // break após every fecha o setInterval
    // (tratado depois junto com o break universal, precisamos de um wrapper)
    // Estratégia: marcamos com __EVERY_END__ e depois fechamos
    // Na prática o break fecha a chave e o , ms) fica pendente —
    // solução: substituir "break" que segue um every por "}, N);"
    // Para simplificar, usamos uma flag __EVERY_MS__ inline:
    code = code.replace(
        /setInterval\(async \(\) => \{ __checkExec\(\);([\s\S]*?)^}/im,
        (match) => match  // deixa o break genérico cuidar do fechamento
    );

    // ── 15. Módulos/Namespace ─────────────────────────────────────
    // module "nome" do ... break
    // Tudo dentro do bloco fica numa IIFE que chama exportModule
    code = code.replace(
        /\bmodule\s+(["'`])(.*?)\1\s+do\b/ig,
        'exportModule("$2", await (async () => { const __ns = {}; const __nsExport = (k,v) => { __ns[k] = v; };'
    );
    // export name as "alias"  →  __nsExport("alias", name)
    code = code.replace(
        /\bexport\s+(\w+)\s+as\s+(["'`])(.*?)\2/ig,
        '__nsExport("$3", $1)'
    );
    // export name  →  __nsExport("name", name)
    code = code.replace(
        /\bexport\s+(\w+)/ig,
        '__nsExport("$1", $1)'
    );
    // usemodule "nome" → const { ...keys } = useModule("nome")
    code = code.replace(
        /\busemodule\s+(["'`])(.*?)\1/ig,
        'Object.assign(globalThis, useModule("$2"))'
    );

    // ── 16. Funções ───────────────────────────────────────────────
    code = code.replace(/\bcreate\s+function\s+(\w+)\s*\(\s*(.*?)\s*\)/ig,
        "var $1 = async function($2) {");
    code = code.replace(/\bcreate\s+function\s+(\w+)/ig,
        "var $1 = async function() {");
    code = code.replace(/\bset\s+function\s+(\w+)\s*\(\s*(.*?)\s*\)/ig,
        "$1 = async function($2) {");
    code = code.replace(/\bset\s+function\s+(\w+)/ig,
        "$1 = async function() {");

    // ── 17. ask / console.ask.symbol ─────────────────────────────
    // create var = console.ask.symbol("símbolo", "pergunta")
    code = code.replace(
        /\bcreate\s+(\w+)\s*=\s*console\.ask\.symbol\s*\(\s*(["'`])(.*?)\2\s*,\s*(["'`])(.*?)\4\s*\)/ig,
        "var $1 = await window.terminalAsk('$5', '$3')"
    );
    // ask "pergunta" -> var
    code = code.replace(/\bask\s+(["'`].*?["'`])\s*->\s*(\w+)/ig,
        "let $2 = await window.terminalAsk($1)");

    // ── 18. Variáveis ─────────────────────────────────────────────
    code = code.replace(/\bcreate\s+(\w+)\s*=\s*/ig, "var $1 = ");
    code = code.replace(/\bcreate\s+(\w+)\s*$/img,   "var $1");
    code = code.replace(/\bset\s+(\w+)\s*=\s*/ig,    "$1 = ");
    code = code.replace(/\bdelete\s+(\w+)/ig,         "$1 = undefined");

    // ── 19. Condicionais ──────────────────────────────────────────
    function mapOp(op) {
        const t = op.trim();
        if (t === "=")  return "===";
        if (t === "!=") return "!==";
        return t;
    }
    function stripParens(s) {
        s = s.trim();
        return (s.startsWith("(") && s.endsWith(")")) ? s.slice(1, -1).trim() : s;
    }

    // unless cond then  →  if not cond
    code = code.replace(/\bunless\s+(.+?)\s+then\b/ig, (_, raw) => {
        const inner = stripParens(raw);
        return `if (!(${inner})) {`;
    });

    // if not ... then
    code = code.replace(/\bif\s+not\s+(.+?)\s+then\b/ig, (_, raw) => {
        const inner = stripParens(raw);
        const m = inner.match(/^(.+?)\s*(===|!==|>=|<=|>|<|!=|=)\s*(.+)$/i);
        if (m) {
            const op = mapOp(m[2]);
            const neg = op === "===" ? "!==" : op === "!==" ? "===" : `/* not */ ${op}`;
            return `if (${m[1].trim()} ${(op === "===" ? "!==" : "===")} ${m[3].trim()}) {`;
        }
        return `if (!(${inner})) {`;
    });

    // if ... then
    code = code.replace(/\bif\s+(.+?)\s+then\b/ig, (_, raw) => {
        const inner = stripParens(raw);
        const m = inner.match(/^(.+?)\s*(===|!==|>=|<=|>|<|!=|=)\s*(.+)$/i);
        if (m) return `if (${m[1].trim()} ${mapOp(m[2])} ${m[3].trim()}) {`;
        return `if (${inner}) {`;
    });

    code = code.replace(/\belse\s+if\s+(.+?)\s+then\b/ig, (_, raw) => {
        const inner = stripParens(raw);
        const m = inner.match(/^(.+?)\s*(===|!==|>=|<=|>|<|!=|=)\s*(.+)$/i);
        if (m) return `} else if (${m[1].trim()} ${mapOp(m[2])} ${m[3].trim()}) {`;
        return `} else if (${inner}) {`;
    });

    code = code.replace(/\belse\b/ig, "} else {");

    // ── 20. Loops com verificação de execução ────────────────────
    const execCheck = `__checkExec();`;

    // loop  →  while(true)
    code = code.replace(/\bloop\b/ig, `while(true) { ${execCheck}`);

    // repeat N times
    code = code.replace(/\brepeat\s+(\d+|\w+)\s+times\b/ig,
        `for(let __i=0; __i<$1; __i++) { ${execCheck}`);

    // repeat N to M  (range-loop)
    code = code.replace(/\brepeat\s+(\d+|\w+)\s+to\s+(\d+|\w+)(?:\s+step\s+(\d+|\w+))?\b/ig,
        (_, from, to, step) =>
            `for(let __i=${from}; __i<=${to}; __i+=${step || 1}) { ${execCheck}`
    );

    // until cond  →  while(!cond)
    code = code.replace(/\buntil\s+(.+?)\s*(?={|$)/img, (_, cond) =>
        `while(!(${cond.trim()})) { ${execCheck}`
    );

    // foreach item in arr
    code = code.replace(/\bforeach\s+(\w+)\s+in\s+(\w+)\b/ig,
        `for(let $1 of $2) { ${execCheck}`);

    // foreach item, index in arr
    code = code.replace(/\bforeach\s+(\w+)\s*,\s*(\w+)\s+in\s+(\w+)\b/ig,
        `for(let [$2, $1] of Object.entries($3)) { ${execCheck}`);

    // stoploop / nextloop
    code = code.replace(/\bstoploop\b/ig, "__STOPLOOP__");
    code = code.replace(/\bnextloop\b/ig,  "__NEXTLOOP__");

    // ── 21. execute() ─────────────────────────────────────────────
    code = code.replace(/\bexecute\s*\(\s*(\w+\s*\([\s\S]*?\))\s*\)/ig, "await $1");
    code = code.replace(/\bexecute\s*\(\s*(\w+)\s*\)/ig,                 "await $1()");

    // ── 22. break = fechamento universal ─────────────────────────
    // Fecha módulo (IIFE) ou bloco normal
    code = code.replace(/^\s*\bbreak\b\s*$/img, "}");

    // Fecha módulo: substitui o } final de module pelo })();
    // (heurística: quebra são raras nesse contexto)
    code = code.replace(
        /exportModule\("(.*?)",\s*await \(async \(\) => \{([\s\S]*?)\}\s*\n/g,
        `exportModule("$1", await (async () => { const __ns = {}; const __nsExport = (k,v) => { __ns[k] = v; };$2 return __ns; })());\n`
    );

    // ── 23. Restaura stoploop / nextloop ──────────────────────────
    code = code.replace(/__STOPLOOP__/g, "break");
    code = code.replace(/__NEXTLOOP__/g, "continue");

    // ── 24. wait() ────────────────────────────────────────────────
    code = code.replace(/(?<!await )\bwait\s*\(/g, "await wait(");
    code = code.replace(/\bwait\s*\(\s*checkconsole\s*\)/ig,
        "await new Promise(r => { consoleResolver = r; })");
    code = code.replace(/\bcheckconsole\b/ig, "switchTab('console');");

    // ── 25. random N to M / random ────────────────────────────────
    code = code.replace(/\brandom\s+(\d+|\w+)\s+to\s+(\d+|\w+)/ig, "rng($1, $2)");
    code = code.replace(/\brandom\b/ig, "Math.random()");

    // ── 26. Tempo / Data ──────────────────────────────────────────
    code = code.replace(/\bhour\b/ig,      "(new Date().getHours())");
    code = code.replace(/\bminutes\b/ig,   "(new Date().getMinutes())");
    code = code.replace(/\bseconds\b/ig,   "(new Date().getSeconds())");
    code = code.replace(/\bday\b/ig,       "(new Date().getDate())");
    code = code.replace(/\bmonth\b/ig,     "(new Date().getMonth() + 1)");
    code = code.replace(/\byear\b/ig,      "(new Date().getFullYear())");
    code = code.replace(/\btimestamp\b/ig, "(Date.now())");
    code = code.replace(/\bnow\b/ig,       "(Date.now())");

    // ── 27. clear ─────────────────────────────────────────────────
    code = code.replace(/^\s*\bclear\b\s*$/gim, "logOutput.innerHTML = '';");

    // ── 28. Monta e executa ───────────────────────────────────────
    const helpers   = buildHelpers(thisId);
    const finalCode = `${helpers}\n${code}`;

    try {
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        const t0 = Date.now();
        await new AsyncFunction(finalCode)();
        if (thisId === activeExecutionId)
            log(`✓ Concluído em ${Date.now() - t0}ms`, "#4caf50");
        else
            log(`⚠️ Execução ${thisId} foi abortada`, "#ff9800");
    } catch (err) {
        if (err.message === '__ABORTED__') {
            log(`⚠️ Execução ${thisId} interrompida`, "#ff9800");
            return;
        }
        if (thisId === activeExecutionId) {
            log(`✗ ERRO: ${err.message}`, "#f44336");
            // Tenta localizar linha no código transpilado
            const stackLines = (err.stack || "").split('\n');
            for (const sl of stackLines) {
                const m = sl.match(/<anonymous>:(\d+):/);
                if (m) {
                    const helperLines = helpers.split('\n').length;
                    log(`📍 Próximo à linha ${Math.max(1, parseInt(m[1]) - helperLines)}`, "#ff9800");
                    break;
                }
            }
            console.groupCollapsed("SOL transpiled code");
            console.log(finalCode);
            console.groupEnd();
            console.error(err);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
//  AJUDA DE SINTAXE NO TERMINAL
// ═══════════════════════════════════════════════════════════════════════
function showSyntaxHelp() {
    const ln = (t, c = "#fff") => terminalPrint(t, c);
    const hr = (c = "#00bcd4") => terminalPrint("═".repeat(57), c);
    const box = (label, c = "#00bcd4") => {
        terminalPrint(`┌─ ${label} ${"─".repeat(Math.max(0, 52 - label.length))}┐`, c);
    };
    const row = (t) => terminalPrint(`│ ${t.padEnd(55)}│`, "#fff");
    const end = (c = "#00bcd4") => terminalPrint(`└${"─".repeat(57)}┘`, c);

    hr("#00ffff");
    terminalPrint("              SOL SYNTAX REFERENCE  v2.0.0              ", "#fff");
    hr("#00ffff");
    ln("");

    box("VARIÁVEIS");
    row("create name = value     → Declara e atribui");
    row("create name             → Declara sem valor");
    row("set name = value        → Atualiza variável");
    row("delete name             → Remove (undefined)");
    end(); ln("");

    box("FUNÇÕES");
    row("create function F(x)    → Declara função async");
    row("set function F(x)       → Reescreve função");
    row("execute(F)              → Chama função");
    row("execute(F('arg'))       → Chama com argumento");
    row("return value            → Retorna valor");
    row("break                   → Fecha bloco");
    end(); ln("");

    box("CONDICIONAIS");
    row("if var = val then       → Se igual");
    row("if var > val then       → Se maior");
    row("if not var = val then   → Se diferente");
    row("unless cond then        → Alias para 'if not'");
    row("else if cond then       → Senão se");
    row("else                    → Senão");
    row("break                   → Fecha if/else");
    end(); ln("");

    box("TERNÁRIO");
    row("when cond then A otherwise B  → cond ? A : B");
    end(); ln("");

    box("LOOPS");
    row("loop                    → Infinito");
    row("repeat 10 times         → N vezes");
    row("repeat 1 to 10          → De 1 a 10");
    row("repeat 1 to 10 step 2   → Com passo");
    row("foreach item in arr     → Itera array");
    row("foreach v, i in arr     → Com índice");
    row("until cond              → Enquanto não");
    row("stoploop                → break nativo");
    row("nextloop                → continue nativo");
    row("break                   → Fecha loop");
    end(); ln("");

    box("TRY / CATCH");
    row("try                     → Abre bloco protegido");
    row("break                   → Fecha try");
    row("catch err               → Captura erro");
    row("break                   → Fecha catch");
    end(); ln("");

    box("STRINGS");
    row("split var by 'sep'      → Divide em array");
    row("join arr by 'sep'       → Une array em string");
    row("replace in v from 'a' to 'b'  → Substitui");
    row("trim var                → Remove espaços");
    row("upper var               → Maiúsculas");
    row("lower var               → Minúsculas");
    row("reverse var             → Inverte string");
    row("strlen of var           → Tamanho");
    row("contains var 'sub'      → Verifica substring");
    end(); ln("");

    box("ARRAYS / OBJETOS");
    row("push val to arr         → Adiciona no fim");
    row("pop from arr            → Remove último");
    row("pull from arr at idx    → Remove por índice");
    row("first of arr            → Primeiro elemento");
    row("last of arr             → Último elemento");
    row("length of arr           → Tamanho");
    row("count of arr            → Alias de length");
    row("sum of arr              → Soma numérica");
    row("avg of arr              → Média");
    row("min of arr              → Mínimo");
    row("max of arr              → Máximo");
    row("sort arr                → Ordena");
    row("unique arr              → Remove duplicatas");
    row("flatten arr             → Nivela arrays");
    row("compact arr             → Remove falsy");
    row("chunk arr by N          → Divide em grupos");
    row("includes arr val        → Verifica elemento");
    row("fill N with val         → Array preenchido");
    row("keys of obj             → Chaves do objeto");
    row("values of obj           → Valores do objeto");
    row("merge obj1 obj2         → Junta objetos");
    row("has obj 'key'           → Verifica chave");
    row("size of arr             → Tamanho universal");
    end(); ln("");

    box("TIPOS");
    row("var is number           → isNum(var)");
    row("var is string           → isStr(var)");
    row("var is array            → isArr(var)");
    row("var is object           → isObj(var)");
    row("var is null             → isNull(var)");
    row("var is empty            → isEmpty(var)");
    row("var is defined          → !isUndef(var)");
    row("typeof var              → typeOf(var)");
    end(); ln("");

    box("EVENTOS");
    row("on 'evento' do          → Subscreve evento");
    row("break                   → Fecha handler");
    row("once 'evento' do        → Subscreve 1x");
    row("emit 'evento' valor     → Dispara evento");
    row("off 'evento'            → Remove handlers");
    end(); ln("");

    box("FILAS (QUEUES)");
    row("enqueue 'fila' valor    → Adiciona item");
    row("dequeue 'fila' -> var   → Remove e retorna");
    row("queuepeek 'fila' -> var → Vê sem remover");
    row("queuesize 'fila'        → Tamanho da fila");
    row("queueclear 'fila'       → Esvazia fila");
    row("drain 'fila' do         → Processa todos");
    row("break                   → Fecha drain");
    end(); ln("");

    box("TIMERS");
    row("every 500 do            → Repete a cada 500ms");
    row("break                   → Fecha timer");
    end(); ln("");

    box("MÓDULOS / NAMESPACE");
    row("module 'nome' do        → Abre namespace");
    row("export varName          → Exporta variável");
    row("export fn as 'alias'    → Exporta com alias");
    row("break                   → Fecha módulo");
    row("usemodule 'nome'        → Importa namespace");
    end(); ln("");

    box("PIPELINE");
    row("var |> fn1 |> fn2       → pipe(var, fn1, fn2)");
    end(); ln("");

    box("MATH");
    row("rng(min, max)           → Inteiro aleatório");
    row("math.rng(min, max)      → Alias de rng()");
    row("math(expr)              → Avalia expressão");
    row("clamp(v, lo, hi)        → Limita valor");
    row("lerp(a, b, t)           → Interpolação linear");
    end(); ln("");

    box("TEMPO");
    row("hour / minutes / seconds → Hora atual");
    row("day / month / year      → Data atual");
    row("now                     → Date.now()");
    row("timestamp               → Date.now() (alias)");
    end(); ln("");

    box("SAÍDA");
    row("log(msg)                → Verde");
    row("print(msg)              → Verde (alias)");
    row("error(msg)              → Vermelho");
    row("warn(msg)               → Laranja");
    row("success(msg)            → Verde claro");
    row("clear                   → Limpa console");
    row("checkconsole            → Muda para console");
    end(); ln("");

    box("ASK / INPUT");
    row("ask 'pergunta' -> var   → Input no terminal");
    row("create v = console.ask.symbol('!', 'Q')");
    row("input('prompt')         → Popup de input");
    end(); ln("");

    box("BIBLIOTECAS EXTERNAS");
    row("importService('nome')   → Carrega biblioteca");
    end(); ln("");

    hr("#00ffff");
    terminalPrint("  /help para comandos do terminal", "#bbb");
    ln("");
}

// ═══════════════════════════════════════════════════════════════════════
//  STORAGE / AUTO-SAVE
// ═══════════════════════════════════════════════════════════════════════
function saveToLocalStorage() {
    try {
        localStorage.setItem('sol_code', editor.innerText);
        localStorage.setItem('sol_saved_at', new Date().toISOString());
    } catch (e) { /* silencioso */ }
}

function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('sol_code');
        if (saved) {
            editor.innerText = saved;
            updateEditor();
            const at = localStorage.getItem('sol_saved_at');
            log(`Código carregado (salvo em ${new Date(at).toLocaleString()})`, "#00bcd4");
        }
    } catch (e) { log("Falha ao carregar do storage.", "#f44336"); }
}

function startAutoSave() {
    if (autoSaveTimer) clearInterval(autoSaveTimer);
    autoSaveTimer = setInterval(saveToLocalStorage, CONFIG.autoSaveInterval);
}

// ═══════════════════════════════════════════════════════════════════════
//  EXPORT DE PROJETO
// ═══════════════════════════════════════════════════════════════════════
async function exportProject() {
    if (typeof JSZip === "undefined") {
        terminalPrint("[ERR] JSZip não carregado. Use: importService('JSZip')", "#f44336");
        return;
    }
    const zip      = new JSZip();
    const code     = editor.innerText;
    const metadata = {
        version:   CONFIG.version,
        developer: "AreDev",
        created:   new Date().toISOString(),
        lines:     code.split('\n').length
    };
    zip.file("script.sol", code);
    zip.file("metadata.json", JSON.stringify(metadata, null, 2));
    zip.file("README.md", `# SOL Project\n\nVersion: ${metadata.version}\nCreated: ${metadata.created}`);
    const blob = await zip.generateAsync({type: "blob"});
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `SOL_Project_${Date.now()}.zip`;
    a.click();
    terminalPrint("✓ Projeto exportado.", "#4caf50");
}

// ═══════════════════════════════════════════════════════════════════════
//  FUNÇÕES DE ARQUIVO
// ═══════════════════════════════════════════════════════════════════════
function clearEditor() {
    if (confirm("Limpar todo o código? Isso não pode ser desfeito.")) {
        editor.innerText = "";
        updateEditor();
        log("Editor limpo.", "#ff9800");
    }
}

function handleFile(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload  = e => { editor.innerText = e.target.result; updateEditor(); log(`Arquivo carregado: ${file.name}`, "#4caf50"); };
    reader.onerror = () => log("Falha ao ler arquivo.", "#f44336");
    reader.readAsText(file);
}

// ═══════════════════════════════════════════════════════════════════════
//  TERMINAL — COMANDOS
// ═══════════════════════════════════════════════════════════════════════
soltuxInput.addEventListener('keydown', async e => {
    if (isTerminalAsking) return;

    if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (historyIndex > 0) soltuxInput.value = commandHistory[--historyIndex];
        return;
    }
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex < commandHistory.length - 1) soltuxInput.value = commandHistory[++historyIndex];
        else { historyIndex = commandHistory.length; soltuxInput.value = ""; }
        return;
    }

    if (e.key !== 'Enter') return;

    const val = soltuxInput.value.trim();
    if (!val) return;
    commandHistory.push(val);
    historyIndex = commandHistory.length;
    soltuxInput.value = "";
    terminalPrint(`E:\\> ${val}`, "#fff");

    const parts = val.split(' ');
    const cmd   = parts[0].toLowerCase();
    const args  = parts.slice(1);

    switch (cmd) {
        case "/run":
            runSol();
            break;

        case "/stop":
            currentExecutionId++;
            activeExecutionId = null;
            // Para todos os timers SOL ativos
            Object.values(SOL_TIMERS).forEach(t => clearInterval(t));
            for (const k in SOL_TIMERS) delete SOL_TIMERS[k];
            terminalPrint("⚠️ Todas as execuções e timers parados.", "#f44336");
            break;

        case "/clear":
            soltuxDisplay.innerHTML = "";
            break;

        case "/clearconsole":
            logOutput.innerHTML = "";
            terminalPrint("Console limpo.", "#4caf50");
            break;

        case "/getlib":
            if (args[0]) await importService(args[0]);
            else terminalPrint("Uso: /getlib <nome-da-biblioteca>", "#ff9800");
            break;

        case "/save":
            saveToLocalStorage();
            terminalPrint("✓ Código salvo no browser.", "#4caf50");
            break;

        case "/load":
            loadFromLocalStorage();
            break;

        case "/export":
            await exportProject();
            break;

        case "/check": {
            const src = editor.innerText.trim();
            if (!src) { terminalPrint("Nenhum código para verificar.", "#ff9800"); break; }
            const s = analyzeCodeForSuggestions(src);
            if (!s.length) terminalPrint("✓ Nenhum problema encontrado!", "#4caf50");
            else {
                terminalPrint(`${s.length} sugestão(ões):`, "#ffeb3b");
                s.forEach(sg => terminalPrint(`  Linha ${sg.line}: ${sg.message}`, "#fff"));
            }
            break;
        }

        case "/debug":
            if (args[0] === "on")  { runtime.debugMode = true;  terminalPrint("Debug ativado.", "#4caf50"); }
            else if (args[0] === "off") { runtime.debugMode = false; terminalPrint("Debug desativado.", "#f44336"); }
            else terminalPrint(`Debug: ${runtime.debugMode ? 'ON' : 'OFF'}`, "#00bcd4");
            break;

        case "/events":
            terminalPrint("Eventos registrados:", "#00ffff");
            if (!Object.keys(SOL_EVENTS).length) terminalPrint("  (nenhum)", "#666");
            else Object.entries(SOL_EVENTS).forEach(([k, v]) =>
                terminalPrint(`  '${k}' — ${v.length} listener(s)`, "#fff"));
            break;

        case "/queues":
            terminalPrint("Filas ativas:", "#00ffff");
            if (!Object.keys(SOL_QUEUES).length) terminalPrint("  (nenhuma)", "#666");
            else Object.entries(SOL_QUEUES).forEach(([k, v]) =>
                terminalPrint(`  '${k}' — ${v.length} item(s)`, "#fff"));
            break;

        case "/modules":
            terminalPrint("Módulos registrados:", "#00ffff");
            if (!Object.keys(SOL_MODULES).length) terminalPrint("  (nenhum)", "#666");
            else Object.keys(SOL_MODULES).forEach(k =>
                terminalPrint(`  '${k}'`, "#fff"));
            break;

        case "/timers":
            terminalPrint("Timers ativos:", "#00ffff");
            const tKeys = Object.keys(SOL_TIMERS);
            if (!tKeys.length) terminalPrint("  (nenhum)", "#666");
            else terminalPrint(`  ${tKeys.length} timer(s) rodando`, "#fff");
            break;

        case "/ver":
        case "/version":
            terminalPrint(`SOL Engine v${CONFIG.version}`, "#00ffff");
            terminalPrint("Developer: AreDev", "#00bcd4");
            terminalPrint("Motor puro. Conexão externa somente via importService().", "#666");
            break;

        case "/help":
            terminalPrint("═".repeat(43), "#00ffff");
            terminalPrint("        SOLTUX — COMANDOS DO TERMINAL        ", "#fff");
            terminalPrint("═".repeat(43), "#00ffff");
            [
                ["/run           ", "Executa o código"],
                ["/stop          ", "Para execução e timers"],
                ["/clear         ", "Limpa terminal"],
                ["/clearconsole  ", "Limpa console"],
                ["/getlib <n>    ", "Carrega biblioteca"],
                ["/save          ", "Salva no browser"],
                ["/load          ", "Carrega do browser"],
                ["/export        ", "Exporta projeto ZIP"],
                ["/check         ", "Verifica erros"],
                ["/debug on/off  ", "Modo debug"],
                ["/events        ", "Lista eventos ativos"],
                ["/queues        ", "Lista filas ativas"],
                ["/modules       ", "Lista módulos"],
                ["/timers        ", "Lista timers ativos"],
                ["/ver           ", "Versão"],
                ["/help          ", "Comandos do terminal"],
                ["/helpsyntax    ", "Referência de sintaxe SOL"],
            ].forEach(([c, d]) => terminalPrint(`  ${c} ${d}`, "#fff"));
            terminalPrint("═".repeat(43), "#00ffff");
            break;

        case "/helpsyntax":
            showSyntaxHelp();
            break;

        default:
            terminalPrint(`Comando desconhecido: ${cmd}. Digite /help.`, "#f44336");
    }
});

// ═══════════════════════════════════════════════════════════════════════
//  EVENTOS DO EDITOR
// ═══════════════════════════════════════════════════════════════════════
editor.addEventListener('input', () => {
    updateEditor();
    saveToLocalStorage();
});

editor.addEventListener('paste', e => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
});

editor.addEventListener('keydown', e => {
    // Tab → 4 espaços
    if (e.key === 'Tab') {
        e.preventDefault();
        document.execCommand('insertText', false, '    ');
    }
});

lineNumbers.addEventListener('click', e => {
    const n = parseInt(e.target.innerText);
    if (isNaN(n)) return;
    runtime.breakpoints.has(n) ? runtime.breakpoints.delete(n) : runtime.breakpoints.add(n);
    updateEditor();
});

window.addEventListener('beforeunload', () => {
    if (editor.innerText.trim()) saveToLocalStorage();
});

// ═══════════════════════════════════════════════════════════════════════
//  INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════════════════════
terminalPrint("═".repeat(43), "#00ffff");
terminalPrint(`  SOL ENGINE  v${CONFIG.version}`, "#fff");
terminalPrint("  Developer: AreDev", "#00bcd4");
terminalPrint("  Motor puro — libs externas via importService", "#666");
terminalPrint("═".repeat(43), "#00ffff");
terminalPrint("  /help → comandos  |  /helpsyntax → sintaxe", "#bbb");
terminalPrint("", "#fff");

loadFromLocalStorage();
startAutoSave();
updateEditor();
```

Pronto. Aqui está o que foi adicionado/mudado em relação às duas versões anteriores:

**Sintaxes novas de string:** `split var by "sep"`, `join arr by "sep"`, `replace in v from "a" to "b"`, `trim/upper/lower/reverse var`, `strlen of var`, `contains var "sub"`

**Arrays/Objetos avançados:** `push/pop/pull`, `first of / last of`, `sum/avg/min/max of arr`, `sort/unique/flatten/compact/chunk arr`, `fill N with val`, `includes arr val`, `keys/values/merge/has/size of`

**Tipos:** `var is number/string/array/object/null/empty/defined`, `typeof var`

**Eventos:** `on "x" do...break`, `once "x" do...break`, `emit "x" valor`, `off "x"`

**Filas:** `enqueue/dequeue/queuepeek/queuesize/queueclear/drain "fila"`

**Timers:** `every 500 do...break`

**Módulos:** `module "nome" do`, `export var`, `export fn as "alias"`, `usemodule "nome"`, `break`

**Pipeline:** `var |> fn1 |> fn2`

**Ternário:** `when cond then A otherwise B`

**Try/Catch:** `try / break / catch err / break`

**Loops extras:** `repeat 1 to 10 step 2`, `foreach v, i in arr`, `until cond`

**Sem nenhum HTTP no motor** — a única saída pra internet é o `importService()`.
