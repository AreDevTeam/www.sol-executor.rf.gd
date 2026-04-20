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

window.clear = () => {
    logOutput.innerHTML = "";
};

window.alert = (msg) => {
    log(`⚠️ ${msg}`, "#ff9800");
};

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
    
    terminalPrint("┌─ VARIABLES ─────────────────────────────────────────────┐", "#00bcd4");
    terminalPrint("│ create name              → Declare variable             │", "#fff");
    terminalPrint("│ create name = value      → Declare and assign           │", "#fff");
    terminalPrint("│ set name = value         → Update variable              │", "#fff");
    terminalPrint("│ delete name              → Remove variable              │", "#fff");
    terminalPrint("└─────────────────────────────────────────────────────────┘", "#00bcd4");
    terminalPrint("", "#fff");
    
    terminalPrint("┌─ FUNCTIONS ─────────────────────────────────────────────┐", "#00bcd4");
    terminalPrint("│ create function name     → Declare function             │", "#fff");
    terminalPrint("│ create function name(x)  → Function with parameters     │", "#fff");
    terminalPrint("│ set function             → End function block           │", "#fff");
    terminalPrint("│ execute(name)            → Call function                │", "#fff");
    terminalPrint("│ return value             → Return from function         │", "#fff");
    terminalPrint("└─────────────────────────────────────────────────────────┘", "#00bcd4");
    terminalPrint("", "#fff");
    
    terminalPrint("┌─ CONDITIONALS ──────────────────────────────────────────┐", "#00bcd4");
    terminalPrint("│ fit (condition) { }      → If statement                 │", "#fff");
    terminalPrint("│ ifnot { }                → Else block                   │", "#fff");
    terminalPrint("└─────────────────────────────────────────────────────────┘", "#00bcd4");
    terminalPrint("", "#fff");
    
    terminalPrint("┌─ LOOPS ─────────────────────────────────────────────────┐", "#00bcd4");
    terminalPrint("│ loop(code)               → Infinite loop                │", "#fff");
    terminalPrint("│ repeat 10 times { }      → Loop N times                 │", "#fff");
    terminalPrint("│ foreach item in arr { }  → Iterate array                │", "#fff");
    terminalPrint("│ break loop               → Exit loop                    │", "#fff");
    terminalPrint("│ continue loop            → Skip iteration               │", "#fff");
    terminalPrint("└─────────────────────────────────────────────────────────┘", "#00bcd4");
    terminalPrint("", "#fff");
    
    terminalPrint("┌─ CONSOLE OUTPUT ────────────────────────────────────────┐", "#00bcd4");
    terminalPrint("│ log(message)             → Default log (green)          │", "#fff");
    terminalPrint("│ print(message)           → Same as log                  │", "#fff");
    terminalPrint("│ error(message)           → Red error message            │", "#fff");
    terminalPrint("│ warn(message)            → Orange warning               │", "#fff");
    terminalPrint("│ success(message)         → Green success message        │", "#fff");
    terminalPrint("│ checkconsole             → Switch to console tab        │", "#fff");
    terminalPrint("└─────────────────────────────────────────────────────────┘", "#00bcd4");
    terminalPrint("", "#fff");
    
    terminalPrint("┌─ TIME & DATE ───────────────────────────────────────────┐", "#00bcd4");
    terminalPrint("│ hour                     → Current hour (0-23)          │", "#fff");
    terminalPrint("│ minutes                  → Current minutes (0-59)       │", "#fff");
    terminalPrint("│ seconds                  → Current seconds (0-59)       │", "#fff");
    terminalPrint("│ day                      → Current day of month         │", "#fff");
    terminalPrint("│ month                    → Current month (1-12)         │", "#fff");
    terminalPrint("│ year                     → Current year                 │", "#fff");
    terminalPrint("│ timestamp                → Unix timestamp (ms)          │", "#fff");
    terminalPrint("│ wait(1000)               → Pause execution (ms)         │", "#fff");
    terminalPrint("└─────────────────────────────────────────────────────────┘", "#00bcd4");
    terminalPrint("", "#fff");
    
    terminalPrint("┌─ MATH ──────────────────────────────────────────────────┐", "#00bcd4");
    terminalPrint("│ math(2 + 2)              → Evaluate expression          │", "#fff");
    terminalPrint("│ math([variable] * 5)     → Use variables in math        │", "#fff");
    terminalPrint("│ random                   → Random 0-1                   │", "#fff");
    terminalPrint("│ random 1 to 100          → Random integer in range      │", "#fff");
    terminalPrint("│ rng(min, max)            → Random number function       │", "#fff");
    terminalPrint("└─────────────────────────────────────────────────────────┘", "#00bcd4");
    terminalPrint("", "#fff");
    
    terminalPrint("┌─ ARRAYS ────────────────────────────────────────────────┐", "#00bcd4");
    terminalPrint("│ array [1, 2, 3]          → Create array                 │", "#fff");
    terminalPrint("│ length of arr            → Get array length             │", "#fff");
    terminalPrint("│ push item to arr         → Add to end                   │", "#fff");
    terminalPrint("│ remove from arr at 0     → Remove by index              │", "#fff");
    terminalPrint("└─────────────────────────────────────────────────────────┘", "#00bcd4");
    terminalPrint("", "#fff");
    
    terminalPrint("┌─ FIREBASE (WebSol) ─────────────────────────────────────┐", "#00bcd4");
    terminalPrint("│ setfirebase(config)      → Initialize Firebase          │", "#fff");
    terminalPrint("│ postfire(path, data)     → Write to Firebase            │", "#fff");
    terminalPrint("│ postfire(path)           → Post with auto-value         │", "#fff");
    terminalPrint("│ getfire(path) -> var     → Read from Firebase           │", "#fff");
    terminalPrint("└─────────────────────────────────────────────────────────┘", "#00bcd4");
    terminalPrint("", "#fff");
    
    terminalPrint("┌─ LIBRARIES ─────────────────────────────────────────────┐", "#00bcd4");
    terminalPrint("│ importService('name')    → Load external library        │", "#fff");
    terminalPrint("└─────────────────────────────────────────────────────────┘", "#00bcd4");
    terminalPrint("", "#fff");
    
    terminalPrint("┌─ HELPER FUNCTIONS ──────────────────────────────────────┐", "#00bcd4");
    terminalPrint("│ sleep(ms)                → Async wait                   │", "#fff");
    terminalPrint("│ range(1, 10)             → Generate number array        │", "#fff");
    terminalPrint("│ shuffle(array)           → Randomize array order        │", "#fff");
    terminalPrint("│ pick(array)              → Get random element           │", "#fff");
    terminalPrint("└─────────────────────────────────────────────────────────┘", "#00bcd4");
    terminalPrint("", "#fff");
    
    terminalPrint("┌─ EXAMPLES ──────────────────────────────────────────────┐", "#00bcd4");
    terminalPrint("│ create x = 10                                           │", "#fff");
    terminalPrint("│ fit (x > 5) {                                           │", "#fff");
    terminalPrint("│     log('X is greater than 5')                          │", "#fff");
    terminalPrint("│ ifnot {                                                 │", "#fff");
    terminalPrint("│     log('X is 5 or less')                               │", "#fff");
    terminalPrint("│ }                                                       │", "#fff");
    terminalPrint("│                                                         │", "#fff");
    terminalPrint("│ repeat 5 times {                                        │", "#fff");
    terminalPrint("│     print('Hello World')                                │", "#fff");
    terminalPrint("│     wait(1000)                                          │", "#fff");
    terminalPrint("│ }                                                       │", "#fff");
    terminalPrint("│                                                         │", "#fff");
    terminalPrint("│ create function greet(name) {                           │", "#fff");
    terminalPrint("│     success('Hello ' + name)                            │", "#fff");
    terminalPrint("│ set function                                            │", "#fff");
    terminalPrint("│                                                         │", "#fff");
    terminalPrint("│ execute(greet('World'))                                 │", "#fff");
    terminalPrint("└─────────────────────────────────────────────────────────┘", "#00bcd4");
    terminalPrint("", "#fff");
    
    terminalPrint("═══════════════════════════════════════════════════════════", "#00ffff");
    terminalPrint("For terminal commands, type /help", "#bbb");
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

