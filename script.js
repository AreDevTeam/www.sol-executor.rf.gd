/**
 * SOL EXECUTOR - OFFICIAL CORE
 * Developer: E (AreDev)
 * Version: 1.5.0-SECURE
 */

// --- CONFIGURATION ---
const PROXY_URL = "https://aredev-security.vercel.app/api/download?file=";

let consoleResolver = null; 
let lastTerminalLine = null; 

// UI ELEMENTS
const editor = document.getElementById('code-editor');
const lineNumbers = document.getElementById('line-numbers');
const logOutput = document.getElementById('log-output');
const soltuxDisplay = document.getElementById('soltux-display');
const soltuxInput = document.getElementById('soltux-input');

// --- 1. CORE UTILS & UI ---

function updateEditor() {
    if (!lineNumbers) return;
    const text = editor.innerText;
    const lines = text.split('\n').length;
    lineNumbers.innerHTML = Array.from({length: lines}, (_, i) => i + 1).join('<br>');
}

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

// --- 2. MODULAR INJECTION (THE BRIDGE) ---

async function importService(name) {
    if (document.getElementById(`lib-${name}`)) return; // Prevent double injection

    lastTerminalLine = document.createElement('div');
    lastTerminalLine.style.color = "#00ffff";
    soltuxDisplay.appendChild(lastTerminalLine);

    // Visual Loading Effect
    for (let i = 0; i <= 100; i += 25) {
        lastTerminalLine.innerText = `[${name}] Carregando: ${i}%`;
        await new Promise(r => setTimeout(r, 60));
    }

    try {
        const response = await fetch(`${PROXY_URL}${name}`);
        if (!response.ok) throw new Error("Acesso negado pela Proxy.");

        const code = await response.text();
        const scriptTag = document.createElement('script');
        scriptTag.id = `lib-${name}`;
        scriptTag.text = code;
        document.head.appendChild(scriptTag);
        
        lastTerminalLine.remove();
        terminalPrint(`[OK] Biblioteca '${name}' injetada com sucesso.`, "#4caf50");
    } catch (err) {
        lastTerminalLine.innerText = `[FAIL] Erro ao carregar ${name}.`;
        lastTerminalLine.style.color = "#f44336";
    }
}

// --- 3. THE TRANSPILER ENGINE ---

async function runSol() {
    let code = editor.innerText;
    
    switchTab('console');
    logOutput.innerHTML = "";

    // A. CLEANING & PRE-PROCESSING
    code = code.replace(/\/\/.*$/gm, ""); 
    code = code.replace(/\/\*[\s\S]*?\*\//g, ""); 

    // B. DYNAMIC IMPORT DETECTION
    const importRegex = /importService\s*\(\s*["'](.*?)["']\s*\)/ig;
    const matches = [...code.matchAll(importRegex)];
    for (const match of matches) {
        await importService(match[1]);
    }

    // C. FIREBASE & NETWORK CUSTOM SYNTAX (WebSol Dependent)
    code = code.replace(/setfirebase\s*\((.*?)\)/ig, "WebSol.setfirebase($1)");
    code = code.replace(/postfire\s*\((.*?)\s*,\s*(.*?)\)/ig, "await WebSol.postfire($1, $2)");
    code = code.replace(/getfire\s*\((.*?)\)\s*->\s*(\w+)/ig, "let $2 = await WebSol.getfire($1)");
    code = code.replace(/getlistfire\s*\((.*?)\)\s*->\s*(\w+)/ig, "let $2 = await WebSol.getlistfire($1)");
    code = code.replace(/postlink\s*\((.*?)\s*,\s*(.*?)\)\s*->\s*(\w+)/ig, "let $3 = await WebSol.postlink($1, $2)");
    code = code.replace(/getlink\s*\((.*?)\)\s*->\s*(\w+)/ig, "let $2 = await WebSol.getlink($1)");

    // D. MATH SYSTEM
    code = code.replace(/math\((.*?)\)/ig, (match, content) => {
        let transform = content.replace(/\[(.*?)\]/g, "$1").replace(/÷/g, "/");
        return `eval("${transform}")`;
    });

    // E. CORE .SOL SYNTAX
    code = code.replace(/create\s+(\w+)(?!\s*=)/ig, "let $1;"); 
    code = code.replace(/create\s+(\w+)\s*=\s*/ig, "let $1 = ");
    code = code.replace(/set\s+(\w+)\s*=\s*/ig, "$1 = ");
    code = code.replace(/set function\s+(\w+)/ig, "$1 = async function()");
    code = code.replace(/create function\s+(\w+)/ig, "let $1 = async function()");
    code = code.replace(/loop\s*\(([\s\S]*)\)/g, "while(true){ $1 }");
    code = code.replace(/execute\s*\((.*?)\)/ig, "await $1()");
    code = code.replace(/(?<!a)wait\s*\(/g, "await wait(");
    
    // F. CONSOLE LOGIC
    code = code.replace(/wait\s*\(\s*checkconsole\s*\)/ig, "await new Promise(r => { consoleResolver = r; })");
    code = code.replace(/(?<!await new Promise\(r => { consoleResolver = r; }\s*)\bcheckconsole\b/ig, "switchTab('console');");

    const helpers = "const rng = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;";
    const finalCode = `${helpers}\n${code}`;

    try {
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        await new AsyncFunction(finalCode)();
    } catch (err) {
        let msg = err.message;
        if (msg.includes("is not defined")) msg = `Variavel inexistente: ${msg.split(' ')[0]}`;
        log("ERR: " + msg, "#f44336");
    }
}

// --- 4. TERMINAL (SOLTUX) COMMANDS ---

soltuxInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
        const val = soltuxInput.value.trim();
        const [cmd, arg] = val.split(' ');
        soltuxInput.value = "";
        terminalPrint(`E:\\> ${val}`, "#fff");

        switch(cmd.toLowerCase()) {
            case "/getlib":
                if(arg) await importService(arg);
                else terminalPrint("[ERR] Uso: /getlib Nome", "#f44336");
                break;
            case "/clear":
                soltuxDisplay.innerHTML = "";
                break;
            case "/help":
                terminalPrint("AVAILABLE: /getlib, /clear, /helpsintax", "#ffeb3b");
                break;
            case "/helpsintax":
                terminalPrint("--- .SOL SYNTAX ---", "#00ffff");
                terminalPrint("postfire('path', var) | getfire('path') -> var", "#fff");
                terminalPrint("math([x] ÷ 2) | rng(1, 5)", "#fff");
                break;
            default:
                terminalPrint(`'${cmd}' not recognized.`, "#f44336");
        }
    }
});

// --- 5. INITIALIZATION ---
editor.addEventListener('input', updateEditor);
terminalPrint("version: beta", "#lll");
terminalPrint("my email: gn375294@gmail.com", "#00ffff");
terminalPrint("SOLTUX OS", "#fff");
