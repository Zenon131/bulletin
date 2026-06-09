-- ============================================================
-- CLEANUP: Remove all placeholder geotopics, posts, votes, and snapshots
-- Run this in your Supabase SQL Editor to start fresh.
-- Tables, indexes, and RLS policies are preserved.
-- ============================================================

-- Delete in reverse dependency order to avoid FK constraint errors
DELETE FROM public.leaderboard_snapshots;
DELETE FROM public.votes;
DELETE FROM public.engrams;
DELETE FROM public.geotopics;

-- Reset sequences so IDs start from 1 again (optional but nice for a clean slate)
ALTER SEQUENCE IF EXISTS public.geotopics_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.engrams_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.votes_id_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS public.leaderboard_snapshots_id_seq RESTART WITH 1;
