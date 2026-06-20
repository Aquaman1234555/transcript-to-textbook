-- Phase 1: layered notes. Add Concept Map, AP Framework Analysis, and
-- Knowledge Expansion layers alongside the existing notes/obsidian columns.
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS concept_map_markdown TEXT,
  ADD COLUMN IF NOT EXISTS ap_analysis_markdown TEXT,
  ADD COLUMN IF NOT EXISTS knowledge_expansion_markdown TEXT;
