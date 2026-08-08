// Processo principal do Electron.
// Sobe o servidor Node (gerado pelo build do TanStack Start / Nitro) e abre
// uma janela nativa apontando para ele em http://127.0.0.1:PORT.
//
// Arquivo em CommonJS (.cjs) porque o package.json do projeto usa
// "type": "module" — o processo principal do Electron continua sendo
// carregado normalmente como CommonJS através dessa extensão.

const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("node:path");
const http = require("node:http");
const { fork } = require("node:child_process");

const PORT = process.env.PORT || 3777;
// Usa 127.0.0.1 explicitamente (não "localhost") para a janela carregar a
// página. Em alguns ambientes "localhost" pode resolver para IPv6 (::1)
// para algumas requisições e IPv4 para outras, o que causa falhas
// intermitentes de conexão quando o app faz chamadas para o servidor local
// depois da carga inicial. Usando o IP direto, todas as requisições da
// página (inclusive as relativas, feitas pelo próprio app) ficam
// consistentes.
const SERVER_URL = `http://127.0.0.1:${PORT}`;

// Pasta onde ficam o banco SQLite e os arquivos anexados (fotos e
// documentos dos colaboradores). Usa a pasta de dados do usuário do
// Windows (ex.: C:\Users\<voce>\AppData\Roaming\Biz People Nexus), então
// os dados sobrevivem a atualizações/reinstalações do app. Em
// desenvolvimento (fora do pacote instalável), usa uma pasta local no
// próprio projeto.
const LOCAL_DATA_DIR = app.isPackaged
  ? path.join(app.getPath("userData"), "data")
  : path.join(__dirname, "..", "local-data");

// Em produção (empacotado), os arquivos do servidor ficam em
// resources/app-server (copiados via "extraResources" no build do
// electron-builder). Em desenvolvimento, usamos o .output gerado
// localmente por `npm run build`.
const SERVER_ENTRY = app.isPackaged
  ? path.join(process.resourcesPath, "app-server", "server", "index.mjs")
  : path.join(__dirname, "..", ".output", "server", "index.mjs");

const PUBLIC_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "app-server", "public")
  : path.join(__dirname, "..", ".output", "public");

let serverProcess = null;
let mainWindow = null;

function startServer() {
  return new Promise((resolve, reject) => {
    serverProcess = fork(SERVER_ENTRY, [], {
      env: {
        ...process.env,
        PORT: String(PORT),
        NITRO_PORT: String(PORT),
        HOST: "127.0.0.1",
        NITRO_PUBLIC_DIR: PUBLIC_DIR,
        LOCAL_DATA_DIR,
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });

    serverProcess.stdout?.on("data", (data) => process.stdout.write(`[server] ${data}`));
    serverProcess.stderr?.on("data", (data) => process.stderr.write(`[server] ${data}`));

    serverProcess.on("error", reject);
    serverProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        console.error(`Servidor encerrou com código ${code}`);
      }
    });

    waitForServer(resolve, reject);
  });
}

// Faz polling em / até o servidor responder, em vez de confiar apenas no
// texto impresso no stdout (mais robusto entre versões do Nitro).
function waitForServer(resolve, reject, attempt = 0) {
  const MAX_ATTEMPTS = 100; // ~20s
  const req = http.get(SERVER_URL, () => {
    req.destroy();
    resolve();
  });
  req.on("error", () => {
    req.destroy();
    if (attempt >= MAX_ATTEMPTS) {
      reject(new Error("Servidor não respondeu a tempo."));
      return;
    }
    setTimeout(() => waitForServer(resolve, reject, attempt + 1), 200);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#0f172a",
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  });

  Menu.setApplicationMenu(null);

  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Links externos (ex.: target="_blank") abrem no navegador padrão,
  // não dentro da janela do app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(SERVER_URL)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.loadURL(SERVER_URL);
}

app.whenReady().then(async () => {
  try {
    await startServer();
    createWindow();
  } catch (err) {
    console.error("Falha ao iniciar o servidor embutido:", err);
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    serverProcess = null;
  }
}

app.on("before-quit", stopServer);
app.on("will-quit", stopServer);
process.on("exit", stopServer);
