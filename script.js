// --- DATABASE & ESTADOS ---
const LIBS = {
    "WebSol": "https://raw.githubusercontent.com/AreDev/WebSol/main/WebSol.js",
    "Security": "https://raw.githubusercontent.com/AreDev/Security/main/AntiSkid.js"
};

let consoleResolver = null; // Guardião do wait(checkconsole)
let lastTerminalLine = null; // Para o carregamento overwrite

const editor = document.getElementById('code-editor');
const lineNumbers = document.getElementById('line-numbers');
const logOutput = document.getElementById('log-output');
const soltuxDisplay = document.getElementById('soltux-display');
const soltuxInput = document.getElementById('soltux-input');

// --- EDITOR SYSTEM (NÚMEROS DE LINHA) ---
function updateEditor() {
    if (!lineNumbers) return;
    const text = editor.innerText;
    const lines = text.split('\n').length;
    lineNumbers.innerHTML = Array.from({length: lines}, (_, i) => i + 1).join('<br>');
}

// --- ENGINE PRINCIPAL .SOL ---
async function runSol() {
    let code = editor.innerText;
    
    // Forçar troca de aba para o console ao executar
    switchTab('console');
    logOutput.innerHTML = "";

    // 1. SISTEMA DE COMENTÁRIOS (Limpeza total antes de rodar)
    code = code.replace(/\/\/.*$/gm, ""); // Remove //
    code = code.replace(/\/\*[\s\S]*?\*\//g, ""); // Remove /* */

    // 2. TRATAMENTO DE VARIÁVEIS (Bug fix: Create sem valor inicial)
    code = code.replace(/create\s+(\w+)(?!\s*=)/ig, "let $1;"); 
    code = code.replace(/create\s+(\w+)\s*=\s*/ig, "let $1 = ");
    code = code.replace(/set\s+(\w+)\s*=\s*/ig, "$1 = ");

    // 3. MATH COM COLCHETES [var] E DIVISÃO ÷
    code = code.replace(/math\((.*?)\)/ig, (match, content) => {
        let transform = content.replace(/\[(.*?)\]/g, "$1"); // Tira os colchetes
        transform = transform.replace(/÷/g, "/"); // Converte divisão
        return `eval("${transform}")`;
    });

    const rngFunc = "const rng = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;";

    // 4. LÓGICA DUPLA CHECKCONSOLE (Sem Logs Automáticos)
    code = code.replace(/wait\s*\(\s*checkconsole\s*\)/ig, "await new Promise(r => { consoleResolver = r; })");
    code = code.replace(/(?<!await new Promise\(r => { consoleResolver = r; }\s*)\bcheckconsole\b/ig, "switchTab('console');");

    // 5. TRANSPILER .SOL BASE
    code = code.replace(/set function\s+(\w+)/ig, "$1 = async function()");
    code = code.replace(/create function\s+(\w+)/ig, "let $1 = async function()");
    code = code.replace(/try\s*\{([\s\S]*?)\}/ig, "try { $1 } catch(e) { /* Erro interno silencioso */ }");
    code = code.replace(/loop\s*\(([\s\S]*)\)/g, "while(true){ $1 }");
    code = code.replace(/execute\s*\((.*?)\)/ig, "await $1()");
    code = code.replace(/(?<!a)wait\s*\(/g, "await wait(");

    const finalCode = `${rngFunc}\n${code}`;

    try {
        const AsyncFunc = Object.getPrototypeOf(async function(){}).constructor;
        await new AsyncFunc(finalCode)();
    } catch (e) {
        // Apenas erros de runtime aparecem (ex: variável inexistente)
        let msg = e.message;
        if (msg.includes("is not defined")) msg = `Variavel inexistente: ${msg.split(' ')[0]}`;
        log("ERR: " + msg, "#f44336");
    }
}

// --- TERMINAL SOLTUX (SISTEMA DE COMANDOS) ---
soltuxInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
        const val = soltuxInput.value.trim();
        const [cmd, arg] = val.split(' ');
        soltuxInput.value = "";
        terminalPrint(`E:\\> ${val}`, "#fff");

        switch(cmd.toLowerCase()) {
            case "/getlib":
                if(arg && LIBS[arg]) await startSilentLoad(arg, LIBS[arg]);
                else if(arg) terminalPrint(`[ERR] Lib '${arg}' não encontrada.`, "#f44336");
                break;
            case "/rawlib":
                if(arg) await startSilentLoad("RAW", arg);
                break;
            case "/clear":
                soltuxDisplay.innerHTML = "";
                break;
            case "/help":
                terminalPrint("AVAILABLE: /getlib, /rawlib, /clear, /helpsintax", "#ffeb3b");
                break;
            case "/helpsintax":
                terminalPrint("--- .SOL SYNTAX ---", "#00ffff");
                terminalPrint("math([x] ÷ 2) | rng(1, 5)", "#fff");
                terminalPrint("create x | set x = 10", "#fff");
                terminalPrint("checkconsole | wait(checkconsole)", "#fff");
                break;
            default:
                terminalPrint(`'${cmd}' not recognized.`, "#f44336");
        }
    }
});

// Sistema de Carregamento que sobrescreve a mesma linha (1%... 100%)
async function startSilentLoad(name, url) {
    lastTerminalLine = document.createElement('div');
    lastTerminalLine.style.color = "#00ffff";
    soltuxDisplay.appendChild(lastTerminalLine);

    for (let i = 0; i <= 100; i += 20) {
        lastTerminalLine.innerText = `[${name}] Carregando: ${i}%`;
        await new Promise(r => setTimeout(r, 80));
    }

    try {
        const res = await fetch(url);
        const script = await res.text();
        const tag = document.createElement('script');
        tag.text = script;
        document.head.appendChild(tag);
        lastTerminalLine.remove(); // Limpa a linha após o sucesso (Silêncio)
    } catch (e) {
        lastTerminalLine.innerText = `[FAIL] Erro ao injetar ${name}.`;
        lastTerminalLine.style.color = "#f44336";
    }
}

// --- SISTEMA DE ARQUIVOS ---
function exportProject() {
    const code = editor.innerText;
    if (!code.trim()) return;
    const blob = new Blob([code], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "script.sol";
    a.click();
}

function handleFile(input) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            editor.innerText = e.target.result;
            updateEditor();
        };
        reader.readAsText(file);
    }
}

// --- CORE FUNCTIONS (UI & FLOW) ---
function switchTab(id) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
    
    const targetContent = document.getElementById(id);
    if(targetContent) targetContent.classList.add('active');
    
    const btn = document.querySelector(`[onclick="switchTab('${id}')"]`);
    if(btn) btn.classList.add('active');

    // Libera o wait(checkconsole) se o usuário entrar no console
    if (id === 'console' && consoleResolver) {
        consoleResolver();
        consoleResolver = null;
    }
}

window.log = (msg, color = "#4caf50") => {
    const d = document.createElement('div');
    d.style.color = color; d.innerText = `> ${msg}`;
    logOutput.appendChild(d);
};

window.wait = (ms) => new Promise(r => setTimeout(r, ms));

function clearEditor() { 
    if(confirm("Limpar tudo?")) { editor.innerText = ""; updateEditor(); }
}

function terminalPrint(msg, color) {
    const d = document.createElement('div');
    d.style.color = color; d.innerText = msg;
    soltuxDisplay.appendChild(d);
}

// --- BOOT (MENSAGENS INICIAIS) ---
editor.addEventListener('input', updateEditor);
terminalPrint("version: beta", "#lll");
terminalPrint("my email: gn375294@gmail.com", "#00ffff");
terminalPrint("SOLTUX", "#fff");
