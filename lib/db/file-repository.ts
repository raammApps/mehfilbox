import 'server-only'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { env } from '@/lib/env'
import { log } from '@/lib/log'
import { emptySnapshot, MemoryRepository, type Snapshot } from './memory-repository'
import { SEED_PLANS } from './seed-data'

/**
 * `MemoryRepository` plus a JSON file, so a local demo survives a dev-server restart and a
 * planner meeting does not depend on a Supabase project being reachable over venue wifi.
 *
 * Writes are debounced and atomic (temp file + rename) — a crash mid-write must not leave a
 * truncated store behind.
 */
export class FileRepository extends MemoryRepository {
  private static readonly WRITE_DEBOUNCE_MS = 120
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly path: string) {
    super(FileRepository.read(path))
  }

  protected override persist(): void {
    this.schedule()
  }

  private static read(path: string): Snapshot {
    try {
      if (!existsSync(path)) return emptySnapshot()
      // A store file written before the price list existed has no `plans` key, and an empty
      // list would leave every page that quotes a price with nothing to quote. `pnpm seed` would
      // fix it, but nobody should have to know that to see the marketing page.
      return {
        ...emptySnapshot(),
        plans: structuredClone(SEED_PLANS),
        ...(JSON.parse(readFileSync(path, 'utf8')) as Partial<Snapshot>),
      }
    } catch (error) {
      log.error('file-repository: unreadable store, starting empty', {
        path,
        reason: (error as Error).message,
      })
      return emptySnapshot()
    }
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), FileRepository.WRITE_DEBOUNCE_MS)
    this.timer.unref?.()
  }

  flush(): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true })
      const tmp = `${this.path}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify(this.snapshot(), null, 2), 'utf8')
      renameSync(tmp, this.path)
    } catch (error) {
      log.error('file-repository: write failed', { reason: (error as Error).message })
    }
  }

  /** Replace the whole store — used by the seed script. */
  load(snapshot: Snapshot): void {
    this.data = snapshot
    this.flush()
  }
}

export function defaultStorePath(): string {
  return resolve(process.cwd(), join(env.DATA_DIR, 'store.json'))
}
