import { defineConfig } from 'vitest/config'

/**
 * 테스트 피라미드를 **크기가 아니라 환경**으로 가른다.
 *
 *   vitest (여기)          — DOM 없음. 순수 함수만: lock 로직, 차트 수학, 빌드 결정성.
 *   @playwright/test       — DOM 전부. 진짜 Chromium · file:// · 네트워크 차단.
 *                            tests/e2e/ 에 있고 `npm run test:e2e` 로 돈다.
 *
 * 왜 jsdom 을 안 쓰나 — 실측했다. 설치된 jsdom 29.1.1 에서:
 *   · adoptedStyleSheets 가 **없는데 대입은 조용히 성공**한다(평범한 JS 프로퍼티가 됨)
 *     → deck-stage.js 의 shadow 스타일 주입에 대해 toHaveLength(1) 이 통과하면서 무의미
 *   · getBoundingClientRect 가 전부 0 → 덱의 핵심인 자동 스케일 수학을 검증 불가
 *   · document.fonts 가 undefined → 폰트 게이팅 경로가 아예 안 돈다
 *   · 레이아웃/페이지네이션이 없으므로 "슬라이드당 1페이지" 계약을 검증 불가
 *
 * 이건 이 팀이 **이미 데인 함정**이다 — scripts/check-foundation.test.mjs:1-16 에
 * "공허한(vacuous) 테스트였다"라고 기록돼 있다. green 을 방패 삼아 같은 실수를
 * 반복하지 않는다. DOM 이 필요하면 진짜 브라우저를 쓴다.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/**/*.test.mjs', 'src/**/*.test.mjs'],
    // e2e 는 Playwright 러너 소관이다. vitest 가 주워가면 실행하려다 실패한다.
    exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**']
  }
})
