const PROXY_URL = "https://aredev-security.vercel.app/api/download?file=";
const CONFIG = {
    maxLogLines: 500,
    autoSaveInterval: 30000,
    theme: 'dark'
};

let consoleResolver = null;
let lastTerminalLine = null;
let executionContext = {};
let commandHistory = [];
let historyIndex = -1;
let autoSaveTimer = null;

const editor = document.getElementById('code-editor');
const lineNumbers = document.getElementById('line-numbers');
const logOutput = document.getElementById('log-output');
const soltuxDisplay = document.getElementById('soltux-display');
const soltuxInput = document.getElementById('soltux-input');

class SolRuntime {
    constructor() {
        this.variables = new Map();
        this.functions = new Map();
        this.breakpoints = new Set();
        this.debugMode = false;
    }

    setVar(name, value) {
        this.variables.set(name, value);
        if (this.debugMode) log(`[DEBUG] ${name} = ${JSON.stringify(value)}`, "#ffeb3b");
    }

    getVar(name) {
        return this.variables.get(name);
    }

    clear() {
        this.variables.clear();
        this.functions.clear();
    }
}

const runtime = new SolRuntime();

function updateEditor() {
    if (!lineNumbers || !editor) return;
    const text = editor.innerText;
    const lines = text.split('\n').length || 1;
    lineNumbers.innerHTML = Array.from({length: lines}, (_, i) => {
        const num = i + 1;
        const hasBreakpoint = runtime.breakpoints.has(num);
        return `<span class="${hasBreakpoint ? 'breakpoint' : ''}">${num}</span>`;
    }).join('<br>');
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.content').forEach(content => content.classList.remove('active'));

    const targetContent = document.getElementById(tabId);
    const targetBtn = document.querySelector(`[onclick="switchTab('${tabId}')"]`);

    if (targetContent) targetContent.classList.add('active');
    if (targetBtn) targetBtn.classList.add('active');

    if (tabId === 'console' && consoleResolver) {
        consoleResolver();
        consoleResolver = null;
    }
}

window.log = (message, color = "#4caf50") => {
    const logLine = document.createElement('div');
    logLine.style.color = color;
    logLine.className = 'log-line';
    const timestamp = new Date().toLocaleTimeString();
    logLine.innerHTML = `<span style="color: #666">[${timestamp}]</span> ${message}`;
    logOutput.appendChild(logLine);
    if (logOutput.children.length > CONFIG.maxLogLines) {
        logOutput.removeChild(logOutput.firstChild);
    }
    logOutput.scrollTop = logOutput.scrollHeight;
};

window.wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

window.input = async (prompt = "Enter value:") => {
    return new Promise(resolve => {
        log(prompt, "#00bcd4");
        const originalResolver = consoleResolver;
        consoleResolver = () => {
            const value = window.prompt(prompt);
            resolve(value);
            if (originalResolver) originalResolver();
        };
        switchTab('console');
    });
};

window.clear = () => { logOutput.innerHTML = ""; };
window.alert = (msg) => { log(`⚠️ ${msg}`, "#ff9800"); };

function terminalPrint(message, color = "#fff") {
    const terminalLine = document.createElement('div');
    terminalLine.style.color = color;
    terminalLine.className = 'terminal-line';
    terminalLine.innerText = message;
    soltuxDisplay.appendChild(terminalLine);
    soltuxDisplay.scrollTop = soltuxDisplay.scrollHeight;
}

