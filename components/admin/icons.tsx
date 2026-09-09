/**
 * The handful of icons the console uses.
 *
 * Inline rather than an icon package: seven glyphs is not worth a dependency that ships a
 * thousand, and `pnpm check:bundle` gates first-load JS. All decorative — every one sits beside
 * its own text label, so they carry `aria-hidden` at the call site rather than a title here.
 */

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const IconGrid = () => (
  <Svg>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </Svg>
)

/** A paint swatch: the studio's own look rather than any one wedding's (N-26). */
export const IconPalette = () => (
  <Svg>
    <circle cx="12" cy="12" r="9" />
    <circle cx="9" cy="9" r="1.2" />
    <circle cx="15" cy="9" r="1.2" />
    <circle cx="9.5" cy="15" r="1.2" />
  </Svg>
)

export const IconPlus = () => (
  <Svg>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const IconFilm = () => (
  <Svg>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 4v16M17 4v16M3 12h18" />
  </Svg>
)

export const IconImage = () => (
  <Svg>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m4 17 5-4 4 3 3-2 4 3" />
  </Svg>
)

export const IconExit = () => (
  <Svg>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />
  </Svg>
)

export const IconSearch = () => (
  <Svg>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
)

export const IconCheck = () => (
  <Svg>
    <path d="m5 13 4 4L19 7" />
  </Svg>
)

export const IconSend = () => (
  <Svg>
    <path d="M21 3 3 10.5l7 3 3 7z" />
    <path d="m10 13.5 4-4" />
  </Svg>
)
