
-- Tabela de documentos
CREATE TABLE public.colaborador_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text,
  storage_path text NOT NULL,
  tamanho bigint,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.colaborador_documentos TO authenticated;
GRANT ALL ON public.colaborador_documentos TO service_role;

ALTER TABLE public.colaborador_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_select ON public.colaborador_documentos FOR SELECT TO authenticated USING (true);
CREATE POLICY doc_insert ON public.colaborador_documentos FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY doc_update ON public.colaborador_documentos FOR UPDATE TO authenticated USING (public.can_write(auth.uid()));
CREATE POLICY doc_delete ON public.colaborador_documentos FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_doc_touch BEFORE UPDATE ON public.colaborador_documentos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Storage policies (bucket fotos)
CREATE POLICY "foto_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'colaborador-fotos');
CREATE POLICY "foto_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'colaborador-fotos' AND public.can_write(auth.uid()));
CREATE POLICY "foto_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'colaborador-fotos' AND public.can_write(auth.uid()));
CREATE POLICY "foto_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'colaborador-fotos' AND public.can_write(auth.uid()));

-- Storage policies (bucket documentos)
CREATE POLICY "doc_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'colaborador-documentos');
CREATE POLICY "doc_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'colaborador-documentos' AND public.can_write(auth.uid()));
CREATE POLICY "doc_del" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'colaborador-documentos' AND public.has_role(auth.uid(), 'admin'::app_role));
