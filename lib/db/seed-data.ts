import { hashSecret } from '@/lib/crypto'
import type { Snapshot } from './memory-repository'
import { emptySnapshot } from './memory-repository'
import type { Album, Catalogue, ModuleInstance, Photo, Title } from '@/lib/schema'

/**
 * The demo catalogue (doc 09 P0-29).
 *
 * Nine titles, not twenty; a written letter; ~30 photographs; full EN + HI copy — the shape the
 * product is arguing for, so the demo is itself the argument.
 *
 * The imagery here is *generated*, not stock footage of strangers: doc 13 §8 is explicit that
 * the real sales artefact needs real, cleared footage, and putting placeholder faces in front
 * of a planner would misrepresent what they are buying. What this fixture proves is the
 * mechanics — the rows, the modal, the customizer, the publish loop.
 */

const ORG_ID = '11111111-1111-4111-8111-111111111111'
const OPERATOR_ID = '22222222-2222-4222-8222-222222222222'
const CATALOGUE_ID = '33333333-3333-4333-8333-333333333333'
const ALBUM_ID = '44444444-4444-4444-8444-444444444444'

const titleId = (n: number) => `55555555-5555-4555-8555-${String(n).padStart(12, '0')}`
const photoId = (n: number) => `66666666-6666-4666-8666-${String(n).padStart(12, '0')}`

const CREATED_AT = '2026-07-01T09:00:00.000Z'

type TitleSeed = {
  n: number
  slug: string
  en: string
  hi: string
  category: Title['category']
  synopsisEn: string
  synopsisHi: string
  durationS: number
}

const TITLE_SEEDS: TitleSeed[] = [
  {
    n: 1,
    slug: 'the-highlights',
    en: 'The Highlights',
    hi: 'झलकियाँ',
    category: 'highlights',
    synopsisEn: 'Four minutes of the whole thing — the one to send someone who asks how it went.',
    synopsisHi: 'चार मिनट में पूरा दिन — किसी को भेजने के लिए यही एक फ़िल्म काफ़ी है।',
    durationS: 244,
  },
  {
    n: 2,
    slug: 'the-ceremony',
    en: 'The Ceremony',
    hi: 'विवाह',
    category: 'ceremony',
    synopsisEn: 'The full ceremony, unhurried, from the baraat to the vidaai.',
    synopsisHi: 'पूरी रस्म, बिना जल्दबाज़ी — बारात से विदाई तक।',
    durationS: 2_760,
  },
  {
    n: 3,
    slug: 'sangeet-night',
    en: 'Sangeet Night',
    hi: 'संगीत की रात',
    category: 'sangeet',
    synopsisEn: 'Nine dances, one power cut, and an uncle who would not leave the stage.',
    synopsisHi: 'नौ डांस, एक बार बिजली गुल, और एक अंकल जो स्टेज से उतरे ही नहीं।',
    durationS: 612,
  },
  {
    n: 4,
    slug: 'haldi-morning',
    en: 'Haldi Morning',
    hi: 'हल्दी की सुबह',
    category: 'haldi',
    synopsisEn: 'Marigold, turmeric, and nobody staying clean.',
    synopsisHi: 'गेंदा, हल्दी, और कोई भी साफ़ नहीं बचा।',
    durationS: 187,
  },
  {
    n: 5,
    slug: 'mehendi-afternoon',
    en: 'Mehendi Afternoon',
    hi: 'मेहंदी की दोपहर',
    category: 'mehendi',
    synopsisEn: 'Six hours of henna, condensed into three minutes of hands and laughing.',
    synopsisHi: 'छह घंटे की मेहंदी, तीन मिनट में — हाथ और हँसी।',
    durationS: 176,
  },
  {
    n: 6,
    slug: 'from-above',
    en: 'From Above',
    hi: 'ऊपर से',
    category: 'aerial',
    synopsisEn: 'The mandap, the courtyard and the whole street, seen from the drone.',
    synopsisHi: 'मंडप, आँगन और पूरी गली — ड्रोन की नज़र से।',
    durationS: 98,
  },
  {
    n: 7,
    slug: 'the-reception',
    en: 'The Reception',
    hi: 'रिसेप्शन',
    category: 'reception',
    synopsisEn: 'Speeches that ran long, in the best way.',
    synopsisHi: 'भाषण लंबे चले — और अच्छे ही लगे।',
    durationS: 468,
  },
  {
    n: 8,
    slug: 'messages-and-wishes',
    en: 'Messages & Wishes',
    hi: 'शुभकामनाएँ',
    category: 'guest_wishes',
    synopsisEn: 'Everyone who could not make it, and a few who could.',
    synopsisHi: 'जो नहीं आ पाए, और कुछ जो आए।',
    durationS: 322,
  },
  {
    n: 9,
    slug: 'how-we-met',
    en: 'How We Met',
    hi: 'हमारी शुरुआत',
    category: 'pre_wedding',
    synopsisEn: 'Filmed two months before, in the flat where it all started.',
    synopsisHi: 'दो महीने पहले फ़िल्माया गया — उसी फ़्लैट में जहाँ सब शुरू हुआ।',
    durationS: 205,
  },
]

