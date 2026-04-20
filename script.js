// --- DATABASE & PROXY CONFIG ---
const PROXY_URL = "https://aredev-security.vercel.app/api/download?file=";

let consoleResolver = null; // Guard for wait(checkconsole)
let lastTerminalLine = null; // For overwrite loading effect

const editor = document.getElementById('code-editor');
const lineNumbers = document.getElementById('line-numbers');
const logOutput = document.getElementById('log-output');
const soltuxDisplay = document.getElementById('soltux-display');
const soltuxInput = document.getElementById('soltux-input');

// --- EDITOR SYSTEM (LINE NUMBERS) ---
function updateEditor() {
    if (!lineNumbers) return;
    const text = editor.innerText;
    const lines = text.split('\n').length;
    lineNumbers.innerHTML = Array.from({length: lines}, (_, i) => i + 1).join('<br>');
}

// --- SECURE SERVICE IMPORTER ---
async function importService(name) {
    if (document.getElementById(`service-${name}`)) return;

    // Visual loading effect in terminal
    lastTerminalLine = document.createElement('div');
    lastTerminalLine.style.color = "#00ffff";
    soltuxDisplay.appendChild(lastTerminalLine);

    for (let i = 0; i <= 100; i += 20) {
        lastTerminalLine.innerText = `[${name}] Carregando: ${i}%`;
        await new Promise(resolve => setTimeout(resolve, 80));
    }

    try {
        const response = await fetch(`${PROXY_URL}${name}`);
        
        if (!response.ok) {
            lastTerminalLine.innerText = `[🚫 SEC] Falha ao validar ${name} na Proxy.`;
            lastTerminalLine.style.color = "#f44336";
            return;
        }

        const scriptContent = await response.text();
        const scriptTag = document.createElement('script');
        scriptTag.id = `service-${name}`;
        scriptTag.text = scriptContent;
        document.head.appendChild(scriptTag);
        
        lastTerminalLine.remove(); // Clear loading line on success
        terminalPrint(`[OK] Serviço '${name}' injetado com sucesso.`, "#4caf50");
    } catch (error) {
        lastTerminalLine.innerText = `[ERR] Erro de conexão com aredev-security.`;
        lastTerminalLine.style.color = "#f44336";
    }
}

// --- MAIN ENGINE .SOL ---
async function runSol() {
    let code = editor.innerText;
    
    switchTab('console');
    logOutput.innerHTML = "";

    // 1. CLEANING COMMENTS
    code = code.replace(/\/\/.*$/gm, ""); 
    code = code.replace(/\/\*[\s\S]*?\*\//g, ""); 

    // 2. AUTOMATIC SERVICE DETECTION
    const importRegex = /importService\s*\(\s*["'](.*?)["']\s*\)/ig;
    const matches = [...code.matchAll(importRegex)];
    for (const match of matches) {
        await importService(match[1]);
    }

    // 3. VARIABLE & SYNTAX TREATMENT
    code = code.replace(/create\s+(\w+)(?!\s*=)/ig, "let $1;"); 
    code = code.replace(/create\s+(\w+)\s*=\s*/ig, "let $1 = ");
    code = code.replace(/set\s+(\w+)\s*=\s*/ig, "$1 = ");

    // 4. MATH WITH BRACKETS [] AND DIVISION ÷
    code = code.replace(/math\((.*?)\)/ig, (match, content) => {
        let transform = content.replace(/\[(.*?)\]/g, "$1").replace(/÷/g, "/");
        return `eval("${transform}")`;
    });

    // 5. CHECKCONSOLE LOGIC
    code = code.replace(/wait\s*\(\s*checkconsole\s*\)/ig, "await new Promise(r => { consoleResolver = r; })");
    code = code.replace(/(?<!await new Promise\(r => { consoleResolver = r; }\s*)\bcheckconsole\b/ig, "switchTab('console');");

    // 6. BASE TRANSPILER
    code = code.replace(/set function\s+(\w+)/ig, "$1 = async function()");
    code = code.replace(/create function\s+(\w+)/ig, "let $1 = async function()");
    code = code.replace(/loop\s*\(([\s\S]*)\)/g, "while(true){ $1 }");
    code = code.replace(/execute\s*\((.*?)\)/ig, "await $1()");
    code = code.replace(/(?<!a)wait\s*\(/g, "await wait(");

    const rngHelper = "const rng = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;";
    const finalExecutableCode = `${rngHelper}\n${code}`;

    try {
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        await new AsyncFunction(finalExecutableCode)();
    } catch (err) {
        let errorMsg = err.message;
        if (errorMsg.includes("is not defined")) errorMsg = `Variavel inexistente: ${errorMsg.split(' ')[0]}`;
        log("ERR: " + errorMsg, "#f44336");
    }
}

// --- SOLTUX TERMINAL ---
soltuxInput.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') {
        const inputVal = soltuxInput.value.trim();
        const [command, argument] = inputVal.split(' ');
        soltuxInput.value = "";
        terminalPrint(`E:\\> ${inputVal}`, "#fff");

        switch(command.toLowerCase()) {
            case "/getlib":
                if(argument) {
                    await importService(argument);
                } else {
                    terminalPrint("[ERR] Uso: /getlib NomeDaLib", "#f44336");
                }
                break;
            case "/clear":
                soltuxDisplay.innerHTML = "";
                break;
            case "/help":
                terminalPrint("AVAILABLE: /getlib, /clear, /helpsintax", "#ffeb3b");
                break;
            case "/helpsintax":
                terminalPrint("--- .SOL SYNTAX ---", "#00ffff");
                terminalPrint("math([x] ÷ 2) | rng(1, 5)", "#fff");
                terminalPrint("create x | set x = 10", "#fff");
                terminalPrint("checkconsole | wait(checkconsole)", "#fff");
                terminalPrint("create function | log()", "#fff");
                break;
            default:
                terminalPrint(`'${command}' not recognized.`, "#f44336");
        }
    }
});

// --- UI & CORE UTILS ---
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.content').forEach(content => content.classList.remove('active'));
    
    document.getElementById(tabId)?.classList.add('active');
    document.querySelector(`[onclick="switchTab('${tabId}')"]`)?.classList.add('active');

    if (tabId === 'console' && consoleResolver) {
        consoleResolver();
        consoleResolver = null;
    }
}

window.log = (message, color = "#4caf50") => {
    const logLine = document.createElement('div');
    logLine.style.color = color; logLine.innerText = `> ${message}`;
    logOutput.appendChild(logLine);
};

window.wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function terminalPrint(message, color) {
    const terminalLine = document.createElement('div');
    terminalLine.style.color = color; terminalLine.innerText = message;
    soltuxDisplay.appendChild(terminalLine);
}

// --- BOOT MESSAGES ---
editor.addEventListener('input', updateEditor);
terminalPrint("version: beta", "#bbb");
terminalPrint("my email: gn375294@gmail.com", "#00ffff");
terminalPrint("SOLTUX", "#fff");
