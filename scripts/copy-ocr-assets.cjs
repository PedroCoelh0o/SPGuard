const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const destination = path.join(root, "public", "ocr");

function copyFile(source, target) {
  if (!fs.existsSync(source)) throw new Error(`Arquivo de OCR não encontrado: ${source}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyPdfWorker(source, target) {
  if (!fs.existsSync(source)) throw new Error(`Worker de PDF não encontrado: ${source}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const compatibility = `
// Compatibilidade para o Chromium 130 do Electron 33. O PDF.js 5 utiliza
// métodos binários adotados somente em versões mais recentes do navegador.
if (!("toHex" in Uint8Array.prototype)) {
  Object.defineProperty(Uint8Array.prototype, "toHex", {
    configurable: true,
    writable: true,
    value: function () {
      let output = "";
      for (const byte of this) output += byte.toString(16).padStart(2, "0");
      return output;
    },
  });
}
if (!("fromBase64" in Uint8Array)) {
  Object.defineProperty(Uint8Array, "fromBase64", {
    configurable: true,
    writable: true,
    value: function (value) {
      const binary = atob(value);
      const output = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) output[index] = binary.charCodeAt(index);
      return output;
    },
  });
}
`;
  fs.writeFileSync(target, compatibility + fs.readFileSync(source, "utf8"), "utf8");
}

function copyMatching(sourceDirectory, targetDirectory, pattern) {
  for (const name of fs.readdirSync(sourceDirectory)) {
    if (pattern.test(name)) copyFile(path.join(sourceDirectory, name), path.join(targetDirectory, name));
  }
}

copyFile(
  path.join(root, "node_modules", "tesseract.js", "dist", "worker.min.js"),
  path.join(destination, "worker.min.js"),
);
copyMatching(
  path.join(root, "node_modules", "tesseract.js-core"),
  path.join(destination, "core"),
  /^tesseract-core.*\.(?:js|wasm)$/,
);
copyFile(
  path.join(root, "node_modules", "@tesseract.js-data", "por", "4.0.0_best_int", "por.traineddata.gz"),
  path.join(destination, "lang", "por.traineddata.gz"),
);
copyPdfWorker(
  path.join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs"),
  path.join(destination, "pdf.worker.min.mjs"),
);

console.log("Recursos de OCR offline copiados para public/ocr.");
