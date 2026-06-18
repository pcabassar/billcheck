-- U9: letters are small structured payloads; store the rendered text inline.
-- Shape for V0 dispute letters: { "letterText": string, "generatedAt": ISO }.
-- content_ref (0001) stays reserved for future storage-backed artifacts.
alter table public.artifacts
  add column content jsonb not null default '{}';
