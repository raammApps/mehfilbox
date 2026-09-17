import type { PhotoProvider, StoredPhoto } from './provider'

/**
 * In-memory storage, so the suite and an offline demo exercise the same code path.
 *
 * Mirrors `lib/video/fake.ts`: a test that needs a CDN account is a test nobody runs.
 */
export class FakePhotoProvider implements PhotoProvider {
  readonly name = 'fake'
  private readonly files = new Map<string, { contentType: string; bytes: number }>()

  urlFor(key: string): string {
    return `/fake-photos/${key}`
  }

  /** No real CDN to authenticate against — nothing to sign. */
  signPath(_path: string, _ttlS: number): string {
    return ''
  }

  async put(key: string, body: ArrayBuffer, contentType: string): Promise<StoredPhoto> {
    this.files.set(key, { contentType, bytes: body.byteLength })
    return { url: this.urlFor(key), key }
  }

  async remove(key: string): Promise<void> {
    this.files.delete(key)
  }

  /** Test affordance: what is currently stored. */
  list(): string[] {
    return [...this.files.keys()]
  }
}
