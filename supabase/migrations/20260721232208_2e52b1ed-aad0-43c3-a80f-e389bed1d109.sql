
CREATE TYPE public.eletronico_tipo AS ENUM ('celular','notebook','tablet');

CREATE TABLE public.eletronicos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  colaborador_id UUID NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  tipo public.eletronico_tipo NOT NULL,
  descricao TEXT,
  imei TEXT,
  modelo TEXT,
  contato TEXT,
  numero_selo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.eletronicos TO authenticated;
GRANT ALL ON public.eletronicos TO service_role;

ALTER TABLE public.eletronicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read eletronicos" ON public.eletronicos FOR SELECT TO authenticated USING (true);
CREATE POLICY "write eletronicos" ON public.eletronicos FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "update eletronicos" ON public.eletronicos FOR UPDATE TO authenticated USING (public.can_write(auth.uid())) WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "delete eletronicos" ON public.eletronicos FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_eletronicos_updated BEFORE UPDATE ON public.eletronicos
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_eletronicos_colab ON public.eletronicos(colaborador_id);