const PHOTO_CAPTIONS = [
  'The baraat turning the corner',
  'Her grandmother, front row',
  'Between the ceremonies',
  'The mandap at first light',
  'His father, mid-speech',
  'The cousins',
]

function buildTitles(): Title[] {
  return TITLE_SEEDS.map((seed) => ({
    id: titleId(seed.n),
    catalogueId: CATALOGUE_ID,
    slug: seed.slug,
    name: { en: seed.en, hi: seed.hi },
    // Plausible for a few minutes of encoded ladder, so the demo's storage figure is not zero.
    sizeBytes: 900 * 1024 * 1024,
    // One title deliberately has no Hindi synopsis: E2E-3 asserts that a guest reading Hindi
    // sees the English text rather than a key or a blank.
    synopsis:
      seed.n === 6
        ? { en: seed.synopsisEn }
        : { en: seed.synopsisEn, hi: seed.synopsisHi },
    category: seed.category,
    credits:
      seed.n <= 3
        ? [
            { role: 'Cinematography', name: 'Nayantara Films' },
            { role: 'Edit', name: 'R. Iyer' },
          ]
        : [],
    provider: 'fake',
    providerId: `fake_demo_${seed.slug}`,
    durationS: seed.durationS,
    posterUrl: null,
    posterCandidates: [],
    posterSource: 'generated',
    thumbnailsUrl: null,
    trailerUrl: null,
    captions: [],
    status: 'ready',
    errorMessage: null,
    published: true,
    sortOrder: seed.n,
    publishedAt: CREATED_AT,
    createdAt: CREATED_AT,
    viewCount: 0,
    watchSeconds: 0,
  }))
}

function buildPhotos(): Photo[] {
  // ~30 photographs. Generated gradients stand in for the studio's images.
  return Array.from({ length: 30 }, (_, index) => ({
    id: photoId(index + 1),
    albumId: ALBUM_ID,
    url: `/api/poster/frame?asset=demo-photo-${index + 1}&n=1`,
    lqip: null,
    caption:
      index < PHOTO_CAPTIONS.length ? { en: PHOTO_CAPTIONS[index]! } : undefined,
    width: 1600,
    sizeBytes: 3 * 1024 * 1024,
    height: 1200,
    sortOrder: index,
  }))
}

const LETTER_EN = `We spent a year planning three days, and then the three days went past like one afternoon.

What we have left is this. Not all of it — most of the forty gigabytes is us walking between rooms — but the parts we would actually show someone. The highlights film if you have four minutes. The whole ceremony if you have an hour and a Sunday.

Thank you for being in it. Several of you are in the drone shot without knowing it.`

const LETTER_HI = `हमने तीन दिनों की तैयारी में एक साल लगाया, और फिर वे तीन दिन एक दोपहर की तरह बीत गए।

अब हमारे पास यही बचा है। सब कुछ नहीं — चालीस जीबी में से ज़्यादातर तो हमारा एक कमरे से दूसरे कमरे तक चलना है — बल्कि वही हिस्से जो हम सच में किसी को दिखाना चाहेंगे।

शुक्रिया कि आप इसमें शामिल थे। आप में से कई ड्रोन शॉट में हैं, बिना जाने।`

