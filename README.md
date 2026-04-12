# HACKATHON — 해커톤 올인원 플랫폼

해커톤 탐색부터 팀 구성, 제출, 순위 확인까지 — 해커톤의 모든 과정을 하나의 웹에서.

## 배포 URL

🔗 **https://hackathon-platform-rose.vercel.app**

## 기술 스택

| 구분 | 기술 |
|------|------|
| 프레임워크 | React 18 |
| 빌드 도구 | Vite 6 |
| 스타일링 | CSS-in-JS (Token System) |
| 상태 관리 | useState / useReducer / Custom Hooks |
| 데이터 저장 | localStorage (더미 데이터 기반) |
| 폰트 | Pretendard (본문) + JetBrains Mono (숫자) |
| 배포 | Vercel |

## 페이지 구성

### 메인 페이지 `/`
- 해커톤 보러가기 / 팀 찾기 / 랭킹 보기 3개 히어로 카드
- PC: 2열 레이아웃 (해커톤 좌측 전체, 팀찾기·랭킹 우측 분할)
- 모바일: 1열 세로 배치

### 해커톤 목록 `/hackathons`
- 6개 해커톤 더미 데이터 (진행중 / 예정 / 종료)
- 상태 칩 필터 (전체 / 진행중 / 예정 / 종료)
- 태그 drawer 필터 (기술 / 분야 / 기타 3그룹, 복수 선택)
- 정렬 기능 (상태순 / 최신순 / 마감기한순)
- 보기 모드 전환 (S: 컴팩트 / M: 그리드 / L: 대형 그리드)
- SVG 일러스트 썸네일 (외부 이미지 없이 자체 생성)

### 해커톤 상세 `/hackathons/:slug`
- 7개 섹션: 개요 / 평가 / 상금 / 일정 / 팀 / 제출 / 리더보드
- SectionNav (sticky 탭, IntersectionObserver 기반 활성 추적)
- 섹션별 아이콘 표시 (보기 모드 크기 연동)
- 프로젝트 제출 폼 (useReducer, 팀명·ZIP·PDF·URL 입력, 유효성 검사)
- 제출 내역 localStorage 저장

### 팀원 모집 `/camp`
- 팀 CRUD (생성 / 수정 / 삭제 / 모집 상태 토글)
- 모집 상태 필터 (전체 / 모집중 / 모집마감)
- 해커톤별 필터 (drawer 방식)
- 포지션별 필터 (개발 / 데이터·AI / 디자인·기획 / 기타 분류)
- 포지션 입력: 프리셋 10종 + 커스텀 직접 입력 (최대 10개)
- 정렬: 모집중 → 모집마감 순, 동일 상태 내 최근 생성순

### 랭킹 `/rankings`
- 전체 통합 랭킹 + 해커톤별 개별 랭킹 전환
- 기간 필터 (7일 / 30일 / 전체)
- Top 3 금·은·동 메달 보더
- 기본 5위 표시, 펼쳐보기로 전체 확인

## 주요 기능

### 투톤 테마 설정
- 8종 프리셋 팔레트 + 커스텀 컬러 피커 (Primary / Secondary)
- 라이트 / 다크 모드 전환
- 테마 색상에 따라 배경색도 자동 조정
- "적용" 버튼으로 확정 → 패널 닫힘 + 스크롤 최상단
- 설정값 localStorage 저장

### 배너 슬라이드
- 5초 간격 자동 전환 (2026 해커톤 / 카피바라 원정대)
- 좌우 수평 슬라이드 애니메이션
- 스와이프(드래그) + 인디케이터 클릭으로 수동 전환
- 스크롤 시 함께 올라감 (NavBar만 상단 고정)

### 로컬 데이터 저장
| 항목 | localStorage 키 | 내용 |
|------|-----------------|------|
| 테마 색상 | `hackathon_theme` | primary / secondary 컬러 |
| 모드 | `hackathon_colorMode` | light / dark |
| 보기 크기 | `hackathon_iconSize` | S / M / L |
| 팀 목록 | `hackathon_teams` | 생성·수정·삭제 반영 |
| 소유 팀 | `hackathon_ownedCodes` | 내가 만든 팀 코드 |
| 제출 내역 | `hackathon_submissions_[slug]` | 해커톤별 제출물 |

### UX 시스템
- 페이지 상태: loading → success → empty → error (usePageData 훅)
- 스켈레톤 shimmer 로딩 (200~500ms)
- ProgressBar (상단 3px 파란 바)
- Toast 알림 (성공: 초록 / 삭제·에러: 빨강, 2.2초 자동 소멸)
- D-day 배지 (3일 이내 빨강 pulse / 7일 이내 노랑)
- 반응형: Desktop(>768px) / Mobile(≤768px) / Small(≤360px)
- PC 화면 1.25배 줌 적용

## 프로젝트 구조

```
hackathon-app/
├── index.html
├── package.json
├── vite.config.js
├── vercel.json
└── src/
    ├── main.jsx          # 엔트리 포인트
    └── App.jsx           # 전체 앱 (컴포넌트 40+ / 스타일 / 데이터)
```

## 로컬 실행

```bash
npm install
npm run dev
```

## 빌드

```bash
npm run build
```

## 팀 정보

**카피바라 원정대**