function showSyntaxHelp() {
    terminalPrint("═══════════════════════════════════════════════════════════", "#00ffff");
    terminalPrint("                    SOL SYNTAX REFERENCE                    ", "#fff");
    terminalPrint("═══════════════════════════════════════════════════════════", "#00ffff");
    terminalPrint("", "#fff");

    terminalPrint("┌─ VARIÁVEIS ─────────────────────────────────────────────┐", "#00bcd4");
    terminalPrint("│ create name              → Declara variável             │", "#fff");
    terminalPrint("│ create name = value      → Declara e atribui            │", "#fff");
    terminalPrint("│ set name = value         → Atualiza variável            │", "#fff");
    terminalPrint("│ delete name              → Remove variável              │", "#fff");
    terminalPrint("└─────────────────────────────────────────────────────────┘", "#00bcd4");
    terminalPrint("", "#fff");

    terminalPrint("┌─ FUNÇÕES ───────────────────────────────────────────────┐", "#00bcd4");
    terminalPrint("│ create function Nome     → Declara função               │", "#fff");
    terminalPrint("│ create function Nome(x)  → Função com parâmetros        │", "#fff");
    terminalPrint("│ set function Nome        → Reescreve função             │", "#fff");
    terminalPrint("│ execute(Nome)            → Chama função                 │", "#fff");
    terminalPrint("│ execute(Nome('arg'))     → Chama com argumento          │", "#fff");
    terminalPrint("│ return value             → Retorna valor                │", "#fff");
    terminalPrint("│ break                    → Fecha qualquer bloco         │", "#fff");
    terminalPrint("└─────────────────────────────────────────────────────────┘", "#00bcd4");
    terminalPrint("", "#fff");

    terminalPrint("┌─ CONDICIONAIS ──────────────────────────────────────────┐", "#00bcd4");
    terminalPrint("│ if var = val then        → Se var == val                │", "#fff");
    terminalPrint("│ if var > val then        → Se var > val                 │", "#fff");
    terminalPrint("│ if var < val then        → Se var < val                 │", "#fff");
    terminalPrint("│ if var >= val then       → Se var >= val                │", "#fff");
    terminalPrint("│ if var <= val then       → Se var <= val                │", "#fff");
    terminalPrint("│ if not var = val then    → Se var != val                │", "#fff");
    terminalPrint("│ elcio                    → Senão (else)                 │", "#fff");
    terminalPrint("│ break                    → Fecha o bloco if/else        │", "#fff");
    terminalPrint("└─────────────────────────────────────────────────────────┘", "#00bcd4");
    terminalPrint("", "#fff");

    terminalPrint("┌─ LOOPS ─────────────────────────────────────────────────┐", "#00bcd4");
    terminalPrint("│ loop                     → Loop infinito                │", "#fff");
    terminalPrint("│ repeat 10 times          → Repete N vezes               │", "#fff");
    terminalPrint("│ foreach item in arr      → Itera array                  │", "#fff");
    terminalPrint("│ stoploop                 → Sai do loop (break nativo)   │", "#fff");
    terminalPrint("│ nextloop                 → Pula iteração (continue)     │", "#fff");
    terminalPrint("│ break                    → Fecha o bloco do loop        │", "#fff");
    terminalPrint("└─────────────────────────────────────────────────────────┘", "#00bcd4");
    terminalPrint("", "#fff");

    terminalPrint("┌─ SAÍDA ─────────────────────────────────────────────────┐", "#00bcd4");
    terminalPrint("│ log(msg)                 → Verde                        │", "#fff");
    terminalPrint("│ print(msg)               → Verde (alias)                │", "#fff");
    terminalPrint("│ error(msg)               → Vermelho                     │", "#fff");
    terminalPrint("│ warn(msg)                → Laranja                      │", "#fff");
    terminalPrint("│ success(msg)             → Verde claro                  │", "#fff");
    terminalPrint("│ checkconsole             → Muda para aba console        │", "#fff");
    terminalPrint("└─────────────────────────────────────────────────────────┘", "#00bcd4");
    terminalPrint("", "#fff");

    terminalPrint("┌─ EXEMPLO ───────────────────────────────────────────────┐", "#00bcd4");
    terminalPrint("│ create test = rng(1, 10)                                │", "#fff");
    terminalPrint("│ if test = 10 then                                       │", "#fff");
    terminalPrint("│     log('dez!')                                         │", "#fff");
    terminalPrint("│ elcio                                                   │", "#fff");
    terminalPrint("│     set test = rng(1, 10)                               │", "#fff");
    terminalPrint("│ break                                                   │", "#fff");
    terminalPrint("│                                                         │", "#fff");
    terminalPrint("│ create function greet(name)                             │", "#fff");
    terminalPrint("│     success('Hello ' + name)                            │", "#fff");
    terminalPrint("│ break                                                   │", "#fff");
    terminalPrint("│                                                         │", "#fff");
    terminalPrint("│ execute(greet('World'))                                 │", "#fff");
    terminalPrint("└─────────────────────────────────────────────────────────┘", "#00bcd4");
    terminalPrint("", "#fff");

    terminalPrint("═══════════════════════════════════════════════════════════", "#00ffff");
    terminalPrint("Para comandos do terminal, digite /help", "#bbb");
    terminalPrint("", "#fff");
}

