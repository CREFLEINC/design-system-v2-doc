import { defineConfig, devices } from '@playwright/test'

/**
 * e2e 는 소비자의 조건을 그대로 재현해야 한다. 안 그러면 연극이다.
 *
 * 소비자 조건 (CREFLE reports 의 업로드 PDF 렌더러, docker-compose.yml 실측):
 *   · Chromium — mcr.microsoft.com/playwright/python:v1.60.0-noble
 *   · file:// 렌더 (프로토콜이 opaque origin → 모듈 스크립트·fetch 차단)
 *   · network_mode: "none" — 네트워크가 아예 없다
 *
 * 그래서 여기엔 **webServer 가 없다.** http:// 로 서빙하면 이 시스템의 최대 리스크
 * ("file://·무네트워크에서 작동하는가")를 구조적으로 검증할 수 없게 된다.
 * Storybook 을 버린 이유도 같다 — 그건 http:// 로만 서빙한다.
 *
 * 버전 핀: @playwright/test 는 렌더러의 playwright==1.60.0 과 **정확히** 같아야 한다.
 * 어긋나면 배포하는 엔진과 다른 엔진을 테스트하게 된다. package.json 에 ^ 없이 박아뒀다.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list']] : [['list']],
  use: {
    // dev 서버 없음. 테스트가 file:// URL 로 직접 goto 한다.
    baseURL: undefined,
    trace: 'retain-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
})
