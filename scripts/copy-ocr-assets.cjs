const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const destination = path.join(root, "public", "ocr");

function copyFile(source, target) {
  if (!fs.existsSync(source)) throw new Error(`Arquivo de OCR não encontrado: ${source}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
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
copyFile(
  path.join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs"),
  path.join(destination, "pdf.worker.min.mjs"),
);

console.log("Recursos de OCR offline copiados para public/ocr.");
