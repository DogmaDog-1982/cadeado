-- Fix update failures caused by combining REPLICA IDENTITY FULL with a column-limited realtime publication.
-- The primary key is enough for realtime updates and keeps secret/token columns excluded from published payloads.
ALTER TABLE public.games REPLICA IDENTITY DEFAULT;