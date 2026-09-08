import { DEFAULT_LOCALE, LOCALES, type Locale, type LocalisedString } from './schema'

/**
 * Every user-visible string in the product comes from here (CLAUDE.md working agreements).
 * A missing Hindi value falls back to English *silently* — never a key, never a blank
 * (doc 10 §1, test 9).
 */

export const dictionary = {
  en: {
    'nav.skipToContent': 'Skip to content',
    'nav.profile': 'Profile',
    'nav.switchProfile': 'Switch profile',
    'nav.language': 'Language',

    'profileGate.heading': "Who's joining?",
    'profileGate.hint': 'Pick one so we can remember where you stopped watching.',
    'profileGate.skip': 'Skip for now',
    'profileGate.label.brideSide': "Bride's side",
    'profileGate.label.groomSide': "Groom's side",
    'profileGate.label.friends': 'Friends',
    'profileGate.label.family': 'Family',

    'billboard.play': 'Play',
    'billboard.moreInfo': 'More Info',

    'row.scrollLeft': 'Scroll left',
    'row.scrollRight': 'Scroll right',

    'title.play': 'Play',
    'title.share': 'Share',
    'title.close': 'Close',
    'title.previous': 'Previous title',
    'title.next': 'Next title',
    'title.credits': 'Credits',
    'title.processing': 'This film is still being prepared.',
    'title.shareCopied': 'Link copied',
    'title.shareWhatsapp': 'Share on WhatsApp',
    'title.shareCopy': 'Copy link',
    'title.watchFrom': 'Share from this moment',

    'player.back': 'Back',
    'player.resumingFrom': 'Resuming from {time}',
    'player.startOver': 'Start over',
    'player.playPause': 'Play or pause',
    'player.rewind': 'Back 10 seconds',
    'player.forward': 'Forward 10 seconds',
    'player.mute': 'Mute',
    'player.unmute': 'Unmute',
    'player.fullscreen': 'Fullscreen',
    'player.pip': 'Picture in picture',
    'player.captions': 'Captions',
    'player.quality': 'Quality',
    'player.speed': 'Speed',
    'player.auto': 'Auto',
    'player.seek': 'Seek',
    'player.error.notReady': 'This film is still processing. Try again in a few minutes.',
    'player.error.unavailable': 'This film is not available right now.',
    'player.error.network': 'The connection dropped. Retrying…',
    'player.needsJs': 'Playback needs JavaScript. Everything else on this page works without it.',

    'photo.open': 'Open photo',
    'photo.previous': 'Previous photo',
    'photo.next': 'Next photo',
    'photo.close': 'Close photo',
    // N-31. "Like"/"Liked" rather than a count in the label: the number is already announced by
    // the live region beside it, and a screen reader hearing it twice is noise.
    'like.add': 'Like',
    'like.remove': 'Liked',
    'photo.counter': '{index} of {total}',

    'letter.signature': 'With love,',

    'checklist.progress': '{done} of {total}',
    'randomiser.again': 'Again',
    'randomiser.waiting': '{count} to choose from',

    'footer.presentedBy': 'Presented by {name}',
    'footer.privacy': 'Privacy',
    'footer.renew': 'Renew',

    'state.draft.heading': 'Not quite ready',
    'state.draft.body': 'This catalogue has not been published yet. Check back shortly.',
    'state.empty.heading': 'Nothing published yet',
    'state.empty.body': 'Films appear here as soon as they are published.',

    'locked.heading': 'This one is private',
    'locked.body': 'Enter the passcode from your invitation.',
    'locked.passcode': 'Passcode',
    'locked.submit': 'Continue',
    'locked.wrong': 'That passcode did not work.',
    'locked.lockedOut': 'Too many attempts. Try again in 15 minutes.',

    /**
     * Downloads (N-22). The wording is load-bearing: "nothing is ever deleted" appears in the
     * handover email and the pricing page, and this is the screen where a couple finds out
     * whether it was true.
     */
    'download.heading': 'Download everything',
    'download.body':
      'Every film and photograph, at the quality it was delivered. Links last a few hours — come back for fresh ones whenever you like.',
    'download.films': 'Films',
    'download.photographs': 'Photographs',
    'download.get': 'Download',
    'download.empty': 'There is nothing here to download yet.',
    'download.unavailable':
      '{count} could not be prepared just now. Everything is still stored — try again in a few minutes.',
    'download.all': 'Download everything',

    'renew.heading': 'Your catalogue is waiting',
    'renew.body':
      'The subscription has lapsed, so playback is paused. Nothing has been deleted — renew and everything is back.',
    'renew.cta': 'Renew',

    'meta.duration': '{minutes} min',
    'meta.photos': '{count} photos',
    'common.loading': 'Loading',
    'common.retry': 'Retry',
    'common.dismiss': 'Dismiss',

    /**
     * Notification templates (N-50). Here rather than in `lib/notify/` so the i18n gate covers
     * them: an expiry warning that silently falls back to English is the failure D-12 exists to
     * prevent.
     */
    /**
     * The one template addressed to us rather than to a couple (N-53).
     *
     * Every serious fault this product has had was silent — a webhook pointed at a dead URL, a
     * storage column nothing wrote, an SMTP credential that authenticated but could not send —
     * and each was found by a person looking at production. This is the message that arrives
     * first instead.
     */
    'notify.ops-alert.subject': 'Mehfilbox: {kind}',
    'notify.ops-alert.text':
      '{kind}\n\n{detail}\n\nDeploy: {version}\nSeen at: {at}',
    'notify.ops-alert.html':
      '<p><strong>{kind}</strong></p><p>{detail}</p><p>Deploy <code>{version}</code>, seen at {at}.</p>',

    'notify.handover.subject': '{coupleName} is yours',
    'notify.handover.text':
      '{coupleName} is now yours to watch, download and share.\n\nSign in: {url}\n\n{studioName} still manages the plan, and it runs to {date}. Nothing is ever deleted.',
    'notify.handover.html':
      '<p><strong>{coupleName}</strong> is now yours to watch, download and share.</p><p><a href="{url}">Sign in</a></p><p>{studioName} still manages the plan, and it runs to {date}. Nothing is ever deleted.</p>',

    'notify.delivery.subject': '{coupleName} — now streaming',
    'notify.delivery.text':
      'Your wedding films and photographs are ready to watch.\n\n{url}\n\nShare it with anyone you like — no account needed.\n\nFilmed by {studioName}.',
    'notify.delivery.html':
      '<p>Your wedding films and photographs are ready to watch.</p><p><a href="{url}">Open {coupleName}</a></p><p>Share it with anyone you like — no account needed.</p><p>Filmed by {studioName}.</p>',

    'notify.expiry.subject': '{coupleName} runs to {date}',
    'notify.expiry.text':
      '{coupleName} is included until {date} — {days} days from now.\n\nAfter that it pauses for 90 days, and everything stays downloadable throughout. Nothing is ever deleted.\n\nTo keep it streaming, contact {studioName}.',
    'notify.expiry.html':
      '<p><strong>{coupleName}</strong> is included until {date} — {days} days from now.</p><p>After that it pauses for 90 days, and everything stays downloadable throughout. Nothing is ever deleted.</p><p>To keep it streaming, contact {studioName}.</p>',

    'notify.grace.subject': '{coupleName} is paused',
    'notify.grace.text':
      'Streaming for {coupleName} is paused, but nothing has been deleted and everything is still downloadable.\n\nDownload: {url}\n\nTo start it again, contact {studioName}.',
    'notify.grace.html':
      '<p>Streaming for <strong>{coupleName}</strong> is paused, but nothing has been deleted and everything is still downloadable.</p><p><a href="{url}">Download everything</a></p><p>To start it again, contact {studioName}.</p>',

    'notify.archived.subject': '{coupleName} is archived',
    'notify.archived.text':
      '{coupleName} is archived. Your films and photographs are kept safe and can be restored at any time.\n\n{url}\n\nFilmed by {studioName}.',
    'notify.archived.html':
      '<p><strong>{coupleName}</strong> is archived. Your films and photographs are kept safe and can be restored at any time.</p><p><a href="{url}">Restore or download</a></p><p>Filmed by {studioName}.</p>',

  },

  hi: {
    'nav.skipToContent': 'मुख्य सामग्री पर जाएँ',
    'nav.profile': 'प्रोफ़ाइल',
    'nav.switchProfile': 'प्रोफ़ाइल बदलें',
    'nav.language': 'भाषा',

    'profileGate.heading': 'कौन देख रहा है?',
    'profileGate.hint': 'एक चुनें ताकि हम याद रख सकें आपने कहाँ छोड़ा था।',
    'profileGate.skip': 'अभी छोड़ें',
    'profileGate.label.brideSide': 'दुल्हन पक्ष',
    'profileGate.label.groomSide': 'दूल्हा पक्ष',
    'profileGate.label.friends': 'दोस्त',
    'profileGate.label.family': 'परिवार',

    'billboard.play': 'चलाएँ',
    'billboard.moreInfo': 'और जानकारी',

    'row.scrollLeft': 'बाएँ स्क्रॉल करें',
    'row.scrollRight': 'दाएँ स्क्रॉल करें',

    'title.play': 'चलाएँ',
    'title.share': 'साझा करें',
    'title.close': 'बंद करें',
    'title.previous': 'पिछला',
    'title.next': 'अगला',
    'title.credits': 'श्रेय',
    'title.processing': 'यह फ़िल्म अभी तैयार हो रही है।',
    'title.shareCopied': 'लिंक कॉपी हो गया',
    'title.shareWhatsapp': 'व्हाट्सएप पर भेजें',
    'title.shareCopy': 'लिंक कॉपी करें',
    'title.watchFrom': 'इसी पल से साझा करें',

    'player.back': 'वापस',
    'player.resumingFrom': '{time} से आगे',
    'player.startOver': 'शुरू से चलाएँ',
    'player.playPause': 'चलाएँ या रोकें',
    'player.rewind': '10 सेकंड पीछे',
    'player.forward': '10 सेकंड आगे',
    'player.mute': 'आवाज़ बंद',
    'player.unmute': 'आवाज़ चालू',
    'player.fullscreen': 'फ़ुल स्क्रीन',
    'player.pip': 'पिक्चर इन पिक्चर',
    'player.captions': 'सबटाइटल',
    'player.quality': 'क्वालिटी',
    'player.speed': 'गति',
    'player.auto': 'स्वतः',
    'player.seek': 'आगे-पीछे करें',
    'player.error.notReady': 'यह फ़िल्म अभी तैयार हो रही है। कुछ मिनट बाद देखें।',
    'player.error.unavailable': 'यह फ़िल्म अभी उपलब्ध नहीं है।',
    'player.error.network': 'कनेक्शन टूट गया। फिर से कोशिश हो रही है…',
    'player.needsJs': 'वीडियो चलाने के लिए JavaScript ज़रूरी है। बाकी पेज बिना उसके भी चलता है।',

    'photo.open': 'फ़ोटो खोलें',
    'photo.previous': 'पिछली फ़ोटो',
    'photo.next': 'अगली फ़ोटो',
    'photo.close': 'फ़ोटो बंद करें',
    'like.add': 'पसंद करें',
    'like.remove': 'पसंद किया',
    'photo.counter': '{total} में से {index}',

    'letter.signature': 'प्यार के साथ,',

    'checklist.progress': '{total} में से {done}',
    'randomiser.again': 'फिर से',
    'randomiser.waiting': '{count} में से एक',

    'footer.presentedBy': 'प्रस्तुति: {name}',
    'footer.privacy': 'गोपनीयता',
    'footer.renew': 'नवीनीकरण',

    'state.draft.heading': 'अभी तैयार नहीं',
    'state.draft.body': 'यह कैटलॉग अभी प्रकाशित नहीं हुआ है। थोड़ी देर बाद देखें।',
    'state.empty.heading': 'अभी कुछ प्रकाशित नहीं',
    'state.empty.body': 'फ़िल्में प्रकाशित होते ही यहाँ दिखेंगी।',

    'locked.heading': 'यह निजी है',
    'locked.body': 'अपने निमंत्रण में दिया पासकोड डालें।',
    'locked.passcode': 'पासकोड',
    'locked.submit': 'आगे बढ़ें',
    'locked.wrong': 'यह पासकोड सही नहीं है।',
    'locked.lockedOut': 'बहुत बार कोशिश हुई। 15 मिनट बाद फिर देखें।',

    'download.heading': 'सब कुछ डाउनलोड करें',
    'download.body':
      'हर फ़िल्म और तस्वीर, उसी गुणवत्ता में जिसमें दी गई थी। लिंक कुछ घंटों तक चलते हैं — नए लिंक के लिए कभी भी लौट आइए।',
    'download.films': 'फ़िल्में',
    'download.photographs': 'तस्वीरें',
    'download.get': 'डाउनलोड',
    'download.empty': 'अभी यहाँ डाउनलोड करने को कुछ नहीं है।',
    'download.unavailable':
      '{count} अभी तैयार नहीं हो सकीं। सब कुछ सुरक्षित है — कुछ मिनट बाद फिर कोशिश कीजिए।',
    'download.all': 'सब कुछ डाउनलोड करें',

    'renew.heading': 'आपका कैटलॉग सुरक्षित है',
    'renew.body':
      'सदस्यता समाप्त हो गई है, इसलिए वीडियो रुके हुए हैं। कुछ भी मिटाया नहीं गया — नवीनीकरण करते ही सब वापस।',
    'renew.cta': 'नवीनीकरण करें',

    'meta.duration': '{minutes} मिनट',
    'meta.photos': '{count} फ़ोटो',
    'common.loading': 'लोड हो रहा है',
    'common.retry': 'फिर कोशिश करें',
    'common.dismiss': 'हटाएँ',

    /* Addressed to us, not to a couple — but the i18n gate is what keeps every template
       honest, and exempting one is how the exemptions start. */
    'notify.ops-alert.subject': 'Mehfilbox: {kind}',
    'notify.ops-alert.text':
      '{kind}\n\n{detail}\n\nडिप्लॉय: {version}\nसमय: {at}',
    'notify.ops-alert.html':
      '<p><strong>{kind}</strong></p><p>{detail}</p><p>डिप्लॉय <code>{version}</code>, समय {at}।</p>',

    'notify.handover.subject': '{coupleName} अब आपका है',
    'notify.handover.text':
      '{coupleName} अब आपका है — देखिए, डाउनलोड कीजिए और साझा कीजिए।\n\nसाइन इन: {url}\n\nप्लान {studioName} संभालते हैं, और यह {date} तक चलेगा। कुछ भी कभी नहीं मिटाया जाता।',
    'notify.handover.html':
      '<p><strong>{coupleName}</strong> अब आपका है — देखिए, डाउनलोड कीजिए और साझा कीजिए।</p><p><a href="{url}">साइन इन करें</a></p><p>प्लान {studioName} संभालते हैं, और यह {date} तक चलेगा। कुछ भी कभी नहीं मिटाया जाता।</p>',

    'notify.delivery.subject': '{coupleName} — अब देखने के लिए तैयार',
    'notify.delivery.text':
      'आपकी शादी की फ़िल्में और तस्वीरें अब देखने के लिए तैयार हैं।\n\n{url}\n\nजिसे चाहें भेजिए — किसी खाते की ज़रूरत नहीं।\n\nफ़िल्मांकन: {studioName}।',
    'notify.delivery.html':
      '<p>आपकी शादी की फ़िल्में और तस्वीरें अब देखने के लिए तैयार हैं।</p><p><a href="{url}">{coupleName} खोलें</a></p><p>जिसे चाहें भेजिए — किसी खाते की ज़रूरत नहीं।</p><p>फ़िल्मांकन: {studioName}।</p>',

    'notify.expiry.subject': '{coupleName} {date} तक',
    'notify.expiry.text':
      '{coupleName} {date} तक शामिल है — अब से {days} दिन।\n\nउसके बाद यह 90 दिन के लिए रुक जाएगा, और तब भी सब कुछ डाउनलोड किया जा सकेगा। कुछ भी कभी नहीं मिटाया जाता।\n\nजारी रखने के लिए {studioName} से संपर्क करें।',
    'notify.expiry.html':
      '<p><strong>{coupleName}</strong> {date} तक शामिल है — अब से {days} दिन।</p><p>उसके बाद यह 90 दिन के लिए रुक जाएगा, और तब भी सब कुछ डाउनलोड किया जा सकेगा। कुछ भी कभी नहीं मिटाया जाता।</p><p>जारी रखने के लिए {studioName} से संपर्क करें।</p>',

    'notify.grace.subject': '{coupleName} रुका हुआ है',
    'notify.grace.text':
      '{coupleName} की स्ट्रीमिंग रुकी हुई है, पर कुछ भी मिटाया नहीं गया और सब कुछ अब भी डाउनलोड किया जा सकता है।\n\nडाउनलोड: {url}\n\nदोबारा शुरू करने के लिए {studioName} से संपर्क करें।',
    'notify.grace.html':
      '<p><strong>{coupleName}</strong> की स्ट्रीमिंग रुकी हुई है, पर कुछ भी मिटाया नहीं गया और सब कुछ अब भी डाउनलोड किया जा सकता है।</p><p><a href="{url}">सब कुछ डाउनलोड करें</a></p><p>दोबारा शुरू करने के लिए {studioName} से संपर्क करें।</p>',

    'notify.archived.subject': '{coupleName} संग्रहीत है',
    'notify.archived.text':
      '{coupleName} संग्रहीत कर दिया गया है। आपकी फ़िल्में और तस्वीरें सुरक्षित हैं और कभी भी वापस लाई जा सकती हैं।\n\n{url}\n\nफ़िल्मांकन: {studioName}।',
    'notify.archived.html':
      '<p><strong>{coupleName}</strong> संग्रहीत कर दिया गया है। आपकी फ़िल्में और तस्वीरें सुरक्षित हैं और कभी भी वापस लाई जा सकती हैं।</p><p><a href="{url}">वापस लाएँ या डाउनलोड करें</a></p><p>फ़िल्मांकन: {studioName}।</p>',

  },
} as const

