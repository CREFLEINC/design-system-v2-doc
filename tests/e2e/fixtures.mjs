import { test as base, expect } from '@playwright/test'
import { pathToFileURL } from 'node:url'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..', '..'))

/**
 * 소비자의 격리 조건을 재현하는 fixture.
 *
 * `network_mode: "none"` 컨테이너를 흉내내려면 "네트워크를 안 쓴다"고 믿는 것으로는
 * 부족하다 — **막고, 시도가 있었는지 기록한다.** 그 기록이 비어 있다는 단언이
 * 이 repo 에서 가장 값진 테스트다: CDN 폰트 버그가 영원히 못 돌아온다는 기계적 증명.
 *
 * 실제 사고: 발행된 OhMyFactory_PoC_기획서_v2.pdf 는 개발자 맥(네트워크 있음)에서
 * 렌더돼 CDN Pretendard 가 잘 임베드됐다. 같은 문서를 웹 업로드로 올리면 격리
 * 컨테이너가 CDN 을 못 받아 폰트가 통째로 폴백된다 — 같은 문서, 다른 PDF.
 */
export const test = base.extend({
  /** file:// 외 모든 요청을 차단하고, 차단된 URL 을 수집해 주는 페이지. */
  isolatedPage: async ({ page, context }, use) => {
    /** @type {string[]} */
    const blocked = []
    /** @type {string[]} */
    const consoleErrors = []

    // file:// 이 아닌 모든 요청을 abort — network_mode:"none" 과 동일한 효과.
    await context.route(
      (url) => url.protocol !== 'file:',
      (route) => {
        blocked.push(route.request().url())
        return route.abort()
      }
    )
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })
    page.on('pageerror', (e) => consoleErrors.push(String(e)))

    // 테스트가 읽을 수 있도록 페이지에 붙여둔다.
    Object.assign(page, { blocked, consoleErrors })
    await use(page)
  }
})

/** 예제/템플릿 파일의 file:// URL. @param {string} rel @returns {string} */
export const fileUrl = (rel) => pathToFileURL(join(ROOT, rel)).href

export { expect }