async function runSol() {
    let code = editor.innerText.trim();
    
    if (!code) {
        log("No code to execute.", "#ff9800");
        return;
    }

    switchTab('console');
    logOutput.innerHTML = "";
    log("🚀 Execution started...", "#2196f3");

    code = code.replace(/\/\/.*$/gm, "");
    code = code.replace(/\/\*[\s\S]*?\*\//g, "");

    const importRegex = /importService\s*\(\s*["'](.*?)["']\s*\)/ig;
    const matches = [...code.matchAll(importRegex)];
    for (const match of matches) await importService(match[1]);

    code = code.replace(/setfirebase\s*\((.*?)\)/ig, "WebSol.setfirebase($1)");
    code = code.replace(/postfire\s*\((.*?)\s*,\s*(.*?)\)/ig, "await WebSol.postfire($1, $2)");
    code = code.replace(/postfire\s*\((['"][\w\s/]+['"])\)(?!\s*,)/ig, "await WebSol.postfire($1, true)");
    code = code.replace(/getfire\s*\((.*?)\)\s*->\s*(\w+)/ig, "let $2 = await WebSol.getfire($1)");

    code = code.replace(/math\((.*?)\)/ig, (match, content) => {
        let transform = content.replace(/\[(.*?)\]/g, "$1").replace(/÷/g, "/").replace(/×/g, "*");
        return `eval(\`${transform}\`)`;
    });

    code = code.replace(/\bhour\b/ig, "(new Date().getHours())");
    code = code.replace(/\bminutes\b/ig, "(new Date().getMinutes())");
    code = code.replace(/\bseconds\b/ig, "(new Date().getSeconds())");
    code = code.replace(/\bday\b/ig, "(new Date().getDate())");
    code = code.replace(/\bmonth\b/ig, "(new Date().getMonth() + 1)");
    code = code.replace(/\byear\b/ig, "(new Date().getFullYear())");
    code = code.replace(/\btimestamp\b/ig, "(Date.now())");

    code = code.replace(/\bfit\s*\(/ig, "if (");
    code = code.replace(/\bifnot\s*{/ig, "} else {");
    code = code.replace(/\bifnot\b/ig, "else");

    code = code.replace(/create\s+(\w+)(?!\s*=)/ig, "let $1;");
    code = code.replace(/create\s+(\w+)\s*=\s*/ig, "let $1 = ");
    code = code.replace(/set\s+(\w+)\s*=\s*/ig, "$1 = ");
    code = code.replace(/delete\s+(\w+)/ig, "$1 = undefined;");

    code = code.replace(/create\s+function\s+(\w+)\s*\(/ig, "let $1 = async function(");
    code = code.replace(/create\s+function\s+(\w+)/ig, "let $1 = async function() {");
    code = code.replace(/set\s+function/ig, "};");
    code = code.replace(/return\s+/ig, "return ");

    code = code.replace(/loop\s*\(([\s\S]*?)\)/g, "while(true){ $1 }");
    code = code.replace(/repeat\s+(\d+)\s+times\s*{/ig, "for(let __i=0; __i<$1; __i++){");
    code = code.replace(/foreach\s+(\w+)\s+in\s+(\w+)\s*{/ig, "for(let $1 of $2){");
    code = code.replace(/break\s+loop/ig, "break");
    code = code.replace(/continue\s+loop/ig, "continue");
    
    code = code.replace(/execute\s*\((.*?)\)/ig, "await $1()");
    code = code.replace(/(?<!a)wait\s*\(/g, "await wait(");

    code = code.replace(/wait\s*\(\s*checkconsole\s*\)/ig, "await new Promise(r => { consoleResolver = r; })");
    code = code.replace(/(?<!await new Promise\(r => { consoleResolver = r; }\s*)\bcheckconsole\b/ig, "switchTab('console');");

    code = code.replace(/print\s*\((.*?)\)/ig, "log($1)");
    code = code.replace(/error\s*\((.*?)\)/ig, "log($1, '#f44336')");
    code = code.replace(/warn\s*\((.*?)\)/ig, "log($1, '#ff9800')");
    code = code.replace(/success\s*\((.*?)\)/ig, "log($1, '#4caf50')");

    code = code.replace(/array\s*\[(.*?)\]/ig, "[$1]");
    code = code.replace(/object\s*{(.*?)}/ig, "{$1}");
    code = code.replace(/length\s+of\s+(\w+)/ig, "$1.length");
    code = code.replace(/push\s+(\w+)\s+to\s+(\w+)/ig, "$2.push($1)");
    code = code.replace(/remove\s+from\s+(\w+)\s+at\s+(\d+)/ig, "$1.splice($2, 1)");

    code = code.replace(/random\s+(\d+)\s+to\s+(\d+)/ig, "rng($1, $2)");
    code = code.replace(/random/ig, "Math.random()");

    const helpers = `
        const rng = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const range = (start, end) => Array.from({length: end - start + 1}, (_, i) => start + i);
        const shuffle = arr => arr.sort(() => Math.random() - 0.5);
        const pick = arr => arr[Math.floor(Math.random() * arr.length)];
    `;

    const finalCode = `${helpers}\n${code}`;

    try {
        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
        const startTime = Date.now();
        await new AsyncFunction(finalCode)();
        const executionTime = Date.now() - startTime;
        log(`✓ Execution completed in ${executionTime}ms`, "#4caf50");
    } catch (err) {
        log(`✗ RUNTIME ERROR: ${err.message}`, "#f44336");
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
        version: "1.7.3",
        developer: "AreDev",
        created: new Date().toISOString(),
        lines: code.split('\n').length
    };
    
    zip.file("script.sol", code);
    zip.file("metadata.json", JSON.stringify(metadata, null, 2));
    zip.file("README.md", `# SOL Project Export\n\nVersion: ${metadata.version}\nCreated: ${metadata.created}\nLines: ${metadata.lines}`);
    
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
    reader.onerror = () => {
        log("Failed to read file.", "#f44336");
    };
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
                terminalPrint("SOL Executor v2.0.0 Enhanced Edition", "#00ffff");
                terminalPrint("Developer: AreDev", "#00ffff");
                break;
            
            case "/help":
                terminalPrint("═══════════════════════════════════════", "#00ffff");
                terminalPrint("        SOLTUX TERMINAL COMMANDS        ", "#fff");
                terminalPrint("═══════════════════════════════════════", "#00ffff");
                terminalPrint("", "#fff");
                terminalPrint("  /getlib <name>  - Load external library", "#fff");
                terminalPrint("  /clear          - Clear terminal screen", "#fff");
                terminalPrint("  /ver            - Show version info", "#fff");
                terminalPrint("  /help           - Show terminal commands", "#fff");
                terminalPrint("  /helpsyntax     - Show SOL syntax guide", "#fff");
                terminalPrint("  /save           - Save code to browser storage", "#fff");
                terminalPrint("  /load           - Load code from storage", "#fff");
                terminalPrint("  /debug on/off   - Toggle debug mode", "#fff");
                terminalPrint("  /export         - Export project as ZIP", "#fff");
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

window.addEventListener('beforeunload', (e) => {
    if (editor.innerText.trim()) {
        saveToLocalStorage();
    }
});

terminalPrint("═══════════════════════════════════════", "#00ffff");
terminalPrint("  SOL EXECUTOR v1.7.3 Enhanced Edition", "#fff");
terminalPrint("  Developer: AreDev", "#00bcd4");
terminalPrint("═══════════════════════════════════════", "#00ffff");
terminalPrint("Type /help for commands | /helpsyntax for syntax", "#bbb");
terminalPrint("", "#fff");

loadFromLocalStorage();
startAutoSave();
updateEditor();
