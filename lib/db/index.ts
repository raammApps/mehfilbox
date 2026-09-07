import 'server-only'
import { env } from '@/lib/env'
import { log } from '@/lib/log'
import { defaultStorePath, FileRepository } from './file-repository'
import { MemoryRepository } from './memory-repository'
import type { Repository } from './repository'
import { demoSnapshot } from './seed-data'
import { SupabaseRepository } from './supabase-repository'

/**
 * One repository per process. `globalThis` because Next's dev server re-evaluates modules on
 * every hot reload and a fresh in-memory store each time would lose the demo catalogue
 * mid-click.
 */
const KEY = Symbol.for('mehfilbox.repository')

type Global = typeof globalThis & { [KEY]?: Repository }

function build(): Repository {
  switch (env.DATA_DRIVER) {
    case 'supabase': {
      log.info('repository: supabase')
      return new SupabaseRepository()
    }
    case 'file': {
      const path = defaultStorePath()
      const repo = new FileRepository(path)
      if (repo.snapshot().orgs.length === 0) {
        repo.load(demoSnapshot({ email: env.DEV_OPERATOR_EMAIL, password: env.DEV_OPERATOR_PASSWORD }))
        log.info('repository: file store seeded with the demo catalogue', { path })
      }
      log.info('repository: file', { path })
      return repo
    }
    default: {
      log.info('repository: memory (seeded)')
      return new MemoryRepository(
        demoSnapshot({ email: env.DEV_OPERATOR_EMAIL, password: env.DEV_OPERATOR_PASSWORD }),
      )
    }
  }
}

export function getRepository(): Repository {
  const g = globalThis as Global
  g[KEY] ??= build()
  return g[KEY]
}

/**
 * Tests swap in a purpose-built store rather than mutating the shared one.
 *
 * This used to carry a knip-ignore tag. `tests/unit/notify.test.ts` imports it now, so the export
 * is genuinely used and the tag had become a lie — knip reports a suppression that no longer
 * suppresses anything, which is how the stale one was caught.
 */
export function setRepository(repository: Repository): void {
  ;(globalThis as Global)[KEY] = repository
}

export type { Repository } from './repository'
