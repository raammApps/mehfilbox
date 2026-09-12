-- The occasions a couple starts for themselves (doc 16 §6, N-73). 0001's CHECK named five; a
-- baby shower and a naming day are the two a couple's own account is most often for.
alter table catalogues drop constraint if exists catalogues_occasion_check;
alter table catalogues add constraint catalogues_occasion_check
  check (occasion in ('wedding','engagement','anniversary','birthday','proposal','baby-shower','naming-day'));
