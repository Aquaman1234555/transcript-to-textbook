ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS concept_map_markdown text,
  ADD COLUMN IF NOT EXISTS ap_analysis_markdown text,
  ADD COLUMN IF NOT EXISTS knowledge_expansion_markdown text;