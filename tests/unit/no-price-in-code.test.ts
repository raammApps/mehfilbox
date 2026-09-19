import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * D-61, N-118 — no rupee figure lives in the application.
 *
 * Prices are a platform setting: an admin changes one in the console and it changes everywhere it
 * is quoted, with no deploy. That is only true while nothing quotes a *typed* number, because a
 * typed number is the copy that goes stale the moment the setting moves — the marketing page still
 * saying one figure while the checkout charges another. This is what stops it coming back.
 *
 * It reads the TypeScript syntax tree rather than grepping, so a rupee amount in a comment — a
 * cost estimate, the history of a decision — is fine, and the same amount in a string, a template
 * or JSX text is not. Markdown under `docs/help` is scanned whole: it renders at `/help/*` straight
 * from the repo and cannot read a database, so it must not quote a price either.
 *
 * A bare `₹` is fine (a label beside an input); a `₹` followed by a digit is a figure.
 */

const FIGURE = /₹\s?\d/

const CODE_ROOTS = ['app', 'components', 'lib', 'themes', 'modules']
const HELP_ROOT = 'docs/help'

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

/** Every place in a TS/TSX file where a figure appears outside a comment. */
function figuresIn(path: string): string[] {
  const text = readFileSync(path, 'utf8')
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found: string[] = []

  const visit = (node: ts.Node) => {
    const isText =
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    if (isText && FIGURE.test(node.getText(source))) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
      found.push(`${relative(process.cwd(), path)}:${line + 1}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

describe('no rupee figure in the application', () => {
  it('appears in no string, template or JSX text under app, components, lib, themes or modules', () => {
    const files = CODE_ROOTS.flatMap((root) => walk(join(process.cwd(), root))).filter((path) =>
      /\.(ts|tsx)$/.test(path),
    )
    expect(files.length).toBeGreaterThan(100) // the walk found the application, not an empty folder

    const offenders = files.flatMap(figuresIn)

    expect(
      offenders,
      'a price is typed in code — read it from the price list (lib/pricing.ts) instead',
    ).toEqual([])
  })

  it('appears in no rendered help page', () => {
    const pages = walk(join(process.cwd(), HELP_ROOT)).filter((path) => path.endsWith('.md'))
    expect(pages.length).toBeGreaterThan(0)

    const offenders = pages.flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, index) => (FIGURE.test(line) ? [`${relative(process.cwd(), path)}:${index + 1}`] : [])),
    )

    expect(offenders, 'a help page quotes a price — say where to find today’s price instead').toEqual([])
  })

  it('does not mistake a comment for a figure, or a bare ₹ label for one', () => {
    const scan = (code: string) => {
      const source = ts.createSourceFile('x.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      let hit = false
      const visit = (node: ts.Node) => {
        if ((ts.isStringLiteral(node) || ts.isJsxText(node)) && FIGURE.test(node.getText(source))) hit = true
        ts.forEachChild(node, visit)
      }
      visit(source)
      return hit
    }

    expect(scan('// costs about ₹500 a month\nconst a = 1')).toBe(false)
    expect(scan('/* ₹1,999 */ const a = 1')).toBe(false)
    expect(scan('const a = <label>₹<input /></label>')).toBe(false)
    expect(scan("const a = 'sold at ₹1,999'")).toBe(true)
    expect(scan('const a = <p>only ₹25 a month</p>')).toBe(true)
  })
})
