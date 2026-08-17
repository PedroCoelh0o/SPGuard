import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type OcorrenciaPdf = {
  protocolo: string; data: string; local: string; categoria: string; status: string;
  relato: string; encaminhamentos: string; pessoas: { nome: string; tipo: string; observacao?: string }[];
  evidencias: { nome: string; tipo: string }[];
};

function val(value?: string) { return value?.trim() || "-"; }
function safeName(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "ocorrencia"; }

/** Exporta apenas dados factuais; imagens são incluídas somente quando a pessoa escolhe essa opção na tela. */
export function exportOcorrenciaPDF(item: OcorrenciaPdf, images: { titulo: string; dataUrl: string }[] = []) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.text("Ocorrência e Apuração", 40, 42);
  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.text(`Gerado localmente em ${new Date().toLocaleString("pt-BR")}`, 40, 58);
  autoTable(doc, { startY: 74, theme: "grid", body: [
    ["Protocolo", val(item.protocolo), "Status", val(item.status)],
    ["Data", val(item.data), "Categoria", val(item.categoria)],
    ["Local", val(item.local), "", ""],
  ], styles: { fontSize: 9, cellPadding: 5 }, columnStyles: { 0: { fontStyle: "bold", cellWidth: 70 }, 1: { cellWidth: 188 }, 2: { fontStyle: "bold", cellWidth: 70 }, 3: { cellWidth: 187 } } });
  let y = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 160) + 22;
  const section = (title: string) => { if (y > 720) { doc.addPage(); y = 42; } doc.setFillColor(30, 41, 59); doc.rect(40, y, 515, 18, "F"); doc.setTextColor(255, 255, 255); doc.setFontSize(10); doc.text(title, 48, y + 12); doc.setTextColor(0, 0, 0); y += 31; };
  const paragraph = (value: string) => { const lines = doc.splitTextToSize(val(value), 500); if (y + lines.length * 11 > 750) { doc.addPage(); y = 42; } doc.setFontSize(9); doc.text(lines, 48, y); y += lines.length * 11 + 18; };
  section("RELATO FÁTICO"); paragraph(item.relato);
  section("AÇÕES E ENCAMINHAMENTOS"); paragraph(item.encaminhamentos);
  section("PESSOAS VINCULADAS");
  autoTable(doc, { startY: y, head: [["Nome", "Tipo", "Observação"]], body: item.pessoas.length ? item.pessoas.map((p) => [val(p.nome), val(p.tipo), val(p.observacao)]) : [["Nenhuma pessoa registrada", "", ""]], styles: { fontSize: 8, cellPadding: 4 }, headStyles: { fillColor: [71, 85, 105] } });
  y = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y) + 22;
  section("ARQUIVOS E EVIDÊNCIAS");
  autoTable(doc, { startY: y, head: [["Arquivo", "Tipo"]], body: item.evidencias.length ? item.evidencias.map((e) => [val(e.nome), val(e.tipo)]) : [["Nenhum arquivo registrado", ""]], styles: { fontSize: 8, cellPadding: 4 }, headStyles: { fillColor: [71, 85, 105] } });
  for (const image of images) {
    doc.addPage(); doc.setFontSize(13); doc.setFont("helvetica", "bold"); doc.text(image.titulo, 40, 42);
    try { doc.addImage(image.dataUrl, "JPEG", 40, 60, 515, 650, undefined, "FAST"); } catch { /* imagem incompatível fica apenas listada */ }
  }
  doc.save(`ocorrencia-${safeName(item.protocolo || item.categoria || "registro")}.pdf`);
}