function buildModules(): ModuleInstance[] {
  return [
    {
      id: 'm_billboard',
      type: 'billboard',
      enabled: true,
      order: 0,
      title: { en: '' },
      config: { featuredRef: titleId(1), useTrailer: true, showCoupleName: true },
    },
    {
      id: 'm_films',
      type: 'curated_row',
      enabled: true,
      order: 1,
      title: { en: 'The films', hi: 'फ़िल्में' },
      config: {
        titleIds: [titleId(2), titleId(3), titleId(7), titleId(9)],
        aspect: '2:3',
        showProgress: false,
      },
    },
    {
      id: 'm_letter',
      type: 'letter',
      enabled: true,
      order: 2,
      title: { en: 'A message for you', hi: 'आपके लिए एक संदेश' },
      config: {
        body: { en: LETTER_EN, hi: LETTER_HI },
        signature: { en: 'Aanya & Vikram', hi: 'आन्या और विक्रम' },
        theme: 'framed',
      },
    },
    {
      id: 'm_short',
      type: 'curated_row',
      enabled: true,
      order: 3,
      title: { en: 'Short and worth it', hi: 'छोटी और ख़ास' },
      config: { titleIds: [titleId(4), titleId(5), titleId(6)], aspect: '16:9', showProgress: false },
    },
    {
      id: 'm_vault',
      type: 'photo_grid',
      enabled: true,
      order: 4,
      title: { en: 'The day in photographs', hi: 'तस्वीरों में वह दिन' },
      config: { albumId: ALBUM_ID, columns: 3 },
    },
  ]
}

function buildCatalogue(): Catalogue {
  return {
    id: CATALOGUE_ID,
    orgId: ORG_ID,
    originOrgId: ORG_ID,
    slug: 'aanya-vikram',
    customDomain: null,
    coupleName: { en: 'Aanya & Vikram', hi: 'आन्या और विक्रम' },
    // Not "AanyaVikramFlix" — doc 12 §1 rule 3, and the schema rejects it anyway.
    appName: { en: 'Aanya & Vikram Originals', hi: 'आन्या और विक्रम ओरिजिनल्स' },
    weddingDate: '2026-11-14',
    city: { en: 'Jaipur', hi: 'जयपुर' },
    synopsis: {
      en: 'Three days in Jaipur, in nine pieces worth keeping.',
      hi: 'जयपुर के तीन दिन, नौ हिस्सों में।',
    },
    occasion: 'wedding',
    branding: { accent: '#d11a2a', presentedBy: 'Kalyanam Weddings' },
    featuredTitleId: titleId(1),
    modules: buildModules(),
    draftModules: null,
    draftBranding: null,
    template: 'keepsake',
    status: 'published',
    privacy: 'unlisted',
    passcodeHash: null,
    includedUntil: '2026-10-01T00:00:00.000Z',
    subStatus: 'included',
    subPlan: null,
    subUntil: null,
    createdAt: CREATED_AT,
    publishedAt: CREATED_AT,
  }
}

export type SeedOperator = { email: string; password: string }

/**
 * `operator` is a parameter rather than a read of `lib/env` so this module stays importable
 * from a plain Node script — the seed script is the main consumer, and it must not need the
 * server-only configuration module to write a JSON file.
 */
export function demoSnapshot(
  operator: SeedOperator = { email: 'operator@mehfilbox.test', password: 'mehfilbox-dev' },
): Snapshot {
  const album: Album = {
    id: ALBUM_ID,
    catalogueId: CATALOGUE_ID,
    name: { en: 'The day', hi: 'वह दिन' },
    createdAt: CREATED_AT,
  }

  return {
    ...emptySnapshot(),
    orgs: [
      {
        id: ORG_ID,
        name: 'Kalyanam Weddings',
        slug: 'kalyanam',
        kind: 'partner' as const,
        status: 'active' as const,
        branding: { accent: '#d11a2a', presentedBy: 'Kalyanam Weddings' },
        createdAt: CREATED_AT,
      },
    ],
    operators: [
      {
        id: OPERATOR_ID,
        orgId: ORG_ID,
        email: operator.email,
        name: 'Demo Operator',
        role: 'admin',
        passwordHash: hashSecret(operator.password),
        createdAt: CREATED_AT,
      },
    ],
    catalogues: [buildCatalogue()],
    titles: buildTitles(),
    albums: [album],
    photos: buildPhotos(),
  }
}
