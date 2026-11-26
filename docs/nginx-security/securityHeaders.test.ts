import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * nginx drops server-level `add_header` directives in a location that sets
 * its own, so the security-headers snippet must be included wherever
 * headers are added, and it must keep enforcing the directives that cannot
 * break the app.
 */

const CONFIG_ROOT = __dirname
const SNIPPET_PATH = resolve(CONFIG_ROOT, 'nginx/security-headers.conf')
const SERVER_CONFIG_PATH = resolve(CONFIG_ROOT, 'nginx.conf')
const SNIPPET_NAME = 'security-headers.conf'

const ENFORCED_CSP = /^add_header Content-Security-Policy "([^"]+)" always;$/m
const REPORT_ONLY_CSP = /^add_header Content-Security-Policy-Report-Only "([^"]+)" always;$/m
const INLINE_SCRIPTS = /script-src[^;]*'unsafe-inline'/
const LOCATION_START = /\n\s*location /
const LOCATION_END = '\n    }'
const ADDS_HEADER = /^\s*add_header /m

const HARD_DIRECTIVES = ["object-src 'none'", "base-uri 'self'", "frame-ancestors 'self'"] as const

const snippet = readFileSync(SNIPPET_PATH, 'utf8')
const serverConfig = readFileSync(SERVER_CONFIG_PATH, 'utf8')

function locationBlocks(config: string): string[] {
  return config
    .split(LOCATION_START)
    .slice(1)
    .map((block) => block.slice(0, block.indexOf(LOCATION_END)))
}

describe('client nginx security headers', () => {
  it('enforces object-src, base-uri and frame-ancestors', () => {
    const enforced = snippet.match(ENFORCED_CSP)?.[1]
    expect(enforced).toBeDefined()

    for (const directive of HARD_DIRECTIVES) {
      expect(enforced).toContain(directive)
    }
  })

  it('keeps the full policy report-only, with the same hard directives', () => {
    const reportOnly = snippet.match(REPORT_ONLY_CSP)?.[1]

    expect(reportOnly).toContain("object-src 'none'")
    expect(reportOnly).toContain("script-src 'self'")
    expect(reportOnly).not.toMatch(INLINE_SCRIPTS)
  })

  it('includes the snippet in every location that adds its own header', () => {
    for (const body of locationBlocks(serverConfig)) {
      if (ADDS_HEADER.test(body)) {
        expect(body, `location ${body.split('\n')[0]}`).toContain(SNIPPET_NAME)
      }
    }
  })
})
