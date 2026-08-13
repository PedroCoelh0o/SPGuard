import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileScan, Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { equipamentoTemDados, equipamentoVazio, lerFormularioOffline, type DadosPortadorOcr, type EquipamentoOcr, type ProgressoOcr, type ResultadoFormularioOcr } from "@/lib/formulario-ocr";

export type AutorizacaoConfirmada = {
  portador: DadosPortadorOcr;
  equipamentos: EquipamentoOcr[];
  justificativa: string;
};

const emptyPortador: DadosPortadorOcr = { nome: "", funcao: "", identidade: "", empresa: "", matricula: "", cpf: "" };

function Field({ label, value, onChange, warning }: { label: string; value: string; onChange: (value: string) => void; warning?: boolean }) {
  return <div><Label className={warning ? "text-amber-700 dark:text-amber-400" : ""}>{label}{warning ? " - confira" : ""}</Label><Input value={value} onChange={(event) => onChange(event.target.value)} className={warning ? "border-amber-500" : ""} /></div>;
}

function EquipmentFields({ value, onChange }: { value: EquipamentoOcr; onChange: (value: EquipamentoOcr) => void }) {
  const set = (key: keyof EquipamentoOcr, fieldValue: string) => onChange({ ...value, [key]: fieldValue });
  return <div className="grid gap-3 sm:grid-cols-2">
    <Field label="Marca" value={value.marca} onChange={(v) => set("marca", v)} />
    <Field label="Modelo" value={value.modelo} onChange={(v) => set("modelo", v)} />
    <Field label="Número de série" value={value.numero_serie} onChange={(v) => set("numero_serie", v)} warning={!value.numero_serie} />
    {value.tipo === "celular" && <Field label="IMEI" value={value.imei} onChange={(v) => set("imei", v)} warning={!value.imei} />}
    <Field label="Acessórios" value={value.acessorios} onChange={(v) => set("acessorios", v)} />
    <Field label="Contato" value={value.contato} onChange={(v) => set("contato", v)} />
  </div>;
}