async function importService(name) {
    if (document.getElementById(`lib-${name}`)) {
        terminalPrint(`[WARN] Service '${name}' already loaded.`, "#ff9800");
        return;
    }

    lastTerminalLine = document.createElement('div');
    lastTerminalLine.style.color = "#00ffff";
    lastTerminalLine.className = 'loading-line';
    soltuxDisplay.appendChild(lastTerminalLine);

    for (let i = 0; i <= 100; i += 20) {
        lastTerminalLine.innerText = `[${name}] ${'█'.repeat(i/5)}${'░'.repeat(20-i/5)} ${i}%`;
        await new Promise(r => setTimeout(r, 50));
    }

    try {
        const response = await fetch(`${PROXY_URL}${name}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const code = await response.text();
        const scriptTag = document.createElement('script');
        scriptTag.id = `lib-${name}`;
        scriptTag.text = code;
        document.head.appendChild(scriptTag);
        lastTerminalLine.remove();
        terminalPrint(`✓ Service '${name}' loaded successfully.`, "#4caf50");
    } catch (err) {
        lastTerminalLine.innerText = `✗ Failed to load ${name}: ${err.message}`;
        lastTerminalLine.style.color = "#f44336";
    }
}

// ─────────────────────────────────────────────────────────────
//  TRANSPILADOR SOL → JAVASCRIPT
//
//  REGRAS CENTRAIS:
//   • break (sozinho na linha) = "}"  — fecha QUALQUER bloco
//   • Blocos abrem com "{" automaticamente nas keywords
//   • O usuário NÃO escreve { } — o transpilador insere
//   • stoploop = break nativo JS  (sai do loop sem fechar bloco)
//   • nextloop = continue nativo JS
// ─────────────────────────────────────────────────────────────
async function runSol() {
    let code = editor.innerText.trim();

    if (!code) {
        log("No code to execute.", "#ff9800");
        return;
    }

    switchTab('console');
    logOutput.innerHTML = "";
    log("🚀 Execution started...", "#2196f3");

    // ── 1. Remove comentários (suporta -- e //) ──────────────
    code = code.replace(/--.*$/gm, "");
    code = code.replace(/\/\/.*$/gm, "");
    code = code.replace(/\/\*[\s\S]*?\*\//g, "");

    // ── 2. Imports ───────────────────────────────────────────
    const importRegex = /importService\s*\(\s*["'](.*?)["']\s*\)/ig;
    const importMatches = [...code.matchAll(importRegex)];
    for (const match of importMatches) await importService(match[1]);

    // ── 3. Firebase ──────────────────────────────────────────
    code = code.replace(/setfirebase\s*\((.*?)\)/ig, "WebSol.setfirebase($1)");
    code = code.replace(/postfire\s*\((.*?)\s*,\s*(.*?)\)/ig, "await WebSol.postfire($1, $2)");
    code = code.replace(/postfire\s*\((['"][\w\s/]+['"])\)(?!\s*,)/ig, "await WebSol.postfire($1, true)");
    code = code.replace(/getfire\s*\((.*?)\)\s*->\s*(\w+)/ig, "let $2 = await WebSol.getfire($1)");

    // ── 4. Math ──────────────────────────────────────────────
    code = code.replace(/math\((.*?)\)/ig, (_, content) => {
        let t = content.replace(/\[(.*?)\]/g, "$1").replace(/÷/g, "/").replace(/×/g, "*");
        return `eval(\`${t}\`)`;
    });

    // ── 5. Tempo / Data ──────────────────────────────────────
    code = code.replace(/\bhour\b/ig,      "(new Date().getHours())");
    code = code.replace(/\bminutes\b/ig,   "(new Date().getMinutes())");
    code = code.replace(/\bseconds\b/ig,   "(new Date().getSeconds())");
    code = code.replace(/\bday\b/ig,       "(new Date().getDate())");
    code = code.replace(/\bmonth\b/ig,     "(new Date().getMonth() + 1)");
    code = code.replace(/\byear\b/ig,      "(new Date().getFullYear())");
    code = code.replace(/\btimestamp\b/ig, "(Date.now())");

    // ── 6. FUNÇÕES ───────────────────────────────────────────
    // DEVE VIR ANTES das regex de create/set de variáveis.
    // O corpo da função é fechado pelo "break" (passo 11).
    //
    //   create function Nome(a, b)  →  let Nome = async function(a, b) {
    //   create function Nome        →  let Nome = async function() {
    //   set function Nome(a, b)     →  Nome = async function(a, b) {
    //   set function Nome           →  Nome = async function() {
    //
    code = code.replace(
        /\bcreate\s+function\s+(\w+)\s*\(\s*(.*?)\s*\)/ig,
        "var $1 = async function($2) {"
    );
    code = code.replace(
        /\bcreate\s+function\s+(\w+)/ig,
        "var $1 = async function() {"
    );
    code = code.replace(
        /\bset\s+function\s+(\w+)\s*\(\s*(.*?)\s*\)/ig,
        "$1 = async function($2) {"
    );
    code = code.replace(
        /\bset\s+function\s+(\w+)/ig,
        "$1 = async function() {"
    );

    // ── 7. VARIÁVEIS ─────────────────────────────────────────
    //
    //  BUG DE ESCOPO CORRIGIDO:
    //  "let" tem escopo de bloco em JS — uma variável declarada
    //  dentro de um if/loop some ao sair do bloco.
    //  Em SOL, "create" deve ter escopo de função (como var),
    //  para que a variável exista em todo o script do usuário.
    //
    //   create x = valor  →  var x = valor
    //   create x          →  var x
    //   set x = valor     →  x = valor
    //   delete x          →  x = undefined
    //
    code = code.replace(/\bcreate\s+(\w+)\s*=\s*/ig, "var $1 = ");
    code = code.replace(/\bcreate\s+(\w+)\s*$/img,   "var $1");
    code = code.replace(/\bset\s+(\w+)\s*=\s*/ig,    "$1 = ");
    code = code.replace(/\bdelete\s+(\w+)/ig,         "$1 = undefined");

    // ── 8. CONDICIONAIS ──────────────────────────────────────
    //
    //  Formas aceitas (resiliente a parênteses extras do usuário):
    //
    //    if x = 10 then            →  if (x === 10) {
    //    if (x = 10) then          →  if (x === 10) {   ← parênteses extras OK
    //    if x > 10 then            →  if (x > 10) {
    //    if not x = 10 then        →  if (x !== 10) {
    //    if not (x = 10) then      →  if (x !== 10) {   ← parênteses extras OK
    //    elcio                     →  } else {
    //
    //  Regra: strip de parênteses externos antes de montar o JS.
    //  Operadores:  =  →  ===  |  !=  →  !==  |  > < >= <=  mantidos
    //

    // Mapeia operador SOL → JS
    function mapOp(op) {
        if (op.trim() === "=")  return "===";
        if (op.trim() === "!=") return "!==";
        return op.trim();
    }

    // Remove parênteses externos de uma string, se existirem
    function stripOuterParens(s) {
        s = s.trim();
        if (s.startsWith("(") && s.endsWith(")")) return s.slice(1, -1).trim();
        return s;
    }

    // "if not ..." — com ou sem parênteses externos na condição
    code = code.replace(
        /\bif\s+not\s+(.+?)\s+then\b/ig,
        (_, raw) => {
            // extrai "VAR OP VAL" removendo parênteses extras
            const inner = stripOuterParens(raw);
            // tenta capturar padrão "VAR OP VAL"
            const m = inner.match(/^(\w+)\s*(===|!==|>=|<=|>|<|!=|=)\s*(.+)$/i);
            if (m) {
                const jsOp = mapOp(m[2]) === "===" ? "!==" : mapOp(m[2]) === "!==" ? "===" : `/* not */ ${mapOp(m[2])}`;
                // para = e != inverte direto; para outros envolve em !(...)
                if (m[2].trim() === "=" || m[2].trim() === "!=") {
                    return `if (${m[1]} ${mapOp(m[2]) === "===" ? "!==" : "==="} ${m[3].trim()}) {`;
                }
                return `if (!(${m[1]} ${mapOp(m[2])} ${m[3].trim()})) {`;
            }
            // fallback: envolve a condição em !(...)
            return `if (!(${inner})) {`;
        }
    );

    // "if ..." — com ou sem parênteses externos na condição
    code = code.replace(
        /\bif\s+(.+?)\s+then\b/ig,
        (_, raw) => {
            const inner = stripOuterParens(raw);
            const m = inner.match(/^(\w+)\s*(===|!==|>=|<=|>|<|!=|=)\s*(.+)$/i);
            if (m) return `if (${m[1]} ${mapOp(m[2])} ${m[3].trim()}) {`;
            // fallback: usa a condição como está (ex: expressão JS pura)
            return `if (${inner}) {`;
        }
    );

    // elcio → } else {
    code = code.replace(/\belcio\b/ig, "} else {");

    // ── 9. LOOPS ─────────────────────────────────────────────
    //
    //  BUG CORRIGIDO: loop() com parênteses gerava "while(true) {)"
    //  Solução: a regex consome os parênteses opcionais \s*\(?\s*\)?
    //
    //  loop           →  while(true) {
    //  loop()         →  while(true) {   ← parênteses ignorados
    //  repeat N times →  for(let __i=0; __i<N; __i++) {
    //  foreach x in y →  for(let x of y) {
    //  stoploop       →  break  (JS nativo, sai do loop)
    //  nextloop       →  continue (JS nativo)
    //
    code = code.replace(/\bloop\s*\(?\s*\)?\s*(?=\s|$)/ig,      "while(true) {");
    code = code.replace(/\brepeat\s+(\d+)\s+times\b/ig,          "for(let __i=0; __i<$1; __i++) {");
    code = code.replace(/\bforeach\s+(\w+)\s+in\s+(\w+)\b/ig,    "for(let $1 of $2) {");
    code = code.replace(/\bstoploop\b/ig,                        "__STOPLOOP__");
    code = code.replace(/\bnextloop\b/ig,                        "__NEXTLOOP__");

    // ── 10. execute() ────────────────────────────────────────
    //
    //  execute(Nome('arg'))  →  await Nome('arg')
    //  execute(Nome)         →  await Nome()
    //
    code = code.replace(/\bexecute\s*\(\s*(\w+\s*\(.*?\))\s*\)/ig, "await $1");
    code = code.replace(/\bexecute\s*\(\s*(\w+)\s*\)/ig,            "await $1()");

    // ── 11. BREAK = FECHAMENTO UNIVERSAL ─────────────────────
    //
    //  "break" sozinho em uma linha  →  "}"
    //  Fecha função, if, else, loop — qualquer bloco aberto.
    //
    code = code.replace(/^\s*\bbreak\b\s*$/img, "}");

    // ── 12. Restaura stoploop / nextloop ─────────────────────
    //  (guardados antes do break para não serem transformados em "}")
    code = code.replace(/__STOPLOOP__/g, "break");
    code = code.replace(/__NEXTLOOP__/g, "continue");

    // ── 13. wait() ───────────────────────────────────────────
    code = code.replace(/(?<!await )\bwait\s*\(/g, "await wait(");

    // ── 14. checkconsole ─────────────────────────────────────
    code = code.replace(
        /\bwait\s*\(\s*checkconsole\s*\)/ig,
        "await new Promise(r => { consoleResolver = r; })"
    );
    code = code.replace(/\bcheckconsole\b/ig, "switchTab('console');");

    // ── 15. Arrays / Objetos / Utilitários ───────────────────
    code = code.replace(/\barray\s*\[(.*?)\]/ig,                   "[$1]");
    code = code.replace(/\bobject\s*\{(.*?)\}/ig,                  "{$1}");
    code = code.replace(/\blength\s+of\s+(\w+)/ig,                 "$1.length");
    code = code.replace(/\bpush\s+(\w+)\s+to\s+(\w+)/ig,           "$2.push($1)");
    code = code.replace(/\bremove\s+from\s+(\w+)\s+at\s+(\d+)/ig,  "$1.splice($2, 1)");

    // ── 16. Random ───────────────────────────────────────────
    code = code.replace(/\brandom\s+(\d+)\s+to\s+(\d+)/ig, "rng($1, $2)");
    code = code.replace(/\brandom\b/ig,                     "Math.random()");

    // ── 17. Helpers injetados no contexto ────────────────────
    const helpers = `
        const rng     = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
        const sleep   = ms => new Promise(r => setTimeout(r, ms));
        const range   = (start, end) => Array.from({length: end - start + 1}, (_, i) => start + i);
        const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
        const pick    = arr => arr[Math.floor(Math.random() * arr.length)];
        const print   = msg => log(msg);
        const error   = msg => log(String(msg), '#f44336');
        const warn    = msg => log(String(msg), '#ff9800');
        const success = msg => log(String(msg), '#4caf50');
    `;

    const finalCode = `${helpers}\n${code}`;

    // ── 18. Execução ─────────────────────────────────────────
    try {
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        const startTime = Date.now();
        await new AsyncFunction(finalCode)();
        const executionTime = Date.now() - startTime;
        log(`✓ Execution completed in ${executionTime}ms`, "#4caf50");
    } catch (err) {
        log(`✗ RUNTIME ERROR: ${err.message}`, "#f44336");
        // Mostra código transpilado no console do dev para debug
        console.groupCollapsed("SOL transpiled code");
        console.log(finalCode);
        console.groupEnd();
        console.error(err);
    }
}

async function exportProject() {
    if (typeof JSZip === "undefined") {
        terminalPrint("[ERR] JSZip library not loaded!", "#f44336");
        return;
    }

    const zip = new JSZip();
    const code = editor.innerText;
    const metadata = {
        version: "2.0.0",
        developer: "AreDev",
        created: new Date().toISOString(),
        lines: code.split('\n').length
    };

    zip.file("script.sol", code);
    zip.file("metadata.json", JSON.stringify(metadata, null, 2));
    zip.file("README.md",
        `# SOL Project Export\n\nVersion: ${metadata.version}\nCreated: ${metadata.created}\nLines: ${metadata.lines}`
    );

    const content = await zip.generateAsync({type:"blob"});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = `SOL_Project_${Date.now()}.zip`;
    a.click();

    terminalPrint("✓ Project exported successfully.", "#4caf50");
}

function clearEditor() {
    if (confirm("Clear all code? This action cannot be undone.")) {
        editor.innerText = "";
        updateEditor();
        log("Editor cleared.", "#ff9800");
    }
}

function handleFile(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        editor.innerText = e.target.result;
        updateEditor();
        log(`File loaded: ${file.name}`, "#4caf50");
    };
    reader.onerror = () => { log("Failed to read file.", "#f44336"); };
    reader.readAsText(file);
}

function saveToLocalStorage() {
    try {
        localStorage.setItem('sol_code', editor.innerText);
        localStorage.setItem('sol_saved_at', new Date().toISOString());
        terminalPrint("✓ Auto-saved to browser.", "#4caf50");
    } catch (e) {
        terminalPrint("✗ Auto-save failed.", "#f44336");
    }
}

function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('sol_code');
        if (saved) {
            editor.innerText = saved;
            updateEditor();
            const savedAt = localStorage.getItem('sol_saved_at');
            log(`Loaded from storage (saved: ${new Date(savedAt).toLocaleString()})`, "#00bcd4");
        }
    } catch (e) {
        log("Failed to load from storage.", "#f44336");
    }
}