export type MessageKey = keyof (typeof dictionary)['en']

type Vars = Record<string, string | number>

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  )
}

/** Translate a key. Missing Hindi falls back to English; a missing key returns the key. */
export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  const table = dictionary[locale] as Record<string, string> | undefined
  const value = table?.[key] ?? (dictionary[DEFAULT_LOCALE] as Record<string, string>)[key]
  if (value === undefined) return key
  return interpolate(value, vars)
}

/** Bind a locale once, at the route boundary, and pass `t` down as a prop. */
export function createTranslator(locale: Locale) {
  return (key: MessageKey, vars?: Vars) => translate(locale, key, vars)
}
export type Translator = ReturnType<typeof createTranslator>

/**
 * Resolve tenant-authored content. The same silent-fallback rule as `translate`, applied to
 * operator input rather than to our dictionary.
 */
export function resolveLocalised(
  value: LocalisedString | string | null | undefined,
  locale: Locale,
): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  const candidate = value[locale]
  if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate
  return value.en ?? ''
}

/** Narrow anything (a cookie, a query param, an Accept-Language header) to a supported locale. */
export function parseLocale(input: string | null | undefined): Locale {
  return parseLocaleOrNull(input) ?? DEFAULT_LOCALE
}

/**
 * The same narrowing, but `null` when there is nothing to narrow (N-29).
 *
 * The distinction matters: "the guest has chosen English" and "the guest has chosen nothing" were
 * the same value, so a catalogue could not have a default of its own. `parseLocale` folds them
 * together and is still right everywhere no catalogue is in scope.
 */
export function parseLocaleOrNull(input: string | null | undefined): Locale | null {
  if (!input) return null
  const head = input.toLowerCase().split(',')[0]?.split('-')[0]?.trim()
  return (LOCALES as readonly string[]).includes(head ?? '') ? (head as Locale) : null
}

export const LOCALE_LABELS: Record<Locale, string> = { en: 'EN', hi: 'हिं' }
