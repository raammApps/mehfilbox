-- Keep the measured figure beside the derived one (N-25).
--
-- Bunny Stream reports **watch time** per video and never bandwidth — bandwidth exists only at the
-- pull zone, which is the whole library and cannot be attributed to one wedding. So `delivered_gb`
-- is watch time times a bitrate: a conclusion, not a measurement.
--
-- Storing the seconds it was derived from means a corrected bitrate can recompute history rather
-- than leaving it quietly wrong. `PRICING.md` §1's figure is an estimate until N-24a measures a
-- real fifteen-hour wedding, so that correction is expected rather than hypothetical.
alter table usage_rollup add column if not exists watch_seconds bigint not null default 0;
