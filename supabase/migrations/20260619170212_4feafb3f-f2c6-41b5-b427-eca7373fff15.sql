
CREATE TABLE public.videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  youtube_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  channel TEXT,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.videos TO authenticated;
GRANT ALL ON public.videos TO service_role;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own videos" ON public.videos FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX videos_user_idx ON public.videos(user_id, created_at DESC);

CREATE TABLE public.transcripts (
  video_id UUID PRIMARY KEY REFERENCES public.videos(id) ON DELETE CASCADE,
  raw_text TEXT,
  raw_segments JSONB,
  clean_markdown TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transcripts TO authenticated;
GRANT ALL ON public.transcripts TO service_role;
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own transcripts" ON public.transcripts FOR ALL
  USING (EXISTS (SELECT 1 FROM public.videos v WHERE v.id = transcripts.video_id AND v.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.videos v WHERE v.id = transcripts.video_id AND v.user_id = auth.uid()));

CREATE TABLE public.notes (
  video_id UUID PRIMARY KEY REFERENCES public.videos(id) ON DELETE CASCADE,
  notes_markdown TEXT,
  obsidian_markdown TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO authenticated;
GRANT ALL ON public.notes TO service_role;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notes" ON public.notes FOR ALL
  USING (EXISTS (SELECT 1 FROM public.videos v WHERE v.id = notes.video_id AND v.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.videos v WHERE v.id = notes.video_id AND v.user_id = auth.uid()));

CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  parts JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_messages TO authenticated;
GRANT ALL ON public.chat_messages TO service_role;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own chat" ON public.chat_messages FOR ALL
  USING (EXISTS (SELECT 1 FROM public.videos v WHERE v.id = chat_messages.video_id AND v.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.videos v WHERE v.id = chat_messages.video_id AND v.user_id = auth.uid()));
CREATE INDEX chat_messages_video_idx ON public.chat_messages(video_id, created_at);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER videos_touch BEFORE UPDATE ON public.videos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER transcripts_touch BEFORE UPDATE ON public.transcripts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER notes_touch BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
