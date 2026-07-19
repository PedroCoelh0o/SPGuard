
CREATE TABLE public.audit_exportacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text,
  tipo text NOT NULL,
  modulo text NOT NULL DEFAULT 'colaboradores',
  filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_registros integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_exportacoes TO authenticated;
GRANT ALL ON public.audit_exportacoes TO service_role;
ALTER TABLE public.audit_exportacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_export_insert_own" ON public.audit_exportacoes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "audit_export_select_own" ON public.audit_exportacoes
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX audit_exportacoes_created_at_idx ON public.audit_exportacoes (created_at DESC);