export function AutorizacaoDigitalizadaDialog({ file, colaboradorNome, onClose, onConfirm, saving }: {
  file: File | null;
  colaboradorNome: string;
  onClose: () => void;
  onConfirm: (data: AutorizacaoConfirmada) => void;
  saving: boolean;
}) {
  const [progress, setProgress] = useState<ProgressoOcr>({ etapa: "Aguardando documento", percentual: 0 });
  const [result, setResult] = useState<ResultadoFormularioOcr | null>(null);
  const [error, setError] = useState("");
  const [portador, setPortador] = useState(emptyPortador);
  const [celular, setCelular] = useState(equipamentoVazio("celular"));
  const [notebook, setNotebook] = useState(equipamentoVazio("notebook"));
  const [justificativa, setJustificativa] = useState("");
  const [includeCelular, setIncludeCelular] = useState(false);
  const [includeNotebook, setIncludeNotebook] = useState(false);

  useEffect(() => {
    let active = true;
    if (!file) return;
    setResult(null); setError(""); setProgress({ etapa: "Preparando documento", percentual: 1 });
    void lerFormularioOffline(file, (value) => active && setProgress(value)).then((value) => {
      if (!active) return;
      setResult(value); setPortador(value.portador); setCelular(value.celular); setNotebook(value.notebook); setJustificativa(value.justificativa);
      setIncludeCelular(equipamentoTemDados(value.celular)); setIncludeNotebook(equipamentoTemDados(value.notebook));
    }).catch((reason) => active && setError(reason instanceof Error ? reason.message : "Não foi possível ler o documento."));
    return () => { active = false; };
  }, [file]);

  const setPortadorField = (key: keyof DadosPortadorOcr, value: string) => setPortador((previous) => ({ ...previous, [key]: value }));
  const nomeDivergente = !!portador.nome && portador.nome.localeCompare(colaboradorNome, "pt-BR", { sensitivity: "base" }) !== 0;
  const canConfirm = !!result && !saving && (includeCelular || includeNotebook);

  return <Dialog open={!!file} onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><FileScan className="h-5 w-5" /> Ler autorização digitalizada</DialogTitle>
        <DialogDescription>Confira e corrija os dados. Nada será salvo antes da sua confirmação.</DialogDescription>
      </DialogHeader>

      {!result && !error && <div className="py-12 space-y-4 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /><p className="font-medium">{progress.etapa}</p><div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${progress.percentual}%` }} /></div><p className="text-xs text-muted-foreground">O reconhecimento está acontecendo somente neste computador.</p></div>}
      {error && <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4"><p className="font-medium text-destructive">Não foi possível fazer a leitura automática.</p><p className="text-sm mt-1">{error}</p><p className="text-sm mt-2">O documento não foi salvo. Feche esta janela e tente novamente com um PDF ou imagem mais nítida.</p></div>}

      {result && <div className="space-y-5">
        <div className="flex flex-wrap gap-3 items-center rounded-md border bg-muted/40 p-3 text-sm">
          <span className="flex items-center gap-1"><LockKeyhole className="h-4 w-4 text-emerald-600" /> OCR 100% offline</span>
          <span>Confiança geral estimada: <strong>{result.confianca}%</strong></span>
          {result.confianca < 70 && <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400"><AlertTriangle className="h-4 w-4" /> Revise todos os campos com atenção</span>}
        </div>

        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-md border bg-black/5 min-h-[420px] flex items-center justify-center overflow-hidden"><img src={result.imagem} alt="Formulário digitalizado" className="max-h-[70vh] w-full object-contain" /></div>
          <div className="space-y-5">
            <section className="space-y-3"><h3 className="font-semibold">Dados do portador/colaborador</h3><p className="text-xs text-muted-foreground">Use estes campos para conferir se o documento pertence a <strong>{colaboradorNome}</strong>. Eles não substituem automaticamente a ficha.</p><div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome" value={portador.nome} onChange={(v) => setPortadorField("nome", v)} warning={nomeDivergente || !portador.nome} />
              <Field label="Função" value={portador.funcao} onChange={(v) => setPortadorField("funcao", v)} />
              <Field label="Identidade" value={portador.identidade} onChange={(v) => setPortadorField("identidade", v)} />
              <Field label="Empresa" value={portador.empresa} onChange={(v) => setPortadorField("empresa", v)} />
              <Field label="Matrícula" value={portador.matricula} onChange={(v) => setPortadorField("matricula", v)} />
              <Field label="CPF" value={portador.cpf} onChange={(v) => setPortadorField("cpf", v)} />
            </div></section>

            <section className="space-y-3 rounded-md border p-3"><label className="flex gap-2 items-center font-semibold"><Checkbox checked={includeCelular} onCheckedChange={(checked) => setIncludeCelular(checked === true)} /> Cadastrar celular</label>{includeCelular && <EquipmentFields value={celular} onChange={setCelular} />}</section>
            <section className="space-y-3 rounded-md border p-3"><label className="flex gap-2 items-center font-semibold"><Checkbox checked={includeNotebook} onCheckedChange={(checked) => setIncludeNotebook(checked === true)} /> Cadastrar notebook</label>{includeNotebook && <EquipmentFields value={notebook} onChange={setNotebook} />}</section>
            <section><Label>Justificativa</Label><Textarea rows={4} value={justificativa} onChange={(event) => setJustificativa(event.target.value)} placeholder="Corrija ou preencha a justificativa apresentada no formulário." /></section>
          </div>
        </div>
        {nomeDivergente && <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm flex gap-2"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" /><span>O nome lido não coincide com a ficha aberta. Confirme se o documento pertence ao colaborador correto antes de salvar.</span></div>}
      </div>}

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button disabled={!canConfirm} onClick={() => onConfirm({ portador, equipamentos: [includeCelular ? celular : null, includeNotebook ? notebook : null].filter((item): item is EquipamentoOcr => !!item), justificativa })}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {saving ? "Salvando..." : "Confirmar e cadastrar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