function startAutoSave() {
    if (autoSaveTimer) clearInterval(autoSaveTimer);
    autoSaveTimer = setInterval(saveToLocalStorage, CONFIG.autoSaveInterval);
}

soltuxInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
        const val = soltuxInput.value.trim();
        if (!val) return;

        commandHistory.push(val);
        historyIndex = commandHistory.length;

        const parts = val.split(' ');
        const cmd = parts[0];
        const args = parts.slice(1);

        soltuxInput.value = "";
        terminalPrint(`E:\\> ${val}`, "#fff");

        switch(cmd.toLowerCase()) {
            case "/getlib":
                if (args[0]) await importService(args[0]);
                else terminalPrint("Usage: /getlib <library-name>", "#ff9800");
                break;

            case "/clear":
                soltuxDisplay.innerHTML = "";
                break;

            case "/ver":
            case "/version":
                terminalPrint("SOL Executor v1.7.5 Enhanced Edition", "#00ffff");
                terminalPrint("Developer: AreDev", "#00ffff");
                break;

            case "/help":
                terminalPrint("═══════════════════════════════════════", "#00ffff");
                terminalPrint("        SOLTUX TERMINAL COMMANDS        ", "#fff");
                terminalPrint("═══════════════════════════════════════", "#00ffff");
                terminalPrint("", "#fff");
                terminalPrint("  /getlib <n>    - Load external library", "#fff");
                terminalPrint("  /clear         - Clear terminal screen", "#fff");
                terminalPrint("  /ver           - Show version info", "#fff");
                terminalPrint("  /help          - Show terminal commands", "#fff");
                terminalPrint("  /helpsyntax    - Show SOL syntax guide", "#fff");
                terminalPrint("  /save          - Save code to browser storage", "#fff");
                terminalPrint("  /load          - Load code from storage", "#fff");
                terminalPrint("  /debug on/off  - Toggle debug mode", "#fff");
                terminalPrint("  /export        - Export project as ZIP", "#fff");
                terminalPrint("", "#fff");
                terminalPrint("═══════════════════════════════════════", "#00ffff");
                break;

            case "/helpsyntax":
                showSyntaxHelp();
                break;

            case "/save":
                saveToLocalStorage();
                break;

            case "/load":
                loadFromLocalStorage();
                break;

            case "/debug":
                if (args[0] === "on") {
                    runtime.debugMode = true;
                    terminalPrint("Debug mode enabled.", "#4caf50");
                } else if (args[0] === "off") {
                    runtime.debugMode = false;
                    terminalPrint("Debug mode disabled.", "#f44336");
                } else {
                    terminalPrint(`Debug mode is ${runtime.debugMode ? 'ON' : 'OFF'}`, "#00bcd4");
                }
                break;

            case "/export":
                await exportProject();
                break;

            default:
                terminalPrint(`Unknown command: ${cmd}. Type /help for available commands.`, "#f44336");
        }
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (historyIndex > 0) {
            historyIndex--;
            soltuxInput.value = commandHistory[historyIndex];
        }
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex < commandHistory.length - 1) {
            historyIndex++;
            soltuxInput.value = commandHistory[historyIndex];
        } else {
            historyIndex = commandHistory.length;
            soltuxInput.value = "";
        }
    }
});

editor.addEventListener('input', () => {
    updateEditor();
    if (autoSaveTimer) saveToLocalStorage();
});

editor.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
});

lineNumbers.addEventListener('click', (e) => {
    const lineNum = parseInt(e.target.innerText);
    if (!isNaN(lineNum)) {
        if (runtime.breakpoints.has(lineNum)) {
            runtime.breakpoints.delete(lineNum);
        } else {
            runtime.breakpoints.add(lineNum);
        }
        updateEditor();
    }
});

window.addEventListener('beforeunload', () => {
    if (editor.innerText.trim()) saveToLocalStorage();
});

terminalPrint("═══════════════════════════════════════", "#00ffff");
terminalPrint("  SOL EXECUTOR v1.7.5 Enhanced Edition", "#fff");
terminalPrint("  Developer: AreDev", "#00bcd4");
terminalPrint("═══════════════════════════════════════", "#00ffff");
terminalPrint("Type /help for commands | /helpsyntax for syntax", "#bbb");
terminalPrint("", "#fff");

loadFromLocalStorage();
startAutoSave();
updateEditor();
