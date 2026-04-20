/**
 * SOL EXECUTOR - OFFICIAL CORE
 * Developer: E (AreDev)
 * Version: 1.6.0
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
    const lines = text.split('\n').length || 1;
    lineNumbers.innerHTML = Array.from({length: lines}, (_, i) => i + 1).join('<br>');
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.content').forEach(content => content.classList.remove('active'));
    
    document.getElementById(tabId)?.classList.add('active');
    const targetBtn = document.querySelector(`[onclick="switchTab('${tabId}')"]`);
    if (targetBtn) targetBtn.classList.add('active');

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
    soltuxDisplay.scrollTop = soltuxDisplay.scrollHeight;
}

// --- 2. MODULAR INJECTION (THE BRIDGE) ---

async function importService(name) {
    if (document.getElementById(`lib-${name}`)) return; 

    lastTerminalLine = document.createElement('div');
    lastTerminalLine.style.color = "#00ffff";
    soltuxDisplay.appendChild(lastTerminalLine);

    for (let i = 0; i <= 100; i += 25) {
        lastTerminalLine.innerText = `[${name}] Loading: ${i}%`;
        await new Promise(r => setTimeout(r, 60));
    }

    try {
        const response = await fetch(`${PROXY_URL}${name}`);
        if (!response.ok) throw new Error("Proxy access denied.");

        const code = await response.text();
        const scriptTag = document.createElement('script');
        scriptTag.id = `lib-${name}`;
        scriptTag.text = code;
        document.head.appendChild(scriptTag);
        
        lastTerminalLine.remove();
        terminalPrint(`[OK] Service '${name}' injected successfully.`, "#4caf50");
    } catch (err) {
        lastTerminalLine.innerText = `[FAIL] Error loading ${name}.`;
        lastTerminalLine.style.color = "#f44336";
    }
}

// --- 3. THE TRANSPILER ENGINE ---

async function runSol() {
    let code = editor.innerText;
    
    switchTab('console');
    logOutput.innerHTML = "";

    // A. CLEANING
    code = code.replace(/\/\/.*$/gm, ""); 
    code = code.replace(/\/\*[\s\S]*?\*\//g, ""); 

    // B. DYNAMIC IMPORT
    const importRegex = /importService\s*\(\s*["'](.*?)["']\s*\)/ig;
    const matches = [...code.matchAll(importRegex)];
    for (const match of matches) await importService(match[1]);

    // C. NETWORK (WebSol)
    code = code.replace(/setfirebase\s*\((.*?)\)/ig, "WebSol.setfirebase($1)");
    code = code.replace(/postfire\s*\((.*?)\s*,\s*(.*?)\)/ig, "await WebSol.postfire($1, $2)");
    code = code.replace(/postfire\s*\((['"][\w\s/]+['"])\)(?!\s*,)/ig, "await WebSol.postfire($1, true)");
    code = code.replace(/getfire\s*\((.*?)\)\s*->\s*(\w+)/ig, "let $2 = await WebSol.getfire($1)");
    code = code.replace(/getlistfire\s*\((.*?)\)\s*->\s*(\w+)/ig, "let $2 = await WebSol.getlistfire($1)");
    code = code.replace(/postlink\s*\((.*?)\s*,\s*(.*?)\)\s*->\s*(\w+)/ig, "let $3 = await WebSol.postlink($1, $2)");
    code = code.replace(/getlink\s*\((.*?)\)\s*->\s*(\w+)/ig, "let $2 = await WebSol.getlink($1)");

    // D. MATH
    code = code.replace(/math\((.*?)\)/ig, (match, content) => {
        let transform = content.replace(/\[(.*?)\]/g, "$1").replace(/÷/g, "/");
        return `eval("${transform}")`;
    });

    // E. TIME VARIABLES
    code = code.replace(/\bhour\b/ig, "(new Date().getHours())");
    code = code.replace(/\bminutes\b/ig, "(new Date().getMinutes())");
    code = code.replace(/\bseconds\b/ig, "(new Date().getSeconds())");
    code = code.replace(/\bday\b/ig, "(new Date().getDate())");
    code = code.replace(/\bmonth\b/ig, "(new Date().getMonth() + 1)");
    code = code.replace(/\byear\b/ig, "(new Date().getFullYear())");

    // F. CORE .SOL SYNTAX
    code = code.replace(/create\s+(\w+)(?!\s*=)/ig, "let $1;"); 
    code = code.replace(/create\s+(\w+)\s*=\s*/ig, "let $1 = ");
    code = code.replace(/set\s+(\w+)\s*=\s*/ig, "$1 = ");
    code = code.replace(/set function\s+(\w+)/ig, "$1 = async function()");
    code = code.replace(/create function\s+(\w+)/ig, "let $1 = async function()");
    code = code.replace(/loop\s*\(([\s\S]*)\)/g, "while(true){ $1 }");
    code = code.replace(/execute\s*\((.*?)\)/ig, "await $1()");
    code = code.replace(/(?<!a)wait\s*\(/g, "await wait(");
    
    // G. CONSOLE LOGIC
    code = code.replace(/wait\s*\(\s*checkconsole\s*\)/ig, "await new Promise(r => { consoleResolver = r; })");
    code = code.replace(/(?<!await new Promise\(r => { consoleResolver = r; }\s*)\bcheckconsole\b/ig, "switchTab('console');");

    const helpers = "const rng = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;";
    const finalCode = `${helpers}\n${code}`;

    try {
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        await new AsyncFunction(finalCode)();
    } catch (err) {
        log("RUNTIME ERR: " + err.message, "#f44336");
    }
}

// --- 4. EXPORT & CLEAR & IMPORT ---

async function exportProject() {
    if (typeof JSZip === "undefined") {
        terminalPrint("[ERR] JSZip library not loaded!", "#f44336");
        return;
    }

    const zip = new JSZip();
    const code = editor.innerText;
    if (!code.trim()) return alert("Editor is empty!");

    // Extract libs for XML
    const importRegex = /importService\s*\(\s*["'](.*?)["']\s*\)/ig;
    const libs = [...code.matchAll(importRegex)].map(m => m[1]);

    // XML Structure
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<project>\n    <version>100.60000.0</version>\n    <libraries>\n`;
    libs.forEach(l => xml += `        <library>${l}</library>\n`);
    xml += `    </libraries>\n</project>`;

    zip.file("script.sol", code);
    zip.file("libs.xml", xml);

    const content = await zip.generateAsync({type:"blob"});
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SOL_Project_${Date.now()}.zip`;
    a.click();
    terminalPrint("[SYSTEM] Project exported as ZIP.", "#4caf50");
}

function clearEditor() {
    if (confirm("Clear all code?")) {
        editor.innerText = "";
        updateEditor();
        terminalPrint("[SYSTEM] Editor cleared.", "#ffeb3b");
    }
}

function handleFile(input) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            editor.innerText = e.target.result;
            updateEditor();
            terminalPrint(`[SYSTEM] Loaded: ${file.name}`, "#4caf50");
        };
        reader.readAsText(file);
    }
}

// --- 5. TERMINAL (SOLTUX) ---

soltuxInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
        const val = soltuxInput.value.trim();
        const [cmd, arg] = val.split(' ');
        soltuxInput.value = "";
        terminalPrint(`E:\\> ${val}`, "#fff");

        switch(cmd.toLowerCase()) {
            case "/getlib":
                if(arg) await importService(arg);
                break;
            case "/clear":
                soltuxDisplay.innerHTML = "";
                break;
            case "/help":
                terminalPrint("COMMANDS: /getlib, /clear, /ver", "#ffeb3b");
                break;
            case "/ver":
                terminalPrint("SOL v1.6.0", "#00ffff");
                break;
            default:
                terminalPrint(`Unknown command: ${cmd}`, "#f44336");
        }
    }
});

// --- 6. INITIALIZATION ---
editor.addEventListener('input', updateEditor);
terminalPrint("version: 1.6.0", "#lll");
terminalPrint("my email: gn375294@gmail.com", "#00ffff");
terminalPrint("SOLTUX OS", "#fff");
