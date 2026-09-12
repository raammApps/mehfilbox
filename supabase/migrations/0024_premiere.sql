-- The wedding's own clock (doc 16 §10, N-69, N-72).
--
-- `timezone` is where the couple is, so a premiere set for "seven in the evening" means their
-- evening; `premiere_at` is the instant before which a published wedding shows a countdown
-- rather than the films. Null means no premiere: live the moment it is published.
alter table catalogues add column if not exists timezone text not null default 'Asia/Kolkata';
alter table catalogues add column if not exists premiere_at timestamptz;
