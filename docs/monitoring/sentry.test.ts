import { describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/react', () => ({ init: vi.fn() }))

import { scrubBreadcrumb } from './sentry'

describe('scrubBreadcrumb', () => {
  it('drops console breadcrumbs', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'page body…' })).toBeNull()
  })

  it('strips the query from request and navigation URLs', () => {
    expect(
      scrubBreadcrumb({ category: 'fetch', data: { url: '/api/search?q=salary&x=1', method: 'GET' } }),
    ).toMatchObject({ data: { url: '/api/search', method: 'GET' } })

    expect(
      scrubBreadcrumb({ category: 'navigation', data: { from: '/b/1?card=2', to: '/p/3#h' } }),
    ).toMatchObject({ data: { from: '/b/1', to: '/p/3' } })
  })

  it('keeps a click target path but not its attribute text', () => {
    expect(
      scrubBreadcrumb({ category: 'ui.click', message: 'div.row > button[aria-label="Open Q3 salaries"]' }),
    ).toMatchObject({ message: 'div.row > button' })
  })
})
