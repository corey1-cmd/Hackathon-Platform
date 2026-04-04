import { useState, useEffect, useCallback, useMemo, useRef, useReducer } from "react";

/* ═══════════════════════════════════════════════════════════════
   LocalStorage Helpers — 변경 사항 로컬 저장
   ═══════════════════════════════════════════════════════════════ */
const LS_PREFIX = "hackathon_";

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}

function lsSet(key, value) {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); }
  catch { /* quota exceeded — silent fail */ }
}

function useLocalState(key, initialValue) {
  const [state, setState] = useState(() => lsGet(key, initialValue));
  useEffect(() => { lsSet(key, state); }, [key, state]);
  return [state, setState];
}

/* ═══════════════════════════════════════════════════════════════
   Hackathon App – Self-contained Preview (Integrated DetailPage + RankingsPage)
   Pages: MainPage, HackathonListPage, HackathonDetailPage, CampPage, RankingsPage
   ═══════════════════════════════════════════════════════════════ */

/* ── Tokens ──────────────────────────────────────────────────── */
const T = {
  bgRoot: "#0B1120", bgSurface: "#111827", bgCard: "#1A2332",
  bgElevated: "#1A1E27", border: "#1E293B",
  accent: "#3B82F6", accentSoft: "rgba(59,130,246,0.15)",
  accentGlow: "0 0 12px rgba(59,130,246,0.25)",
  error: "#EF4444", warningBg: "rgba(234,179,8,0.12)", warningText: "#FACC15",
  textPrimary: "#E2E8F0", textSecondary: "#8B95A8",
  textMuted: "#4A5568", textOnAccent: "#FFFFFF",
  statusOngoing: "#34D399", statusUpcoming: "#60A5FA", statusEnded: "#6B7280",
  rankGold: "#F59E0B", rankSilver: "#94A3B8", rankBronze: "#D97706",
  font: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', monospace",
};

/* ── Constants (from utils/constants.ts) ─────────────────────── */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_SUBMISSION_BYTES = 10 * 1024 * 1024;
const MAX_SUBMIT_NAME_LEN = 50;
const NOTES_PREVIEW_LEN = 50;
const CAMP_TITLE_TRUNCATE = 20;
const MAX_TEAM_NAME_LEN = 30;
const MAX_TEAM_INTRO_LEN = 200;
const MAX_LOOKING_FOR_TAGS = 10;
const SCORE_PRECISION = 100; // §6-5: round to 2 decimal places

/* ── Action constants (from store/actions.ts) ────────────────── */
const SUBMIT_ACTION = {
  SET_FIELD: "SUBMIT/SET_FIELD",
  ADD_ARTIFACT: "SUBMIT/ADD_ARTIFACT",
  REMOVE_ARTIFACT: "SUBMIT/REMOVE_ARTIFACT",
  SET_ERRORS: "SUBMIT/SET_ERRORS",
  CLEAR_FIELD_ERROR: "SUBMIT/CLEAR_FIELD_ERROR",
  SET_SUBMITTING: "SUBMIT/SET_SUBMITTING",
  RESET: "SUBMIT/RESET",
};

const TEAM_ACTION = {
  SET_TEXT_FIELD: "TEAM/SET_TEXT_FIELD",
  SET_IS_OPEN: "TEAM/SET_IS_OPEN",
  ADD_TAG: "TEAM/ADD_TAG",
  REMOVE_TAG: "TEAM/REMOVE_TAG",
  SET_ERRORS: "TEAM/SET_ERRORS",
  CLEAR_FIELD_ERROR: "TEAM/CLEAR_FIELD_ERROR",
  RESET: "TEAM/RESET",
};

/* ── Utility functions ───────────────────────────────────────── */
function formatDateKST(d, style) {
  const date = d instanceof Date ? d : new Date(d);
  if (style === "full") {
    return date.toLocaleDateString("ko-KR", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul",
    });
  }
  return date.toLocaleDateString("ko-KR", {
    year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Seoul",
  });
}

function isMilestonePast(at) {
  return at.getTime() < Date.now();
}

function getDdayInfo(deadlineStr) {
  const deadline = new Date(deadlineStr);
  const now = Date.now();
  const diff = deadline.getTime() - now;
  if (diff <= 0) return { label: "마감됨", level: "ended" };
  const days = Math.ceil(diff / 86400000);
  if (days <= 3) return { label: `D-${days}`, level: "urgent" };
  if (days <= 7) return { label: `D-${days}`, level: "soon" };
  return { label: `D-${days}`, level: "normal" };
}

function generateSubmissionId() {
  return `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function generateTeamCode() {
  return `team-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function isValidUrl(str) {
  try { const u = new URL(str); return u.protocol === "https:" || u.protocol === "http:"; }
  catch { return false; }
}

function isPdfUrl(str) {
  try { return new URL(str).pathname.toLowerCase().endsWith(".pdf"); }
  catch { return false; }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

const MIME_MAP = {
  zip: ["application/zip", "application/x-zip-compressed", "application/x-zip"],
};
const ACCEPT_MAP = {
  zip: ".zip,application/zip,application/x-zip-compressed",
  PDF: ".pdf",
  URL: "",
  ZIP: ".zip",
};

const HEADER_OFFSET_PX = 112;

/* ── Theme Presets (★ Phase 1 — 투톤 테마 설정) ──────────── */
const THEME_PRESETS = [
  { name: "기본 블루", primary: "#3B82F6", secondary: "#60A5FA" },
  { name: "바이올렛", primary: "#8B5CF6", secondary: "#A78BFA" },
  { name: "에메랄드", primary: "#10B981", secondary: "#34D399" },
  { name: "로즈", primary: "#F43F5E", secondary: "#FB7185" },
  { name: "앰버", primary: "#F59E0B", secondary: "#FBBF24" },
  { name: "시안", primary: "#06B6D4", secondary: "#22D3EE" },
  { name: "인디고", primary: "#6366F1", secondary: "#818CF8" },
  { name: "핑크", primary: "#EC4899", secondary: "#F472B6" },
];

function buildTokens(primary, secondary, mode) {
  const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `${r},${g},${b}`;
  };
  const pRgb = hexToRgb(primary);
  const sRgb = hexToRgb(secondary);
  const pr = parseInt(primary.slice(1,3),16);
  const pg = parseInt(primary.slice(3,5),16);
  const pb = parseInt(primary.slice(5,7),16);
  const mix = (base, color, ratio) => Math.round(base * (1 - ratio) + color * ratio);
  const toHex = (r,g,b) => `#${[r,g,b].map(v=>Math.min(255,Math.max(0,v)).toString(16).padStart(2,'0')).join('')}`;

  const isDark = mode === "dark";

  const bgRoot =     isDark ? toHex(mix(11,pr,0.08), mix(17,pg,0.08), mix(32,pb,0.08))
                            : toHex(mix(245,pr,0.04), mix(247,pg,0.04), mix(250,pb,0.04));
  const bgSurface =  isDark ? toHex(mix(17,pr,0.07), mix(24,pg,0.07), mix(39,pb,0.07))
                            : toHex(mix(255,pr,0.02), mix(255,pg,0.02), mix(255,pb,0.02));
  const bgCard =     isDark ? toHex(mix(26,pr,0.06), mix(35,pg,0.06), mix(50,pb,0.06))
                            : toHex(mix(255,pr,0.03), mix(255,pg,0.03), mix(255,pb,0.03));
  const bgElevated = isDark ? toHex(mix(26,pr,0.05), mix(30,pg,0.05), mix(39,pb,0.05))
                            : toHex(mix(240,pr,0.04), mix(242,pg,0.04), mix(245,pb,0.04));
  const border =     isDark ? toHex(mix(30,pr,0.08), mix(41,pg,0.08), mix(59,pb,0.08))
                            : toHex(mix(220,pr,0.06), mix(225,pg,0.06), mix(230,pb,0.06));

  return {
    bgRoot, bgSurface, bgCard, bgElevated, border,
    accent: primary, accentRgb: pRgb,
    accentSoft: `rgba(${pRgb},${isDark ? 0.15 : 0.1})`,
    accentGlow: `0 0 12px rgba(${pRgb},${isDark ? 0.25 : 0.18})`,
    accent10: `rgba(${pRgb},0.1)`,
    accent20: `rgba(${pRgb},0.2)`,
    accent22: `rgba(${pRgb},0.22)`,
    accent25: `rgba(${pRgb},0.25)`,
    accent40: `rgba(${pRgb},0.4)`,
    secondary: secondary, secondaryRgb: sRgb,
    secondarySoft: `rgba(${sRgb},0.15)`,
    error: isDark ? "#EF4444" : "#DC2626",
    warningBg: "rgba(234,179,8,0.12)", warningText: isDark ? "#FACC15" : "#B45309",
    textPrimary: isDark ? "#E2E8F0" : "#1E293B",
    textSecondary: isDark ? "#8B95A8" : "#64748B",
    textMuted: isDark ? "#4A5568" : "#94A3B8",
    textOnAccent: "#FFFFFF",
    statusOngoing: isDark ? "#34D399" : "#059669",
    statusUpcoming: isDark ? secondary : primary,
    statusEnded: isDark ? "#6B7280" : "#9CA3AF",
    rankGold: "#F59E0B", rankSilver: "#94A3B8", rankBronze: "#D97706",
    font: "'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', monospace",
  };
}

/* ── Icon Size Options (★ Phase 1 — 아이콘 크기 변경) ────── */
const ICON_SIZE_OPTIONS = [
  { value: "S", px: 16, label: "S", desc: "간결하게" },
  { value: "M", px: 32, label: "M", desc: "기본" },
  { value: "L", px: 40, label: "L", desc: "크게" },
];
const DEFAULT_ICON_SIZE = "M";

/* ── Section Icon SVGs for DetailPage ───────────────────── */
function SectionIcon({ sectionId, size = 24 }) {
  const s = { width: size, height: size, display: "block", flexShrink: 0 };
  const props = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, style: s };
  switch (sectionId) {
    case "overview": return <svg {...props}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
    case "eval": return <svg {...props}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>;
    case "prize": return <svg {...props}><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>;
    case "schedule": return <svg {...props}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
    case "teams": return <svg {...props}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>;
    case "submit": return <svg {...props}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
    case "leaderboard": return <svg {...props}><path d="M8 21h8"/><line x1="12" y1="17" x2="12" y2="21"/><path d="M6 3h12v8a6 6 0 01-12 0V3z"/></svg>;
    default: return null;
  }
}

/* ── Page Data Hook — async simulation ─────────────────────── */
function usePageData(fetchFn, deps = []) {
  const [state, setState] = useState({ status: "loading", data: null, error: null });

  const load = useCallback(() => {
    setState({ status: "loading", data: null, error: null });
    const delay = 200 + Math.random() * 300; // 200–500ms
    const timer = setTimeout(() => {
      try {
        const result = fetchFn();
        if (!result || (Array.isArray(result) && result.length === 0)) {
          setState({ status: "empty", data: result, error: null });
        } else {
          setState({ status: "success", data: result, error: null });
        }
      } catch (err) {
        setState({ status: "error", data: null, error: err.message || "알 수 없는 오류" });
      }
    }, delay);
    return () => clearTimeout(timer);
  }, deps);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load]);

  return { ...state, retry: load };
}

function isWithinPeriod(date, period) {
  if (period === "all") return true;
  const now = Date.now();
  const ms = period === "7d" ? 7 * 86400000 : 30 * 86400000;
  const d = date instanceof Date ? date : new Date(date);
  return now - d.getTime() <= ms;
}

/* ── Mock Data ───────────────────────────────────────────────── */

/* ── SVG Thumbnail Generator ────────────────────────────────── */
function makeSvgThumb(gradFrom, gradTo, iconPaths, patternDots) {
  const dots = (patternDots || []).map(([cx,cy,r]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" opacity="0.06"/>`).join('');
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${gradFrom}"/><stop offset="100%" stop-color="${gradTo}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/>${dots}<g transform="translate(200,150)" stroke="white" stroke-width="2" fill="none" opacity="0.85">${iconPaths}</g></svg>`)}`;
}

const THUMB_AI = makeSvgThumb("#4F46E5","#7C3AED",
  `<circle r="28"/><circle r="12" cx="-40" cy="-25"/><circle r="12" cx="40" cy="-25"/><circle r="12" cx="-40" cy="25"/><circle r="12" cx="40" cy="25"/><circle r="10" cx="0" cy="-50"/><circle r="10" cx="0" cy="50"/><line x1="0" y1="-28" x2="0" y2="-40"/><line x1="-24" y1="-14" x2="-32" y2="-19"/><line x1="24" y1="-14" x2="32" y2="-19"/><line x1="-24" y1="14" x2="-32" y2="19"/><line x1="24" y1="14" x2="32" y2="19"/><line x1="0" y1="28" x2="0" y2="40"/><circle r="5" fill="white" opacity="0.4"/>`,
  [[50,40,4],[320,60,6],[80,230,5],[350,220,3],[180,30,3],[30,140,4],[370,150,5]]
);

const THUMB_GREEN = makeSvgThumb("#059669","#10B981",
  `<path d="M-5,-45 C-5,-45 -40,-20 -40,10 C-40,30 -25,45 -5,45 C-5,45 -5,-45 -5,-45Z" fill="white" opacity="0.2" stroke="white"/><path d="M-5,-45 C-5,-45 30,-20 30,10 C30,30 15,45 -5,45" /><line x1="-5" y1="-10" x2="-25" y2="5"/><line x1="-5" y1="10" x2="-20" y2="20"/><path d="M40,-30 L40,20 M30,-10 L50,-10" stroke="white" stroke-width="3" opacity="0.5"/><circle cx="40" cy="-30" r="8" opacity="0.3" fill="white"/>`,
  [[60,50,5],[340,70,4],[90,240,6],[330,230,4],[200,25,3],[25,180,3],[380,140,5]]
);

const THUMB_FINTECH = makeSvgThumb("#1E40AF","#3B82F6",
  `<rect x="-40" y="10" width="16" height="30" rx="3" fill="white" opacity="0.25"/><rect x="-16" y="-10" width="16" height="50" rx="3" fill="white" opacity="0.35"/><rect x="8" y="-30" width="16" height="70" rx="3" fill="white" opacity="0.5"/><rect x="32" y="-18" width="16" height="58" rx="3" fill="white" opacity="0.4"/><line x1="-45" y1="42" x2="53" y2="42" stroke="white" stroke-width="1.5" opacity="0.3"/><polyline points="-32,-15 -8,-30 16,-45 40,-35" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>`,
  [[45,35,5],[350,55,4],[70,250,6],[310,240,3],[190,20,4],[20,120,3],[380,170,5]]
);

const THUMB_HEALTH = makeSvgThumb("#BE123C","#F43F5E",
  `<path d="M0,-10 C0,-36 -35,-36 -35,-10 C-35,14 0,36 0,50 C0,36 35,14 35,-10 C35,-36 0,-36 0,-10Z" fill="white" opacity="0.25" stroke="white" stroke-width="2.5"/><path d="M0,-10 C0,-36 -35,-36 -35,-10 C-35,14 0,36 0,50" stroke="white" stroke-width="2" fill="none" opacity="0.5"/>`,
  [[55,45,4],[330,65,5],[75,235,6],[345,225,4],[195,22,3],[28,160,4],[375,145,3]]
);

const THUMB_EDU = makeSvgThumb("#D97706","#F59E0B",
  `<path d="M0,-45 L40,-25 L0,-5 L-40,-25 Z" fill="white" opacity="0.2" stroke="white"/><path d="M-30,-20 L-30,10 C-30,25 0,35 0,35 C0,35 30,25 30,10 L30,-20"/><line x1="40" y1="-25" x2="40" y2="15"/><circle cx="40" cy="18" r="4" fill="white" opacity="0.5"/><circle cx="0" cy="-25" r="6" fill="white" opacity="0.4"/>`,
  [[50,50,5],[320,55,4],[85,240,6],[335,235,3],[180,18,3],[22,140,4],[375,160,5]]
);

const THUMB_OSS = makeSvgThumb("#0F766E","#14B8A6",
  `<text x="0" y="0" text-anchor="middle" fill="none" stroke="white" stroke-width="1.5" font-size="60" font-family="monospace" dominant-baseline="central" opacity="0.9">&lt;/&gt;</text><path d="M-45,35 L45,35" stroke="white" stroke-width="2" opacity="0.4"/><circle cx="-30" cy="35" r="3" fill="white" opacity="0.5"/><rect x="-15" y="32" width="50" height="6" rx="3" fill="white" opacity="0.15"/><path d="M35,-40 L45,-40 L45,-30" stroke="white" stroke-width="2" opacity="0.4"/><path d="M-35,40 L-45,40 L-45,30" stroke="white" stroke-width="2" opacity="0.4"/>`,
  [[60,40,4],[340,50,5],[80,245,5],[350,230,4],[200,20,3],[30,170,3],[370,130,6]]
);

const MOCK_HACKATHONS = [
  {
    slug: "ai-innovation-2026",
    title: "AI Innovation Challenge 2026",
    status: "ongoing",
    tags: ["AI", "딥러닝", "LLM"],
    thumbnailUrl: THUMB_AI,
    period: { submissionDeadlineAt: "2026-04-15T23:59:00+09:00", endAt: "2026-04-30T23:59:00+09:00" },
  },
  {
    slug: "green-energy-hack",
    title: "그린에너지 해커톤",
    status: "ongoing",
    tags: ["환경", "IoT", "하드웨어"],
    thumbnailUrl: THUMB_GREEN,
    period: { submissionDeadlineAt: "2026-04-20T18:00:00+09:00", endAt: "2026-05-10T23:59:00+09:00" },
  },
  {
    slug: "fintech-future",
    title: "핀테크 퓨처 해커톤",
    status: "upcoming",
    tags: ["핀테크", "블록체인", "AI"],
    thumbnailUrl: THUMB_FINTECH,
    period: { submissionDeadlineAt: "2026-06-01T23:59:00+09:00", endAt: "2026-06-15T23:59:00+09:00" },
  },
  {
    slug: "health-data-2025",
    title: "헬스데이터 챌린지 2025",
    status: "ended",
    tags: ["헬스케어", "데이터"],
    thumbnailUrl: THUMB_HEALTH,
    period: { submissionDeadlineAt: "2025-12-01T23:59:00+09:00", endAt: "2025-12-20T23:59:00+09:00" },
  },
  {
    slug: "edu-platform-hack",
    title: "교육 플랫폼 혁신 해커톤",
    status: "upcoming",
    tags: ["교육", "AI", "UX"],
    thumbnailUrl: THUMB_EDU,
    period: { submissionDeadlineAt: "2026-07-01T23:59:00+09:00", endAt: "2026-07-20T23:59:00+09:00" },
  },
  {
    slug: "open-source-fest",
    title: "오픈소스 페스트 2025",
    status: "ended",
    tags: ["오픈소스", "DevOps"],
    thumbnailUrl: THUMB_OSS,
    period: { submissionDeadlineAt: "2025-10-15T23:59:00+09:00", endAt: "2025-11-01T23:59:00+09:00" },
  },
];

const MOCK_TEAMS = [
  { teamCode: "t-001", hackathonSlug: "ai-innovation-2026", name: "AlphaForge", isOpen: true, memberCount: 4, lookingFor: ["프론트엔드", "데이터 엔지니어"], intro: "AI 기반 의료 진단 시스템을 개발하고 있습니다. 의료 데이터 분석과 모델 서빙 경험이 있는 분을 찾고 있어요.", contact: { type: "link", url: "https://open.kakao.com/example1" }, createdAt: new Date("2026-03-01T12:00:00+09:00") },
  { teamCode: "t-002", hackathonSlug: "ai-innovation-2026", name: "NeuralNest", isOpen: true, memberCount: 3, lookingFor: ["백엔드", "MLOps"], intro: "자연어 처리 엔진 프로젝트입니다. FastAPI + Kubernetes 환경에서 모델을 배포한 경험이 있으면 좋겠습니다.", contact: { type: "link", url: "https://open.kakao.com/example2" }, createdAt: new Date("2026-03-05T09:30:00+09:00") },
  { teamCode: "t-003", hackathonSlug: "ai-innovation-2026", name: "DeepBlue 팀", isOpen: false, memberCount: 5, lookingFor: ["디자이너"], intro: "컴퓨터 비전 기반 품질 검사 솔루션. 팀원 모집이 완료되었습니다.", contact: { type: "link", url: "https://discord.gg/example3" }, createdAt: new Date("2026-02-28T15:00:00+09:00") },
  { teamCode: "t-004", hackathonSlug: "green-energy-hack", name: "EcoVolt", isOpen: true, memberCount: 3, lookingFor: ["하드웨어 엔지니어", "IoT 개발자"], intro: "스마트 그리드 에너지 최적화 프로젝트. Arduino/ESP32 경험자 환영합니다.", contact: { type: "link", url: "https://open.kakao.com/example4" }, createdAt: new Date("2026-03-10T14:00:00+09:00") },
  { teamCode: "t-005", hackathonSlug: "green-energy-hack", name: "GreenGrid", isOpen: true, memberCount: 4, lookingFor: ["데이터 분석", "프론트엔드"], intro: "재생에너지 모니터링 대시보드를 만들고 있습니다. 시각화 경험이 있는 분을 찾습니다.", contact: { type: "link", url: "https://discord.gg/example5" }, createdAt: new Date("2026-03-08T11:00:00+09:00") },
  { teamCode: "t-006", hackathonSlug: "fintech-future", name: "BlockPay", isOpen: true, memberCount: 2, lookingFor: ["스마트 컨트랙트", "프론트엔드", "백엔드"], intro: "블록체인 기반 결제 시스템을 개발합니다. Solidity와 Web3.js 경험자를 모집 중입니다.", contact: { type: "link", url: "https://open.kakao.com/example6" }, createdAt: new Date("2026-04-01T10:00:00+09:00") },
  { teamCode: "t-007", hackathonSlug: "health-data-2025", name: "MedInsight", isOpen: false, memberCount: 5, lookingFor: [], intro: "헬스케어 데이터 분석 챌린지 참가팀. 모집 완료.", contact: { type: "link", url: "https://discord.gg/example7" }, createdAt: new Date("2025-11-15T09:00:00+09:00") },
  { teamCode: "t-008", hackathonSlug: "health-data-2025", name: "HealthAI", isOpen: false, memberCount: 4, lookingFor: [], intro: "의료 영상 데이터 분류 모델 프로젝트. 대회 종료.", contact: { type: "link", url: "https://open.kakao.com/example8" }, createdAt: new Date("2025-11-10T16:00:00+09:00") },
  { teamCode: "t-009", hackathonSlug: "edu-platform-hack", name: "EduFlow", isOpen: true, memberCount: 3, lookingFor: ["UX 디자이너", "프론트엔드"], intro: "AI 기반 적응형 학습 플랫폼을 구상하고 있습니다. 교육 도메인에 관심 있는 분 환영!", contact: { type: "link", url: "https://open.kakao.com/example9" }, createdAt: new Date("2026-04-10T13:00:00+09:00") },
  { teamCode: "t-010", hackathonSlug: "open-source-fest", name: "OSS-Korea", isOpen: false, memberCount: 6, lookingFor: [], intro: "오픈소스 CI/CD 파이프라인 프로젝트. 대회 종료 후 오픈소스로 공개 예정.", contact: { type: "link", url: "https://github.com/oss-korea" }, createdAt: new Date("2025-10-01T10:00:00+09:00") },
];

/* ── Mock detail data per hackathon ─────────────────────────── */
const MOCK_DETAILS = {
  "ai-innovation-2026": {
    title: "AI Innovation Challenge 2026",
    sections: {
      overview: {
        summary: "최첨단 AI 기술을 활용하여 사회적 문제를 해결하는 혁신적인 솔루션을 개발하는 대회입니다. 참가자들은 LLM, 컴퓨터 비전, 강화학습 등 다양한 AI 기술을 자유롭게 활용할 수 있으며, 실제 산업 현장에서 활용 가능한 프로토타입을 제출해야 합니다.",
        teamPolicy: { allowSolo: true, maxTeamSize: 5 },
      },
      info: {
        notice: [
          "모든 제출물은 대회 기간 내에 새로 개발한 것이어야 합니다.",
          "외부 API 사용 시 반드시 사전 승인을 받아야 합니다.",
          "최종 발표는 온라인으로 진행됩니다.",
        ],
        links: { rules: "#", faq: "#" },
      },
      eval: {
        type: "vote",
        metricName: "종합 평가 점수",
        description: "참가자 상호 평가와 전문 심사위원 평가를 가중 합산하여 최종 순위를 결정합니다. 기술 완성도, 혁신성, 실용성을 종합적으로 평가합니다.",
        scoreDisplay: {
          label: "최종 점수 = 참가자 점수 × 40% + 심사위원 점수 × 60%",
          breakdown: [
            { key: "peer", label: "참가자 상호 평가", weightPercent: 40 },
            { key: "judge", label: "심사위원 평가", weightPercent: 60 },
          ],
        },
      },
      prize: {
        items: [
          { place: "대상", amountKRW: 5000000 },
          { place: "최우수상", amountKRW: 3000000 },
          { place: "우수상", amountKRW: 1000000 },
          { place: "장려상", amountKRW: 500000 },
        ],
      },
      schedule: {
        timezone: "Asia/Seoul (KST, UTC+9)",
        milestones: [
          { name: "참가 신청 시작", at: new Date("2026-02-01T10:00:00+09:00") },
          { name: "참가 신청 마감", at: new Date("2026-03-01T23:59:00+09:00") },
          { name: "개발 기간 시작", at: new Date("2026-03-15T10:00:00+09:00") },
          { name: "제출 마감", at: new Date("2026-04-15T23:59:00+09:00") },
          { name: "심사 기간", at: new Date("2026-04-20T10:00:00+09:00") },
          { name: "결과 발표", at: new Date("2026-04-30T14:00:00+09:00") },
        ],
      },
      teams: { campEnabled: true },
      submit: {
        guide: [
          "프로젝트 소스 코드를 GitHub 저장소에 업로드하세요.",
          "README.md에 프로젝트 설명, 실행 방법, 기술 스택을 작성하세요.",
          "데모 영상 (3분 이내)을 촬영하여 링크를 제출하세요.",
          "최종 제출 버튼을 눌러 제출을 완료하세요.",
        ],
        allowedArtifactTypes: ["ZIP", "PDF", "URL"],
        submissionUrl: "#",
        submissionItems: [
          { key: "code", title: "소스 코드", format: "zip" },
          { key: "docs", title: "기술 문서", format: "pdf_url" },
          { key: "demo", title: "데모 영상 링크", format: "url" },
        ],
      },
    },
  },
  "green-energy-hack": {
    title: "그린에너지 해커톤",
    sections: {
      overview: {
        summary: "지속 가능한 에너지 솔루션을 IoT와 하드웨어 기술로 구현하는 해커톤입니다. 스마트 그리드, 에너지 모니터링, 재생에너지 최적화 등 다양한 주제로 참여할 수 있습니다.",
        teamPolicy: { allowSolo: false, maxTeamSize: 4 },
      },
      info: {
        notice: [
          "하드웨어 키트는 사전 신청 시 무료로 제공됩니다.",
          "최종 발표는 세종시 오프라인 행사장에서 진행됩니다.",
        ],
        links: { rules: "#", faq: "#" },
      },
      eval: {
        type: "metric",
        metricName: "에너지 효율 점수 (EES)",
        description: "제출된 솔루션의 에너지 절감률을 자동 시뮬레이션 환경에서 측정합니다. 점수가 높을수록 상위 순위에 배정됩니다.",
        limits: { maxRuntimeSec: 120, maxSubmissionsPerDay: 5 },
      },
      prize: {
        items: [
          { place: "1위", amountKRW: 3000000 },
          { place: "2위", amountKRW: 2000000 },
          { place: "3위", amountKRW: 1000000 },
        ],
      },
      schedule: {
        timezone: "Asia/Seoul (KST, UTC+9)",
        milestones: [
          { name: "참가 신청 시작", at: new Date("2026-02-15T10:00:00+09:00") },
          { name: "키트 배송 완료", at: new Date("2026-03-10T18:00:00+09:00") },
          { name: "개발 기간 시작", at: new Date("2026-03-15T10:00:00+09:00") },
          { name: "제출 마감", at: new Date("2026-04-20T18:00:00+09:00") },
          { name: "오프라인 발표", at: new Date("2026-05-05T10:00:00+09:00") },
          { name: "결과 발표", at: new Date("2026-05-10T14:00:00+09:00") },
        ],
      },
      teams: { campEnabled: true },
      submit: {
        guide: [
          "하드웨어 회로도와 소스 코드를 ZIP으로 압축하세요.",
          "실측 데이터를 포함한 결과 보고서를 PDF로 작성하세요.",
          "작동 영상 링크를 첨부하세요.",
        ],
        allowedArtifactTypes: ["ZIP", "PDF", "URL"],
        submissionUrl: "#",
        submissionItems: [
          { key: "code", title: "소스 코드 + 회로도", format: "zip" },
          { key: "report", title: "결과 보고서", format: "pdf_url" },
          { key: "video", title: "작동 영상", format: "url" },
        ],
      },
    },
  },
};

/* Fill remaining hackathons with the AI detail as fallback */
for (const h of MOCK_HACKATHONS) {
  if (!MOCK_DETAILS[h.slug]) {
    MOCK_DETAILS[h.slug] = { ...MOCK_DETAILS["ai-innovation-2026"], title: h.title };
  }
}

const MOCK_LEADERBOARDS = {
  "ai-innovation-2026": {
    hackathonSlug: "ai-innovation-2026",
    updatedAt: new Date("2026-04-10T15:30:00+09:00"),
    entries: [
      { rank: 1, teamName: "AlphaForge", score: 94.7, submittedAt: new Date("2026-04-09T14:22:00+09:00"), scoreBreakdown: { participant: 38.2, judge: 56.5 }, artifacts: { webUrl: "https://alphaforge.demo.dev", pdfUrl: "https://docs.example.com/alphaforge.pdf", planTitle: "AI 기반 의료 진단" } },
      { rank: 2, teamName: "NeuralNest", score: 91.3, submittedAt: new Date("2026-04-10T08:15:00+09:00"), scoreBreakdown: { participant: 36.0, judge: 55.3 }, artifacts: { webUrl: "https://neuralnest.demo.dev", pdfUrl: "", planTitle: "자연어 처리 엔진" } },
      { rank: 3, teamName: "DeepBlue 팀", score: 88.1, submittedAt: new Date("2026-04-08T22:45:00+09:00"), scoreBreakdown: { participant: 34.5, judge: 53.6 }, artifacts: null },
      { rank: 4, teamName: "CodeCraft", score: 85.6, submittedAt: new Date("2026-04-10T11:30:00+09:00"), scoreBreakdown: { participant: 33.1, judge: 52.5 }, artifacts: null },
      { rank: 5, teamName: "QuantumLeap", score: 82.0, submittedAt: new Date("2026-04-07T16:00:00+09:00"), scoreBreakdown: { participant: 31.8, judge: 50.2 }, artifacts: null },
    ],
  },
  "green-energy-hack": {
    hackathonSlug: "green-energy-hack",
    updatedAt: new Date("2026-04-12T10:00:00+09:00"),
    entries: [
      { rank: 1, teamName: "EcoVolt", score: 97.2, submittedAt: new Date("2026-04-11T09:00:00+09:00"), scoreBreakdown: null, artifacts: { webUrl: "https://ecovolt.demo.dev", pdfUrl: "https://docs.example.com/ecovolt.pdf", planTitle: "스마트 그리드 최적화" } },
      { rank: 2, teamName: "GreenGrid", score: 93.8, submittedAt: new Date("2026-04-11T14:30:00+09:00"), scoreBreakdown: null, artifacts: null },
      { rank: 3, teamName: "SolarSync", score: 89.4, submittedAt: new Date("2026-04-10T20:15:00+09:00"), scoreBreakdown: null, artifacts: null },
    ],
  },
};

const INITIAL_MOCK_SUBMISSIONS = [
  { id: "sub-001", hackathonSlug: "ai-innovation-2026", teamName: "AlphaForge", notes: "v2 최종 제출 — GPU 추론 파이프라인 최적화 완료, A100 기준 latency 45ms 달성", artifacts: [{ stepKey: "code", fileName: "alphaforge-v2.zip", fileSize: 2340000, dataUrl: "" }], submittedAt: new Date("2026-04-09T14:22:00+09:00") },
  { id: "sub-002", hackathonSlug: "ai-innovation-2026", teamName: "AlphaForge", notes: "초기 테스트 제출", artifacts: [{ stepKey: "code", fileName: "alphaforge-v1.zip", fileSize: 1200000, dataUrl: "" }], submittedAt: new Date("2026-04-05T10:00:00+09:00") },
];

/* ── CSS ─────────────────────────────────────────────────────── */
function buildCss(T) { return `
  @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{height:auto;overflow-y:auto}
  #root{min-height:100vh}
  body{font-family:${T.font};background:${T.bgRoot};color:${T.textPrimary};line-height:1.5;-webkit-font-smoothing:antialiased}

  /* NavBar */
  .navbar{position:fixed;top:0;left:0;right:0;height:64px;background:${T.bgSurface};border-bottom:1px solid ${T.border};display:flex;align-items:center;justify-content:space-between;padding:0 24px;z-index:100}
  .logo{display:inline-flex;align-items:baseline;font-size:18px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;cursor:pointer;background:none;border:none;font-family:inherit;user-select:none}
  .logo-accent{color:${T.accent}} .logo-muted{color:${T.textSecondary}}
  .hamburger{display:flex;flex-direction:column;justify-content:center;gap:5px;width:44px;height:44px;padding:10px;background:none;border:none;cursor:pointer;border-radius:8px;transition:background 150ms ease}
  .hamburger:hover{background:${T.bgElevated}}
  .hamburger-line{display:block;width:100%;height:2px;background:${T.textPrimary};border-radius:1px}

  /* FullScreenMenu overlay */
  .fsmenu-overlay{position:fixed;inset:0;z-index:200;background:${T.bgRoot};display:flex;flex-direction:column;padding:0 32px;overflow-y:auto;animation:fadeSlideIn 200ms ease}
  .fsmenu-header{display:flex;align-items:center;justify-content:space-between;height:64px;flex-shrink:0}
  .fsmenu-close{display:flex;align-items:center;justify-content:center;width:44px;height:44px;font-size:24px;color:${T.textMuted};background:none;border:none;cursor:pointer;border-radius:8px;font-family:inherit;transition:color 150ms ease,background 150ms ease}
  .fsmenu-close:hover{color:${T.textPrimary};background:${T.bgElevated}}
  .fsmenu-nav{display:flex;flex-direction:column;gap:8px;padding:40px 0 24px}
  .fsmenu-link{display:block;text-align:left;font-size:28px;font-weight:700;color:${T.textPrimary};background:none;border:none;padding:16px 0;font-family:inherit;cursor:pointer;transition:color 150ms ease;letter-spacing:-0.01em}
  .fsmenu-link:hover{color:${T.accent}}
  .fsmenu-link--active{color:${T.accent}}
  .fsmenu-divider{height:1px;background:${T.border};margin:8px 0 24px}
  .fsmenu-theme{padding-bottom:40px}
  .fsmenu-theme-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
  .fsmenu-theme-title{font-size:16px;font-weight:600;color:${T.textPrimary}}
  @media(max-width:768px){
    .fsmenu-overlay{padding:0 20px}
    .fsmenu-link{font-size:24px;padding:14px 0}
  }

  /* AppShell */
  .shell{display:flex;flex-direction:column;min-height:100vh;background:${T.bgRoot};overflow-y:auto}
  .banner{position:relative;z-index:80;margin-top:64px;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 16px;background:${T.warningBg};color:${T.warningText};font-size:14px;font-weight:500;text-align:center}
  .banner-icon{flex-shrink:0;font-style:normal;font-size:16px;line-height:1}
  .shell-content{flex:1;padding-top:0;overflow:visible}
  .has-banner .shell-content{padding-top:0}

  /* StatusView */
  .status-wrapper{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;min-height:320px;padding:48px 24px;text-align:center}
  .spinner{display:block;width:40px;height:40px;border-radius:50%;border:3px solid ${T.border};border-top-color:${T.accent};animation:spin 700ms linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .icon-wrap{display:flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:50%}
  .icon-wrap--empty{background:rgba(139,149,168,.1);color:${T.textMuted}}
  .icon-wrap--error{background:rgba(239,68,68,.1);color:${T.error}}
  .status-icon{width:28px;height:28px;display:block}
  .status-msg{font-size:16px;color:${T.textSecondary};max-width:360px}
  .retry-btn{display:inline-flex;align-items:center;padding:12px 24px;background:${T.accent};color:${T.textOnAccent};font-size:14px;font-weight:600;border:none;border-radius:8px;cursor:pointer;font-family:inherit;box-shadow:none;transition:box-shadow 200ms ease,opacity 150ms ease}
  .retry-btn:hover,.retry-btn:focus-visible{box-shadow:${T.accentGlow}} .retry-btn:active{opacity:.85}

  /* Top progress bar */
  .progress-bar{position:fixed;top:0;left:0;height:3px;background:${T.accent};z-index:999;border-radius:0 2px 2px 0;animation:progressGrow 0.6s ease forwards}
  @keyframes progressGrow{0%{width:0}30%{width:55%}60%{width:80%}100%{width:95%}}
  .progress-bar--done{width:100%!important;animation:none;transition:width 150ms ease,opacity 300ms ease 150ms;opacity:0}

  /* Skeleton shimmer */
  @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
  .skel{border-radius:8px;background:linear-gradient(90deg,${T.bgSurface} 25%,${T.bgElevated} 50%,${T.bgSurface} 75%);background-size:200% 100%;animation:shimmer 1.8s ease infinite}
  .skel-card{height:120px;border-radius:12px;border:1px solid ${T.border}}
  .skel-row{height:52px;border-radius:8px}
  .skel-hero{height:180px;border-radius:12px;border:1px solid ${T.border}}
  .skel-list{display:flex;flex-direction:column;gap:16px}
  .skel-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
  .skel-table-wrap{border:1px solid ${T.border};border-radius:12px;overflow:hidden}
  .skel-table-head{height:44px;background:${T.bgElevated};border-bottom:1px solid ${T.border}}
  .skel-table-row{height:56px;border-bottom:1px solid ${T.border}}
  .skel-table-row:last-child{border-bottom:none}
  .skel-filter{display:flex;gap:8px;margin-bottom:24px}
  .skel-chip{width:64px;height:28px;border-radius:9999px}
  .skel-title{width:120px;height:28px;border-radius:6px;margin-bottom:24px}
  @media(max-width:768px){.skel-grid{grid-template-columns:1fr}}

  /* HeroCardGrid + HeroCard */
  .hero-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;max-width:1200px;margin:0 auto;padding:32px 24px;padding-top:8px}
  .hero-card{display:flex;flex-direction:column;align-items:center;text-align:center;background:${T.bgSurface};border:1px solid ${T.border};border-radius:12px;padding:32px;cursor:pointer;text-decoration:none;color:inherit;box-shadow:none;transition:box-shadow 200ms ease,border-color 200ms ease,background 150ms ease}
  .hero-card:hover{border-color:${T.accent};box-shadow:${T.accentGlow};background:${T.bgElevated}}
  .hero-card:active{transform:scale(0.98);transition:transform 80ms ease}
  .hero-icon-wrap{display:flex;align-items:center;justify-content:center;width:72px;height:72px;border-radius:50%;background:${T.accentSoft};color:${T.accent};margin-bottom:24px;transition:background 200ms ease}
  .hero-card:hover .hero-icon-wrap{background:${T.accent22}}
  .hero-icon-svg{width:32px;height:32px;display:block}
  .hero-title{display:block;font-size:18px;font-weight:600;color:${T.textPrimary};line-height:1.25;margin-bottom:8px}
  .hero-desc{display:block;font-size:14px;font-weight:500;color:${T.textSecondary};line-height:1.5}

  /* HackathonListPage */
  .hack-page{max-width:1200px;margin:0 auto;padding:32px 24px;padding-top:8px}
  .hack-page-title{font-size:24px;font-weight:700;color:${T.textPrimary};line-height:1.25;margin-bottom:24px}
  .hack-result-count{font-size:13px;font-weight:500;color:${T.textMuted};margin-bottom:12px}
  .hack-result-count strong{font-weight:600;color:${T.textSecondary}}
  .hack-list{list-style:none;display:flex;flex-direction:column;gap:16px}

  /* ═══ Back button ═══ */
  .back-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;font-size:13px;font-weight:500;font-family:inherit;color:${T.textSecondary};background:transparent;border:1px solid ${T.border};border-radius:8px;cursor:pointer;white-space:nowrap;transition:all 150ms ease;margin-bottom:4px}
  .back-btn:hover{border-color:${T.accent};color:${T.textPrimary};background:${T.bgElevated}}
  .back-btn-arrow{font-size:14px;line-height:1}

  /* ═══ FilterBar System ═══ */
  .filter-bar{display:flex;flex-direction:column;gap:0;margin-bottom:24px}
  .filter-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .filter-status-group{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap}

  /* Status chips — always visible */
  .status-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;font-size:12px;font-weight:500;border-radius:9999px;border:1px solid ${T.border};color:${T.textSecondary};background:transparent;cursor:pointer;white-space:nowrap;font-family:inherit;transition:all 150ms ease}
  .status-chip:hover{border-color:${T.accent};color:${T.textPrimary}}
  .status-chip-active{background:${T.accentSoft}!important;border-color:${T.accent}!important;color:${T.accent}!important}
  .status-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
  .status-dot--ongoing{background:${T.statusOngoing}}
  .status-dot--upcoming{background:${T.statusUpcoming}}
  .status-dot--ended{background:${T.statusEnded}}
  .status-dot--all{background:${T.accent}}

  /* Tag trigger button */
  .tag-trigger{display:inline-flex;align-items:center;gap:6px;padding:4px 14px;font-size:12px;font-weight:500;font-family:inherit;border-radius:9999px;border:1px solid ${T.border};color:${T.textSecondary};background:transparent;cursor:pointer;white-space:nowrap;transition:all 150ms ease}
  .tag-trigger:hover{border-color:${T.accent};color:${T.textPrimary}}
  .tag-trigger--has{background:${T.accentSoft};border-color:${T.accent};color:${T.accent}}
  .tag-trigger-icon{font-size:13px;line-height:1}
  .tag-trigger-arrow{display:inline-block;font-size:10px;transition:transform 200ms ease;color:${T.textMuted};line-height:1}
  .tag-trigger-arrow--open{transform:rotate(180deg)}
  .tag-trigger--has .tag-trigger-arrow{color:${T.accent}}
  .tag-badge{font-size:11px;font-weight:600;color:${T.accent};background:${T.accent10};padding:1px 6px;border-radius:9999px;line-height:1.4}

  /* Tag Drawer */
  .tag-drawer-wrapper{overflow:hidden;transition:max-height 250ms ease,opacity 200ms ease;max-height:0;opacity:0}
  .tag-drawer-wrapper--open{max-height:500px;opacity:1}
  .tag-drawer{margin-top:12px;border:1px solid ${T.border};border-radius:12px;background:${T.bgSurface};overflow:hidden}
  .tag-drawer-body{max-height:min(360px,50vh);overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:20px;scrollbar-width:thin;scrollbar-color:${T.border} transparent}
  .tag-drawer-body::-webkit-scrollbar{width:4px}
  .tag-drawer-body::-webkit-scrollbar-track{background:transparent}
  .tag-drawer-body::-webkit-scrollbar-thumb{background:${T.border};border-radius:2px}

  /* Tag search */
  .tag-search-wrap{position:relative;flex-shrink:0}
  .tag-search{width:100%;padding:10px 14px 10px 36px;font-size:13px;font-family:inherit;background:${T.bgElevated};color:${T.textPrimary};border:1px solid ${T.border};border-radius:8px;outline:none;transition:border-color 150ms ease}
  .tag-search::placeholder{color:${T.textMuted}}
  .tag-search:focus{border-color:${T.accent}}
  .tag-search-icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:${T.textMuted};font-size:14px;pointer-events:none;line-height:1}
  .tag-search-clear{position:absolute;right:10px;top:50%;transform:translateY(-50%);display:flex;align-items:center;justify-content:center;width:18px;height:18px;background:none;border:none;color:${T.textMuted};cursor:pointer;font-size:14px;line-height:1;border-radius:50%;transition:all 150ms ease;padding:0}
  .tag-search-clear:hover{color:${T.textPrimary};background:${T.bgElevated}}

  /* Tag groups */
  .tag-group-section{display:flex;flex-direction:column;gap:10px}
  .tag-group-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:${T.textMuted}}
  .tag-group-chips{display:flex;flex-wrap:wrap;gap:8px}
  .tag-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 12px;font-size:12px;font-weight:500;font-family:inherit;border-radius:9999px;border:1px solid ${T.border};color:${T.textSecondary};background:transparent;cursor:pointer;white-space:nowrap;transition:all 150ms ease}
  .tag-chip:hover{border-color:${T.accent};color:${T.textPrimary}}
  .tag-chip--selected{background:${T.accentSoft};border-color:${T.accent};color:${T.accent}}
  .tag-chip-check{font-size:10px;line-height:1}
  .tag-no-results{font-size:13px;color:${T.textMuted};text-align:center;padding:12px 0}

  /* Drawer actions */
  .drawer-actions{display:flex;align-items:center;gap:10px;padding:12px 20px;border-top:1px solid ${T.border};background:${T.bgSurface}}
  .drawer-result-count{font-size:12px;font-weight:500;color:${T.textMuted};margin-right:auto}
  .drawer-reset{display:inline-flex;align-items:center;padding:8px 16px;font-size:12px;font-weight:500;font-family:inherit;color:${T.textSecondary};background:transparent;border:1px solid ${T.border};border-radius:8px;cursor:pointer;transition:all 150ms ease}
  .drawer-reset:hover{border-color:${T.accent};color:${T.textPrimary}}
  .drawer-reset:disabled{opacity:0.3;cursor:not-allowed}
  .drawer-close{display:inline-flex;align-items:center;padding:8px 16px;font-size:12px;font-weight:500;font-family:inherit;color:${T.textSecondary};background:transparent;border:1px solid ${T.border};border-radius:8px;cursor:pointer;transition:all 150ms ease}
  .drawer-close:hover{border-color:${T.accent};color:${T.textPrimary}}

  /* Active filter summary bar */
  .filter-summary{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-top:12px;animation:fadeSlideIn 200ms ease}
  @keyframes fadeSlideIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
  .summary-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font-size:11px;font-weight:500;border-radius:9999px;background:${T.accentSoft};border:1px solid ${T.accent20};color:${T.accent};line-height:1.4;white-space:nowrap}
  .summary-chip-remove{display:inline-flex;align-items:center;justify-content:center;background:none;border:none;color:${T.accent};cursor:pointer;font-size:12px;padding:0;margin-left:2px;opacity:0.6;transition:opacity 150ms ease;line-height:1}
  .summary-chip-remove:hover{opacity:1}
  .summary-clear-all{display:inline-flex;align-items:center;padding:3px 10px;font-size:11px;font-weight:500;font-family:inherit;color:${T.textMuted};background:transparent;border:none;cursor:pointer;white-space:nowrap;transition:color 150ms ease}
  .summary-clear-all:hover{color:${T.error}}

  /* HackathonCard */
  .hcard{display:flex;flex-direction:row;align-items:stretch;background:${T.bgSurface};border:1px solid ${T.border};border-radius:12px;overflow:hidden;text-decoration:none;color:inherit;cursor:pointer;transition:border-color 200ms ease,background 150ms ease}
  .hcard:hover{border-color:${T.accent};background:${T.bgElevated}}
  .hcard:active{transform:scale(0.99);transition:transform 80ms ease}
  .hcard-thumb{flex-shrink:0;width:200px;overflow:hidden;background:${T.bgElevated}}
  .hcard-thumb img{width:100%;height:100%;object-fit:cover;display:block;filter:saturate(.85);transition:filter 200ms ease}
  .hcard:hover .hcard-thumb img{filter:saturate(1)}
  .hcard-content{flex:1;display:flex;flex-direction:column;gap:12px;padding:24px;min-width:0}
  .hcard-title-row{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap}
  .hcard-title{font-size:18px;font-weight:600;color:${T.textPrimary};line-height:1.25;word-break:break-word}
  .hcard-tag-row{display:flex;flex-wrap:wrap;gap:8px}
  .hcard-tag{display:inline-flex;align-items:center;padding:4px 12px;font-size:12px;font-weight:500;border-radius:9999px;border:1px solid ${T.border};color:${T.textSecondary};background:transparent;line-height:1}
  .hcard-meta{display:flex;flex-wrap:wrap;gap:16px;margin-top:auto}
  .hcard-meta-item{display:flex;align-items:baseline;gap:4px}
  .hcard-meta-label{font-size:14px;font-weight:500;color:${T.textMuted};white-space:nowrap}
  .hcard-meta-label::after{content:":"}
  .hcard-meta-value{font-size:14px;font-weight:500;color:${T.textSecondary};white-space:nowrap}

  /* StatusBadge */
  .badge{display:inline-flex;align-items:center;padding:4px 12px;font-size:12px;font-weight:600;border-radius:9999px;line-height:1;white-space:nowrap}
  .badge-ongoing{background:rgba(52,211,153,.15);color:${T.statusOngoing}}
  .badge-upcoming{background:rgba(96,165,250,.15);color:${T.statusUpcoming}}
  .badge-ended{background:rgba(107,114,128,.15);color:${T.statusEnded}}

  /* D-day urgency badge */
  .dday{display:inline-flex;align-items:center;padding:3px 8px;font-size:11px;font-weight:600;font-family:${T.mono};border-radius:6px;line-height:1;white-space:nowrap;letter-spacing:0.02em}
  .dday--urgent{background:rgba(239,68,68,0.15);color:${T.error};animation:ddayPulse 2s ease infinite}
  .dday--soon{background:rgba(234,179,8,0.12);color:${T.warningText}}
  .dday--normal{background:rgba(139,149,168,0.1);color:${T.textSecondary}}
  .dday--ended{background:rgba(107,114,128,0.1);color:${T.statusEnded}}
  @keyframes ddayPulse{0%,100%{opacity:1}50%{opacity:0.7}}

  /* Page placeholder */
  .page-placeholder{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:calc(100vh - 64px);gap:12px;opacity:.6}
  .page-placeholder h2{font-size:20px;font-weight:600;color:${T.textPrimary}}
  .page-placeholder p{font-size:14px;color:${T.textSecondary}}

  /* ═══════════════════════════════════════════════════
     HackathonDetailPage
     ═══════════════════════════════════════════════════ */

  /* SectionNav */
  .section-nav{position:sticky;top:64px;background:${T.bgSurface};border-bottom:1px solid ${T.border};height:48px;display:flex;align-items:center;gap:4px;padding:0 24px;overflow-x:auto;z-index:90;scrollbar-width:none;-ms-overflow-style:none}
  .section-nav::-webkit-scrollbar{display:none}
  .section-tab{display:inline-flex;align-items:center;flex-shrink:0;padding:12px 16px;height:100%;font-size:14px;font-weight:500;color:${T.textSecondary};white-space:nowrap;border-bottom:2px solid transparent;background:none;border-top:none;border-left:none;border-right:none;cursor:pointer;font-family:inherit;transition:color 150ms ease,border-color 150ms ease}
  .section-tab:hover{color:${T.textPrimary}}
  .section-tab-active{color:${T.accent}!important;border-bottom-color:${T.accent}!important;box-shadow:0 2px 8px ${T.accent20}}
  .section-tab-active:hover{color:${T.accent}!important}

  /* Detail page layout */
  .detail-page{min-height:100vh;background:${T.bgRoot}}
  .detail-content{max-width:1200px;margin:0 auto;padding:0 24px;padding-top:calc(48px + 8px);padding-bottom:64px}
  .detail-header{margin-bottom:32px}
  .detail-page-title{font-size:24px;font-weight:700;color:${T.textPrimary};line-height:1.25}

  /* Shared section styles */
  .d-section{padding:40px 0;border-bottom:1px solid ${T.border};scroll-margin-top:112px}
  .d-section:last-child{border-bottom:none}
  .d-section-title{font-size:20px;font-weight:600;color:${T.textPrimary};line-height:1.25;margin-bottom:24px}
  .d-block{margin-bottom:32px}
  .d-block:last-child{margin-bottom:0}
  .d-block-title{font-size:14px;font-weight:600;color:${T.textSecondary};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px}

  /* OverviewSection */
  .overview-summary{font-size:16px;font-weight:400;color:${T.textPrimary};line-height:1.75;max-width:72ch}
  .policy-row{display:flex;flex-wrap:wrap;gap:12px}
  .policy-badge{display:inline-flex;align-items:center;padding:8px 16px;font-size:14px;font-weight:500;color:${T.accent};background:${T.accentSoft};border-radius:9999px;border:1px solid ${T.accent25};line-height:1}
  .notice-list{display:flex;flex-direction:column;gap:12px;list-style:none}
  .notice-item{display:flex;align-items:flex-start;gap:12px;background:${T.bgSurface};border:1px solid ${T.border};border-left:3px solid ${T.accent40};border-radius:6px;padding:16px}
  .notice-icon-wrap{flex-shrink:0;display:flex;align-items:center;justify-content:center;color:${T.accent};margin-top:1px}
  .notice-icon{width:16px;height:16px;display:block}
  .notice-text{font-size:14px;font-weight:400;color:${T.textPrimary};line-height:1.5;margin:0}
  .link-row{display:flex;flex-wrap:wrap;gap:12px}
  .link-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 24px;background:transparent;color:${T.textPrimary};font-size:14px;font-weight:500;border:1px solid ${T.border};border-radius:8px;text-decoration:none;cursor:pointer;white-space:nowrap;font-family:inherit;transition:border-color 200ms ease,background 150ms ease}
  .link-button:hover{border-color:${T.accent};background:${T.accentSoft}}
  .link-icon-svg{width:14px;height:14px;display:block;flex-shrink:0}

  /* EvalSection */
  .metric-block{margin-bottom:24px}
  .metric-name{font-size:18px;font-weight:600;color:${T.textPrimary};line-height:1.25;margin-bottom:12px}
  .eval-description{font-size:16px;font-weight:400;color:${T.textPrimary};line-height:1.75;max-width:72ch;margin:0}
  .info-card{background:${T.bgSurface};border:1px solid ${T.border};border-radius:12px;padding:24px;display:flex;flex-direction:column}
  .info-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0}
  .info-row+.info-row{border-top:1px solid ${T.border}}
  .info-label{font-size:14px;font-weight:500;color:${T.textSecondary}}
  .info-value{display:inline-flex;align-items:baseline;gap:4px}
  .info-unit{font-size:14px;font-weight:400;color:${T.textSecondary}}
  .mono{font-family:${T.mono};font-size:14px;font-weight:500;color:${T.textPrimary}}
  .vote-block{display:flex;flex-direction:column;gap:16px}
  .score-label{font-size:16px;font-weight:400;color:${T.textSecondary};line-height:1.5;margin:0}
  .eval-table-wrap{overflow-x:auto;max-width:480px;border:1px solid ${T.border};border-radius:8px;background:${T.bgSurface}}
  .eval-table{width:100%;border-collapse:collapse}
  .eval-th{padding:12px 16px;font-size:12px;font-weight:600;color:${T.textSecondary};text-align:left;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid ${T.border};background:${T.bgElevated}}
  .eval-td{padding:16px;font-size:14px;color:${T.textPrimary};border-bottom:1px solid ${T.border};vertical-align:middle}
  .eval-table tbody tr:last-child .eval-td{border-bottom:none}
  .weight-unit{font-size:14px;font-weight:400;color:${T.textSecondary};margin-left:1px}

  /* PrizeSection */
  .prize-placeholder{font-size:16px;font-weight:400;color:${T.textMuted};text-align:center;padding:40px 0;margin:0}
  .tier-row{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end}
  .tier-card{background:${T.bgSurface};border:1px solid ${T.border};border-radius:12px;padding:24px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;flex:1;min-width:140px;max-width:220px}
  .tier-card--gold{border-top:2px solid ${T.rankGold}}
  .tier-card--silver{border-top:2px solid ${T.rankSilver}}
  .tier-card--bronze{border-top:2px solid ${T.rankBronze}}
  .medal-wrap{display:flex;align-items:center;justify-content:center;width:40px;height:40px}
  .medal-icon{width:32px;height:32px;display:block}
  .medal-gold{color:${T.rankGold}} .medal-silver{color:${T.rankSilver}} .medal-bronze{color:${T.rankBronze}}
  .place-label{font-size:18px;font-weight:600;color:${T.textPrimary};line-height:1.25}
  .amount{display:inline-flex;align-items:baseline;gap:2px;margin-top:4px}
  .amount-value{font-family:${T.mono};font-size:16px;font-weight:500;color:${T.textPrimary}}
  .amount-unit{font-size:14px;font-weight:400;color:${T.textSecondary}}

  /* ScheduleSection */
  .timezone-label{font-size:12px;font-weight:500;color:${T.textMuted};margin-bottom:24px;margin-top:0}
  .timeline{position:relative;padding-left:32px;list-style:none}
  .timeline::before{content:"";position:absolute;left:11px;top:0;bottom:0;width:2px;background:${T.border}}
  .milestone{position:relative;padding-bottom:24px}
  .milestone:last-child{padding-bottom:0}
  .dot{position:absolute;left:-26px;top:4px;width:12px;height:12px;border-radius:50%;border:2px solid ${T.border};background:${T.bgRoot};transition:background 200ms ease,border-color 200ms ease}
  .dot-past{background:${T.accent};border-color:${T.accent}}
  .milestone-content{display:flex;flex-direction:column;gap:4px}
  .milestone-name{font-size:16px;font-weight:600;color:${T.textPrimary};line-height:1.25}
  .milestone-name-past{color:${T.textSecondary}}
  .milestone-date{font-size:14px;font-weight:500;color:${T.textMuted};line-height:1.5;font-variant-numeric:tabular-nums}

  /* TeamsSectionLink */
  .teams-card{background:${T.bgSurface};border:1px solid ${T.border};border-radius:12px;padding:24px;display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap}
  .teams-card-disabled{opacity:0.7}
  .teams-card-text{font-size:16px;font-weight:400;color:${T.textPrimary};line-height:1.5;margin:0}
  .team-count-highlight{font-weight:600;color:${T.accent}}
  .teams-card-muted{font-size:16px;font-weight:400;color:${T.textMuted};line-height:1.5;margin:0}
  .cta-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 24px;background:${T.accent};color:${T.textOnAccent};font-size:14px;font-weight:600;border:none;border-radius:8px;text-decoration:none;white-space:nowrap;cursor:pointer;font-family:inherit;flex-shrink:0;box-shadow:none;transition:box-shadow 200ms ease,opacity 150ms ease}
  .cta-button:hover,.cta-button:focus-visible{box-shadow:${T.accentGlow}}
  .cta-button:active{opacity:.85}

  /* SubmitSection */
  .d-block-title-row{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:${T.textSecondary};text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px}
  .guide-list{display:flex;flex-direction:column;gap:12px;list-style:none}
  .guide-item{display:flex;align-items:flex-start;gap:12px}
  .guide-number{flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;background:${T.accentSoft};color:${T.accent};border-radius:50%;font-size:12px;font-weight:600;line-height:1;margin-top:1px}
  .guide-text{font-size:14px;font-weight:400;color:${T.textPrimary};line-height:1.5}
  .format-line{display:flex;align-items:center;gap:8px;font-size:14px;margin:0}
  .format-label{font-weight:500;color:${T.textMuted}}
  .format-label::after{content:":"}
  .format-value{font-weight:500;color:${T.textSecondary};text-transform:uppercase;letter-spacing:0.03em}
  .submit-count-badge{font-size:12px;font-weight:600;color:${T.accent};background:${T.accentSoft};padding:2px 8px;border-radius:9999px;text-transform:none;letter-spacing:0}
  .submission-list{display:flex;flex-direction:column;gap:12px;list-style:none}

  /* ═══ SubmitForm — §5-5 inputs, §5-2 buttons, §4 glow ═══ */
  .sf-form{display:flex;flex-direction:column;gap:20px}
  .sf-field-group{display:flex;flex-direction:column;gap:0}
  .sf-label{display:block;font-size:14px;font-weight:500;color:${T.textSecondary};margin-bottom:8px}
  .sf-required{color:${T.error};margin-left:2px;font-weight:600}
  .sf-optional{color:${T.textMuted};font-weight:400;font-size:12px;margin-left:4px}
  .sf-input{width:100%;padding:12px 16px;background:${T.bgElevated};color:${T.textPrimary};font-size:16px;font-family:inherit;border:1px solid ${T.border};border-radius:8px;transition:border-color 150ms ease;resize:none;outline:none}
  .sf-input::placeholder{color:${T.textMuted}}
  .sf-input:focus{border-color:${T.accent}}
  .sf-input[aria-invalid="true"]{border-color:${T.error}}
  .sf-input:disabled{opacity:0.5;cursor:not-allowed}
  .sf-textarea{min-height:80px;resize:vertical;line-height:1.5}
  .sf-field-error{font-size:12px;color:${T.error};margin-top:4px;line-height:1.5}
  .sf-hidden-input{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
  .sf-file-button{display:inline-flex;align-items:center;justify-content:flex-start;gap:8px;width:100%;padding:12px 16px;background:transparent;color:${T.textPrimary};font-size:14px;font-weight:500;font-family:inherit;border:1px solid ${T.border};border-radius:8px;cursor:pointer;text-align:left;transition:border-color 200ms ease,background 150ms ease}
  .sf-file-button:hover:not(:disabled){border-color:${T.accent};background:${T.accentSoft}}
  .sf-file-button:disabled{opacity:0.5;cursor:not-allowed}
  .sf-actions{display:flex;justify-content:flex-end;padding-top:8px}
  .sf-submit-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 24px;background:${T.accent};color:${T.textOnAccent};font-size:14px;font-weight:600;font-family:inherit;border:none;border-radius:8px;cursor:pointer;white-space:nowrap;box-shadow:none;transition:box-shadow 200ms ease,opacity 150ms ease}
  .sf-submit-btn:hover:not(:disabled),.sf-submit-btn:focus-visible:not(:disabled){box-shadow:${T.accentGlow}}
  .sf-submit-btn:active:not(:disabled){opacity:0.85}
  .sf-submit-btn:disabled{opacity:0.4;cursor:not-allowed;box-shadow:none}

  /* ═══ SubmissionCard — §5-1 static card ═══ */
  .sc-card{background:${T.bgSurface};border:1px solid ${T.border};border-radius:8px;padding:16px;display:flex;flex-direction:column;gap:8px}
  .sc-header{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .sc-team{font-size:16px;font-weight:600;color:${T.textPrimary};line-height:1.25}
  .sc-timestamp{font-size:12px;font-weight:500;color:${T.textMuted};white-space:nowrap;font-variant-numeric:tabular-nums}
  .sc-meta{display:flex;align-items:center;gap:16px}
  .sc-meta-item{font-size:12px;font-weight:500;color:${T.textMuted}}
  .sc-meta-value{font-weight:600;color:${T.textSecondary}}
  .sc-notes{font-size:14px;font-weight:400;color:${T.textSecondary};line-height:1.5;margin:0;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}

  /* ═══ LeaderboardSection — §5-6 table ═══ */
  .lb-header-row{display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:24px}
  .lb-updated{font-size:12px;font-weight:500;color:${T.textMuted};white-space:nowrap;font-variant-numeric:tabular-nums}
  .lb-empty-wrap{display:flex;flex-direction:column;gap:16px}
  .lb-empty-text{font-size:16px;font-weight:400;color:${T.textMuted};margin:0;padding:32px 0;text-align:center}
  .lb-table-wrap{overflow-x:auto;border:1px solid ${T.border};border-radius:12px;background:${T.bgSurface};scrollbar-width:thin;scrollbar-color:${T.border} transparent}
  .lb-table-wrap::-webkit-scrollbar{height:6px}
  .lb-table-wrap::-webkit-scrollbar-track{background:transparent}
  .lb-table-wrap::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}
  .lb-table{width:100%;border-collapse:collapse;min-width:560px}
  .lb-th{padding:12px 16px;font-size:12px;font-weight:600;color:${T.textSecondary};text-align:left;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid ${T.border};background:${T.bgElevated};white-space:nowrap}
  .lb-th:first-child{border-top-left-radius:11px}
  .lb-th:last-child{border-top-right-radius:11px}

  /* LeaderboardRow */
  .lb-row{transition:background 150ms ease}
  .lb-row:hover{background:${T.bgElevated}}
  .lb-row--gold td:first-child{border-left:3px solid ${T.rankGold}}
  .lb-row--silver td:first-child{border-left:3px solid ${T.rankSilver}}
  .lb-row--bronze td:first-child{border-left:3px solid ${T.rankBronze}}
  .lb-td{padding:16px;font-size:14px;color:${T.textPrimary};border-bottom:1px solid ${T.border};vertical-align:middle}
  .lb-table tbody tr:last-child .lb-td{border-bottom:none}
  .lb-rank{font-size:14px;font-weight:600;color:${T.textSecondary};font-variant-numeric:tabular-nums}
  .lb-team{font-size:14px;font-weight:500;color:${T.textPrimary}}
  .lb-score{font-family:${T.mono};font-size:14px;font-weight:500;color:${T.textPrimary};font-variant-numeric:tabular-nums}
  .lb-timestamp{font-size:12px;font-weight:500;color:${T.textMuted};white-space:nowrap;font-variant-numeric:tabular-nums}
  .lb-artifact-links{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .lb-artifact-link{display:inline-flex;align-items:center;padding:4px 8px;font-size:12px;font-weight:500;color:${T.accent};background:${T.accentSoft};border-radius:4px;text-decoration:none;white-space:nowrap;transition:background 150ms ease}
  .lb-artifact-link:hover{background:${T.accent25}}
  .lb-no-artifact{color:${T.textMuted};font-size:14px}

  /* ═══ CampPage ═══ */
  .camp-page{max-width:1200px;margin:0 auto;padding:32px 24px;padding-top:8px}
  .camp-team-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:16px}

  /* CampHeader */
  .camp-header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:24px}
  .camp-title{font-size:24px;font-weight:700;color:${T.textPrimary};line-height:1.25;margin:0}
  .camp-create-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 24px;background:${T.accent};color:${T.textOnAccent};font-size:14px;font-weight:600;font-family:inherit;border:none;border-radius:8px;cursor:pointer;white-space:nowrap;flex-shrink:0;box-shadow:none;transition:box-shadow 200ms ease,opacity 150ms ease}
  .camp-create-btn:hover,.camp-create-btn:focus-visible{box-shadow:${T.accentGlow}}
  .camp-create-btn:active{opacity:.85}

  /* CampFilterBar */
  .camp-filter{display:flex;flex-direction:column;gap:0;margin-bottom:24px}
  .camp-filter-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
  .camp-status-group{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap}
  .camp-chip{display:inline-flex;align-items:center;padding:4px 12px;font-size:12px;font-weight:500;border-radius:9999px;border:1px solid ${T.border};color:${T.textSecondary};background:transparent;cursor:pointer;white-space:nowrap;font-family:inherit;transition:all 150ms ease}
  .camp-chip:hover{border-color:${T.accent};color:${T.textPrimary}}
  .camp-chip-active{background:${T.accentSoft}!important;border-color:${T.accent}!important;color:${T.accent}!important}

  /* Hackathon drawer trigger */
  .camp-hack-trigger{display:inline-flex;align-items:center;gap:6px;padding:4px 14px;font-size:12px;font-weight:500;font-family:inherit;border-radius:9999px;border:1px solid ${T.border};color:${T.textSecondary};background:transparent;cursor:pointer;white-space:nowrap;transition:all 150ms ease}
  .camp-hack-trigger:hover{border-color:${T.accent};color:${T.textPrimary}}
  .camp-hack-trigger--has{background:${T.accentSoft};border-color:${T.accent};color:${T.accent}}
  .camp-hack-arrow{display:inline-block;font-size:10px;transition:transform 200ms ease;color:${T.textMuted};line-height:1}
  .camp-hack-arrow--open{transform:rotate(180deg)}
  .camp-hack-trigger--has .camp-hack-arrow{color:${T.accent}}

  /* Hackathon drawer */
  .camp-hack-drawer-wrap{overflow:hidden;transition:max-height 250ms ease,opacity 200ms ease;max-height:0;opacity:0}
  .camp-hack-drawer-wrap--open{max-height:300px;opacity:1}
  .camp-hack-drawer{margin-top:12px;border:1px solid ${T.border};border-radius:12px;background:${T.bgSurface};overflow:hidden}
  .camp-hack-drawer-body{padding:16px 20px;display:flex;flex-wrap:wrap;gap:8px;max-height:200px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:${T.border} transparent}
  .camp-hack-drawer-body::-webkit-scrollbar{width:4px}
  .camp-hack-drawer-body::-webkit-scrollbar-thumb{background:${T.border};border-radius:2px}
  .camp-hack-drawer-footer{display:flex;align-items:center;gap:10px;padding:10px 20px;border-top:1px solid ${T.border}}
  .camp-hack-count{font-size:12px;font-weight:500;color:${T.textMuted};margin-right:auto}
  .camp-hack-close{display:inline-flex;align-items:center;padding:6px 14px;font-size:12px;font-weight:500;font-family:inherit;color:${T.textSecondary};background:transparent;border:1px solid ${T.border};border-radius:8px;cursor:pointer;transition:all 150ms ease}
  .camp-hack-close:hover{border-color:${T.accent};color:${T.textPrimary}}

  /* OpenBadge */
  .ob-badge{display:inline-flex;align-items:center;padding:4px 12px;font-size:12px;font-weight:600;border-radius:9999px;line-height:1;white-space:nowrap}
  .ob-open{background:rgba(52,211,153,.15);color:${T.statusOngoing}}
  .ob-closed{background:rgba(107,114,128,.15);color:${T.statusEnded}}

  /* TeamCard */
  .tc-card{background:${T.bgSurface};border:1px solid ${T.border};border-radius:8px;padding:20px;display:flex;flex-direction:column;gap:12px;transition:border-color 200ms ease,background 150ms ease}
  .tc-card:hover{border-color:${T.accent};background:${T.bgElevated}}
  .tc-card:active{transform:scale(0.995);transition:transform 80ms ease}
  .tc-title-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
  .tc-name{font-size:18px;font-weight:600;color:${T.textPrimary};line-height:1.25;word-break:break-word}
  .tc-intro{font-size:14px;font-weight:400;color:${T.textSecondary};line-height:1.5;margin:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical}
  .tc-tag-row{display:flex;flex-wrap:wrap;gap:8px}
  .tc-pos-chip{display:inline-flex;align-items:center;padding:4px 12px;font-size:12px;font-weight:500;border-radius:9999px;border:1px solid ${T.border};color:${T.textSecondary};background:transparent;line-height:1}
  .tc-meta-row{display:flex;align-items:center;gap:8px}
  .tc-meta-item{font-size:12px;font-weight:500;color:${T.textMuted};white-space:nowrap}
  .tc-meta-value{font-weight:600;color:${T.textSecondary}}
  .tc-meta-divider{color:${T.textMuted};font-size:12px}
  .tc-action-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:4px}
  .tc-contact{display:inline-flex;align-items:center;padding:8px 16px;font-size:12px;font-weight:500;color:${T.textPrimary};background:transparent;border:1px solid ${T.border};border-radius:8px;text-decoration:none;white-space:nowrap;transition:border-color 200ms ease,background 150ms ease}
  .tc-contact:hover{border-color:${T.accent};background:${T.accentSoft}}
  .tc-owner{display:flex;align-items:center;gap:8px}
  .tc-toggle,.tc-edit{display:inline-flex;align-items:center;padding:4px 12px;font-size:12px;font-weight:500;font-family:inherit;color:${T.textSecondary};background:transparent;border:1px solid ${T.border};border-radius:4px;cursor:pointer;white-space:nowrap;transition:border-color 200ms ease,color 150ms ease}
  .tc-toggle--close:hover{border-color:${T.textMuted};color:${T.textPrimary}}
  .tc-toggle--reopen:hover{border-color:${T.error};color:${T.error}}
  .tc-edit:hover{border-color:${T.accent};color:${T.accent}}
  .tc-delete{display:inline-flex;align-items:center;padding:4px 12px;font-size:12px;font-weight:500;font-family:inherit;color:${T.textSecondary};background:transparent;border:1px solid ${T.border};border-radius:4px;cursor:pointer;white-space:nowrap;transition:border-color 200ms ease,color 150ms ease}
  .tc-delete:hover{border-color:${T.error};color:${T.error}}

  /* TeamCreateForm */
  .tcf-wrapper{background:${T.bgSurface};border:1px solid ${T.border};border-radius:12px;padding:24px;margin-bottom:24px}
  .tcf-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}
  .tcf-title{font-size:18px;font-weight:600;color:${T.textPrimary};margin:0}
  .tcf-close{display:flex;align-items:center;justify-content:center;width:28px;height:28px;font-size:16px;color:${T.textMuted};background:transparent;border:none;border-radius:4px;cursor:pointer;font-family:inherit;transition:color 150ms ease,background 150ms ease}
  .tcf-close:hover{color:${T.textPrimary};background:${T.bgElevated}}
  .tcf-form{display:flex;flex-direction:column;gap:20px}
  .tcf-field{display:flex;flex-direction:column;gap:0}
  .tcf-label{display:block;font-size:14px;font-weight:500;color:${T.textSecondary};margin-bottom:8px}
  .tcf-req{color:${T.error};margin-left:2px}
  .tcf-input{width:100%;padding:12px 16px;background:${T.bgElevated};color:${T.textPrimary};font-size:16px;font-family:inherit;border:1px solid ${T.border};border-radius:8px;transition:border-color 150ms ease;outline:none}
  .tcf-input::placeholder{color:${T.textMuted}}
  .tcf-input:focus{border-color:${T.accent}}
  .tcf-input[aria-invalid="true"]{border-color:${T.error}}
  .tcf-select{width:100%;padding:12px 16px;background:${T.bgElevated};color:${T.textPrimary};font-size:16px;font-family:inherit;border:1px solid ${T.border};border-radius:8px;appearance:none;cursor:pointer;transition:border-color 150ms ease;outline:none}
  .tcf-select:focus{border-color:${T.accent}}
  .tcf-select[aria-invalid="true"]{border-color:${T.error}}
  .tcf-textarea{min-height:100px;resize:vertical;line-height:1.5}
  .tcf-char-count{font-size:12px;color:${T.textMuted};text-align:right;margin-top:4px}
  .tcf-checkbox-label{display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:500;color:${T.textPrimary};cursor:pointer}
  .tcf-checkbox{width:16px;height:16px;accent-color:${T.accent};cursor:pointer}
  .tcf-tag-wrap{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 12px;background:${T.bgElevated};border:1px solid ${T.border};border-radius:8px;min-height:44px;transition:border-color 150ms ease}
  .tcf-tag-wrap:focus-within{border-color:${T.accent}}
  .tcf-tag-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;font-size:12px;font-weight:500;color:${T.accent};background:${T.accentSoft};border-radius:9999px;line-height:1.4}
  .tcf-tag-rm{display:inline-flex;align-items:center;justify-content:center;background:none;border:none;color:inherit;cursor:pointer;font-size:12px;line-height:1;padding:0;opacity:.7}
  .tcf-tag-rm:hover{opacity:1}
  .tcf-tag-input{flex:1;min-width:140px;background:transparent;border:none;color:${T.textPrimary};font-size:14px;font-family:inherit;outline:none;padding:2px 0}
  .tcf-tag-input::placeholder{color:${T.textMuted}}
  .tcf-error{font-size:12px;color:${T.error};margin-top:4px}

  /* Preset position chips */
  .tcf-presets{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
  .tcf-preset{display:inline-flex;align-items:center;padding:6px 14px;font-size:12px;font-weight:500;font-family:inherit;border-radius:9999px;border:1px solid ${T.border};color:${T.textSecondary};background:transparent;cursor:pointer;white-space:nowrap;transition:all 150ms ease}
  .tcf-preset:hover{border-color:${T.accent};color:${T.textPrimary}}
  .tcf-preset--selected{background:${T.accentSoft};border-color:${T.accent};color:${T.accent}}
  .tcf-preset--disabled{opacity:0.3;cursor:not-allowed;pointer-events:none}
  .tcf-custom-label{font-size:11px;font-weight:500;color:${T.textMuted};margin-bottom:6px}
  .tcf-custom-row{display:flex;gap:8px;align-items:center}
  .tcf-add-btn{display:inline-flex;align-items:center;justify-content:center;padding:12px 20px;font-size:14px;font-weight:600;font-family:inherit;color:${T.accent};background:${T.accentSoft};border:1px solid ${T.accent25};border-radius:8px;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:all 150ms ease}
  .tcf-add-btn:hover:not(:disabled){background:${T.accent25};border-color:${T.accent}}
  .tcf-add-btn:disabled{opacity:0.3;cursor:not-allowed}
  .tcf-actions{display:flex;justify-content:flex-end;gap:12px;padding-top:8px}
  .tcf-cancel-btn{display:inline-flex;align-items:center;padding:12px 24px;background:transparent;color:${T.textPrimary};font-size:14px;font-weight:500;font-family:inherit;border:1px solid ${T.border};border-radius:8px;cursor:pointer;transition:border-color 200ms ease,background 150ms ease}
  .tcf-cancel-btn:hover{border-color:${T.accent};background:${T.accentSoft}}
  .tcf-submit-btn{display:inline-flex;align-items:center;padding:12px 24px;background:${T.accent};color:${T.textOnAccent};font-size:14px;font-weight:600;font-family:inherit;border:none;border-radius:8px;cursor:pointer;box-shadow:none;transition:box-shadow 200ms ease,opacity 150ms ease}
  .tcf-submit-btn:hover,.tcf-submit-btn:focus-visible{box-shadow:${T.accentGlow}}
  .tcf-submit-btn:active{opacity:.85}

  /* ═══ Toast notification ═══ */
  @keyframes toastIn{from{transform:translate(-50%,20px);opacity:0}to{transform:translate(-50%,0);opacity:1}}
  @keyframes toastOut{from{transform:translate(-50%,0);opacity:1}to{transform:translate(-50%,-10px);opacity:0}}
  .toast{position:fixed;bottom:80px;left:50%;transform:translateX(-50%);padding:12px 24px;background:#065F46;color:#D1FAE5;font-size:14px;font-weight:500;border-radius:8px;z-index:300;box-shadow:0 4px 20px rgba(0,0,0,.4);animation:toastIn 200ms ease forwards;pointer-events:none}
  .toast--destructive{background:#7F1D1D;color:#FECACA}
  .toast--out{animation:toastOut 200ms ease forwards}

  /* ═══ RotatingBanner ═══ */
  .rot-banner{position:relative;margin-top:64px;height:90px;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;transition:background 500ms ease;cursor:grab;user-select:none}
  .rot-banner:active{cursor:grabbing}
  .rot-banner-inner{display:flex;align-items:center;gap:14px;transition:opacity 300ms ease,transform 300ms ease}
  .rot-banner-in{opacity:1;transform:translateX(0)}
  .rot-banner-out-left{opacity:0;transform:translateX(-40px)}
  .rot-banner-out-right{opacity:0;transform:translateX(40px)}
  .rot-banner-icon{width:44px;height:44px;flex-shrink:0;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.18))}
  .rot-banner-text{display:flex;flex-direction:column;gap:2px}
  .rot-banner-title{font-size:17px;font-weight:700;color:#fff;letter-spacing:0.01em;text-shadow:0 1px 3px rgba(0,0,0,0.2)}
  .rot-banner-sub{font-size:12px;font-weight:500;color:rgba(255,255,255,0.8)}
  .rot-banner-dots{display:flex;gap:6px;align-items:center;margin-top:8px}
  .rot-banner-dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.35);transition:all 300ms ease;cursor:pointer}
  .rot-banner-dot--active{background:#fff;width:18px;border-radius:3px}
  @media(max-width:768px){
    .rot-banner{height:76px}
    .rot-banner-icon{width:34px;height:34px}
    .rot-banner-title{font-size:14px}
    .rot-banner-sub{font-size:10px}
  }

  @media(max-width:768px){
    .navbar{padding:0 16px} .logo{font-size:16px}
    .banner{font-size:12px}
    .hero-grid{grid-template-columns:1fr;padding:24px 16px;padding-top:6px}
    .hero-card{padding:24px} .hero-icon-wrap{width:60px;height:60px;margin-bottom:4px} .hero-icon-svg{width:28px;height:28px}
    .hack-page{padding:24px 16px;padding-top:6px} .hack-list{gap:12px}
    .filter-bar{gap:0} .filter-row{flex-direction:column;align-items:flex-start;gap:10px} .filter-status-group{flex-wrap:wrap}
    .status-chip{min-height:36px;padding:6px 14px;font-size:13px} .tag-trigger{min-height:36px;padding:6px 14px;font-size:13px} .tag-chip{min-height:36px;padding:6px 14px;font-size:13px}
    .drawer-actions{flex-direction:row} .tag-drawer-body{padding:12px 16px;gap:16px}
    .hcard{flex-direction:column} .hcard-thumb{width:100%;height:160px} .hcard-content{padding:16px;gap:8px} .hcard-meta{gap:12px}
    .status-wrapper{min-height:240px;padding:40px 16px;gap:16px}

    /* Detail page responsive */
    .section-nav{padding:0 16px;gap:0}
    .section-tab{padding:12px 12px}
    .detail-content{padding:0 16px;padding-top:calc(48px + 6px);padding-bottom:40px}
    .detail-header{margin-bottom:24px}
    .d-section{padding:32px 0;scroll-margin-top:112px}
    .overview-summary{font-size:14px;max-width:100%}
    .link-row{flex-direction:column;align-items:flex-start}
    .link-button{width:100%;justify-content:center}
    .eval-description{max-width:100%;font-size:14px}
    .info-row{flex-direction:column;align-items:flex-start;gap:4px}
    .eval-table-wrap{max-width:100%}
    .tier-row{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
    .tier-card{max-width:100%;padding:20px}
    .milestone-name{font-size:14px}
    .teams-card{flex-direction:column;align-items:flex-start;gap:16px}
    .cta-button{width:100%;justify-content:center}
    .d-block{margin-bottom:24px}
    .lb-header-row{flex-direction:column;align-items:flex-start;gap:8px;margin-bottom:4px}
    .sf-actions{justify-content:stretch}
    .sf-submit-btn{width:100%;justify-content:center}

    /* Camp page responsive */
    .camp-page{padding:24px 16px;padding-top:6px}
    .camp-filter-row{flex-direction:column;align-items:flex-start;gap:10px}
    .camp-hack-drawer-body{padding:12px 16px}
    .camp-title{font-size:20px}
    .camp-create-btn{padding:8px 16px;font-size:12px}
    .camp-team-list{gap:12px}
    .tc-name{font-size:16px}
    .tcf-actions{flex-direction:column-reverse}
    .tcf-preset{padding:8px 14px;font-size:13px;min-height:36px}
    .tcf-cancel-btn,.tcf-submit-btn{width:100%;justify-content:center}
  }

  @media(max-width:360px){
    .tier-row{grid-template-columns:1fr}
  }

  /* ═══════════════════════════════════════════════════
     RankingsPage
     ═══════════════════════════════════════════════════ */

  /* Page container — §6 pattern */
  .rank-page{max-width:1200px;margin:0 auto;padding:32px 24px;padding-top:8px;padding-bottom:48px}
  .rank-header-row{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:24px}
  .rank-page-title{font-size:24px;font-weight:700;color:${T.textPrimary};line-height:1.25;margin:0}

  /* PeriodFilter — §5-4 chip pattern */
  .pf-group{display:inline-flex;align-items:center;gap:8px;flex-shrink:0}
  .pf-btn{display:inline-flex;align-items:center;padding:4px 12px;font-size:12px;font-weight:500;font-family:inherit;border-radius:9999px;border:1px solid ${T.border};color:${T.textSecondary};background:transparent;cursor:pointer;white-space:nowrap;transition:all 150ms ease}
  .pf-btn:hover{border-color:${T.accent};color:${T.textPrimary}}
  .pf-btn-active{background:${T.accentSoft}!important;border-color:${T.accent}!important;color:${T.accent}!important}

  /* RankingTable — §5-6 table */
  .rt-empty-wrap{border:1px solid ${T.border};border-radius:12px;background:${T.bgSurface};overflow:hidden}
  .rt-table-wrap{border:1px solid ${T.border};border-radius:12px;background:${T.bgSurface}}
  .rt-table{width:100%;border-collapse:collapse;table-layout:fixed}
  .rt-th{padding:10px 12px;font-size:12px;font-weight:600;color:${T.textSecondary};text-align:left;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid ${T.border};background:${T.bgElevated};white-space:nowrap}
  .rt-th:first-child{border-top-left-radius:11px}
  .rt-th:last-child{border-top-right-radius:11px}
  .rt-th-rank{width:56px}
  .rt-th-team{width:auto}
  .rt-th-points{width:90px;text-align:right}
  .rt-row{transition:background 150ms ease}
  .rt-row:hover{background:${T.bgElevated}}
  .rt-row--gold td:first-child{border-left:3px solid ${T.rankGold}}
  .rt-row--silver td:first-child{border-left:3px solid ${T.rankSilver}}
  .rt-row--bronze td:first-child{border-left:3px solid ${T.rankBronze}}
  .rt-td{padding:12px;font-size:14px;color:${T.textPrimary};border-bottom:1px solid ${T.border};vertical-align:middle}
  .rt-table tbody tr:last-child .rt-td{border-bottom:none}
  .rt-td-rank{width:56px}
  .rt-td-points{width:90px;text-align:right}
  .rt-rank-num{font-size:14px;font-weight:600;color:${T.textSecondary};font-variant-numeric:tabular-nums}
  .rt-team-name{font-size:14px;font-weight:500;color:${T.textPrimary};word-break:break-word}
  .rt-points{font-family:${T.mono};font-size:14px;font-weight:500;color:${T.textPrimary};font-variant-numeric:tabular-nums}
  .rt-expand-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:12px 0;font-size:13px;font-weight:500;font-family:inherit;color:${T.textSecondary};background:transparent;border:none;border-top:1px solid ${T.border};border-radius:0 0 12px 12px;cursor:pointer;transition:color 150ms ease,background 150ms ease}
  .rt-expand-btn:hover{color:${T.accent};background:${T.bgElevated}}
  .rt-expand-arrow{display:inline-block;font-size:12px;transition:transform 200ms ease}
  .rt-expand-arrow--up{transform:rotate(180deg)}

  @media(max-width:768px){
    .rank-page{padding:24px 16px;padding-top:6px}
    .rank-header-row{flex-direction:column;align-items:flex-start;gap:12px;margin-bottom:4px}
  }

  /* ═══ Theme Picker (★ 투톤 테마) ═══ */
  .theme-picker-trigger{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;font-size:12px;font-weight:500;font-family:inherit;border-radius:9999px;border:1px solid ${T.border};color:${T.textSecondary};background:transparent;cursor:pointer;white-space:nowrap;transition:all 150ms ease}
  .theme-picker-trigger:hover{border-color:${T.accent};color:${T.textPrimary}}
  .theme-swatch-mini{width:14px;height:14px;border-radius:50%;border:1px solid rgba(255,255,255,0.2);flex-shrink:0}
  .theme-panel{background:${T.bgSurface};border:1px solid ${T.border};border-radius:12px;padding:20px;margin-top:16px;animation:fadeSlideIn 200ms ease}
  .theme-panel-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
  .theme-panel-title{font-size:14px;font-weight:600;color:${T.textPrimary}}
  .theme-mode-toggle{display:inline-flex;align-items:center;gap:6px;padding:5px 14px;font-size:12px;font-weight:600;font-family:inherit;border-radius:9999px;border:1px solid ${T.border};color:${T.textSecondary};background:${T.bgElevated};cursor:pointer;transition:all 150ms ease}
  .theme-mode-toggle:hover{border-color:${T.accent};color:${T.textPrimary}}
  .theme-mode-icon{font-size:14px;line-height:1}
  .theme-presets{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:4px}
  .theme-preset-btn{display:flex;align-items:center;gap:8px;padding:8px 14px;font-size:12px;font-weight:500;font-family:inherit;border-radius:8px;border:1px solid ${T.border};color:${T.textSecondary};background:transparent;cursor:pointer;transition:all 150ms ease;white-space:nowrap}
  .theme-preset-btn:hover{border-color:${T.accent};color:${T.textPrimary};background:${T.bgElevated}}
  .theme-preset-btn--active{border-color:${T.accent};color:${T.accent};background:${T.accentSoft}}
  .theme-swatch-pair{display:flex;gap:2px}
  .theme-swatch{width:12px;height:12px;border-radius:3px;border:1px solid rgba(255,255,255,0.15)}
  .theme-custom-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
  .theme-color-input-wrap{display:flex;align-items:center;gap:6px}
  .theme-color-label{font-size:12px;font-weight:500;color:${T.textMuted}}
  .theme-color-input{width:36px;height:28px;border:1px solid ${T.border};border-radius:6px;background:transparent;cursor:pointer;padding:2px}
  .theme-apply-btn{display:inline-flex;align-items:center;padding:6px 16px;font-size:12px;font-weight:600;font-family:inherit;background:${T.accent};color:${T.textOnAccent};border:none;border-radius:6px;cursor:pointer;transition:box-shadow 200ms ease}
  .theme-apply-btn:hover{box-shadow:${T.accentGlow}}

  /* ═══ Icon Size Picker (★ 아이콘 크기) ═══ */
  .icon-size-bar{display:flex;align-items:center;gap:8px;padding:8px 12px;background:${T.bgSurface};border:1px solid ${T.border};border-radius:8px;margin-bottom:4px}
  .icon-size-label{font-size:12px;font-weight:500;color:${T.textMuted};white-space:nowrap;margin-right:4px}
  .icon-size-btn{display:inline-flex;align-items:center;justify-content:center;min-width:32px;padding:4px 10px;font-size:11px;font-weight:600;font-family:inherit;border-radius:6px;border:1px solid ${T.border};color:${T.textSecondary};background:transparent;cursor:pointer;transition:all 150ms ease}
  .icon-size-btn:hover{border-color:${T.accent};color:${T.textPrimary}}
  .icon-size-btn--active{background:${T.accentSoft};border-color:${T.accent};color:${T.accent}}
  .d-section-title-row{display:flex;align-items:center;gap:10px;margin-bottom:24px}
  .d-section-title-row .d-section-title{margin-bottom:0}
  .section-title-icon{color:${T.accent};flex-shrink:0;transition:width 150ms ease,height 150ms ease}

  /* ═══ View-size variants for HackathonList ═══ */

  /* --- S: compact rows --- */
  .hack-list--S{display:flex;flex-direction:column;gap:6px}
  .hack-list--S .hcard{flex-direction:row;align-items:center;border-radius:8px;padding:0;min-height:44px}
  .hack-list--S .hcard-thumb{display:none}
  .hack-list--S .hcard-content{padding:10px 16px;gap:6px;flex-direction:row;align-items:center;flex-wrap:wrap}
  .hack-list--S .hcard-title-row{gap:8px;flex-wrap:nowrap;align-items:center}
  .hack-list--S .hcard-title{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
  .hack-list--S .hcard-tag-row{display:none}
  .hack-list--S .hcard-meta{margin-top:0;gap:12px}
  .hack-list--S .hcard-meta-item{display:none}
  .hack-list--S .hcard-meta-item:first-child{display:flex}
  .hack-list--S .badge{font-size:10px;padding:2px 8px}
  .hack-list--S .dday{font-size:10px;padding:2px 6px}

  /* --- M: 2-col grid, vertical cards --- */
  .hack-list--M{display:grid;grid-template-columns:repeat(2,1fr);gap:20px}
  .hack-list--M .hcard{flex-direction:column}
  .hack-list--M .hcard-thumb{width:100%;height:180px}
  .hack-list--M .hcard-content{padding:20px}
  .hack-list--M .hcard-title{font-size:17px}

  /* --- L: 2-col grid, large vertical cards --- */
  .hack-list--L{display:grid;grid-template-columns:repeat(2,1fr);gap:24px}
  .hack-list--L .hcard{flex-direction:column;border-radius:16px}
  .hack-list--L .hcard-thumb{width:100%;height:260px}
  .hack-list--L .hcard-thumb img{filter:saturate(.9)}
  .hack-list--L .hcard-content{padding:24px;gap:14px}
  .hack-list--L .hcard-title{font-size:20px;font-weight:700}
  .hack-list--L .hcard-tag-row{gap:10px}
  .hack-list--L .hcard-tag{font-size:13px;padding:5px 14px}
  .hack-list--L .badge{font-size:13px;padding:5px 14px}
  .hack-list--L .dday{font-size:12px;padding:4px 10px}
  .hack-list--L .hcard-meta-label,.hack-list--L .hcard-meta-value{font-size:15px}

  @media(max-width:768px){
    .hack-list--M{grid-template-columns:1fr}
    .hack-list--L{grid-template-columns:1fr}
    .hack-list--S .hcard-title{max-width:160px}
  }
`; }

/* ── Icon SVGs ───────────────────────────────────────────────── */
function IconHackathon() {
  return (<svg className="hero-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="15" rx="2"/><polyline points="8 10 5 13 8 16"/><line x1="12" y1="13" x2="19" y2="13"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="18" x2="12" y2="21"/></svg>);
}
function IconCamp() {
  return (<svg className="hero-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="7" r="3"/><path d="M3 21v-2a5 5 0 015-5h2"/><circle cx="16" cy="7" r="3"/><path d="M21 21v-2a5 5 0 00-5-5h-2"/></svg>);
}
function IconRanking() {
  return (<svg className="hero-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 21h8"/><line x1="12" y1="17" x2="12" y2="21"/><path d="M6 3h12v8a6 6 0 01-12 0V3z"/><path d="M6 7H3a1 1 0 000 2c0 2 1.5 3 3 3"/><path d="M18 7h3a1 1 0 010 2c0 2-1.5 3-3 3"/></svg>);
}
function IconEmpty() {
  return (<svg className="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M2 12l2-7h16l2 7"/><rect x="2" y="12" width="20" height="7" rx="2"/><path d="M8 16h8"/></svg>);
}
function IconError() {
  return (<svg className="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>);
}
function IconInfo() {
  return (
    <svg className="notice-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="8.01" /><line x1="12" y1="12" x2="12" y2="16" />
    </svg>
  );
}
function IconExternal() {
  return (
    <svg className="link-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}
function MedalIcon({ variant }) {
  if (variant === "none") return null;
  const cls = variant === "gold" ? "medal-gold" : variant === "silver" ? "medal-silver" : "medal-bronze";
  return (
    <svg className={`medal-icon ${cls}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2l2.4 4.8L20 8l-4 3.9 1 5.6L12 15l-5 2.5 1-5.6L4 8l5.6-1.2z" />
    </svg>
  );
}

const ICON_MAP = { hackathon: <IconHackathon />, camp: <IconCamp />, ranking: <IconRanking /> };
const STATUS_LABEL = { ongoing: "진행중", upcoming: "예정", ended: "종료" };
const STATUS_TOGGLES = [
  { value: "all", label: "전체" },
  { value: "ongoing", label: "진행중" },
  { value: "upcoming", label: "예정" },
  { value: "ended", label: "종료" },
];

const MEDAL_BY_INDEX = ["gold", "silver", "bronze"];
function getMedal(i) { return MEDAL_BY_INDEX[i] || "none"; }

/* ═══════════════════════════════════════════════════════════════
   Shared Components
   ═══════════════════════════════════════════════════════════════ */

function BackButton({ onClick }) {
  return (
    <button type="button" className="back-btn" onClick={onClick} aria-label="뒤로 가기">
      <span className="back-btn-arrow">←</span>뒤로
    </button>
  );
}

function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}

function StatusView({ status, message, onRetry }) {
  return (
    <div className="status-wrapper" role={status === "error" ? "alert" : undefined} aria-live={status === "loading" ? "polite" : undefined}>
      {status === "loading" && <span className="spinner" role="status" aria-label="로딩 중" />}
      {status === "empty" && <span className="icon-wrap icon-wrap--empty"><IconEmpty /></span>}
      {status === "error" && <span className="icon-wrap icon-wrap--error"><IconError /></span>}
      <p className="status-msg">{message}</p>
      {status === "error" && onRetry && <button type="button" className="retry-btn" onClick={onRetry}>다시 시도</button>}
    </div>
  );
}

/* ── Skeleton Components ──────────────────────────────────── */
function HeroSkeleton() {
  return (
    <div className="skel-grid">
      {[0, 1, 2].map((i) => <div key={i} className="skel skel-hero" />)}
    </div>
  );
}

function CardListSkeleton({ count = 4 }) {
  return (
    <div className="skel-list">
      <div className="skel-filter">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skel skel-chip" />)}
      </div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skel skel-card" />
      ))}
    </div>
  );
}

function TableSkeleton({ rows = 5 }) {
  return (
    <div className="skel-table-wrap">
      <div className="skel-table-head" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skel skel-table-row" />
      ))}
    </div>
  );
}

function ProgressBar({ loading }) {
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (loading) {
      setShow(true);
      setDone(false);
    } else if (show) {
      setDone(true);
      const t = setTimeout(() => setShow(false), 500);
      return () => clearTimeout(t);
    }
  }, [loading]);

  if (!show) return null;
  return <div className={`progress-bar ${done ? "progress-bar--done" : ""}`} />;
}

/* ═══════════════════════════════════════════════════════════════
   Toast (for submission feedback)
   ═══════════════════════════════════════════════════════════════ */
function Toast({ message, visible, variant }) {
  const [phase, setPhase] = useState("in");
  useEffect(() => {
    if (!visible) return;
    setPhase("in");
    const t = setTimeout(() => setPhase("out"), 2200);
    return () => clearTimeout(t);
  }, [visible, message]);
  if (!visible) return null;
  const cls = `toast ${variant === "destructive" ? "toast--destructive" : ""} ${phase === "out" ? "toast--out" : ""}`;
  return <div className={cls}>{message}</div>;
}

/* ═══════════════════════════════════════════════════════════════
   ★ IconSizePicker — 아이콘 크기 변경 (Phase 1 확정)
   ═══════════════════════════════════════════════════════════════ */

function IconSizePicker({ activeSize, onSizeChange }) {
  return (
    <div className="icon-size-bar">
      <span className="icon-size-label">보기</span>
      {ICON_SIZE_OPTIONS.map(({ value, label, desc }) => (
        <button
          key={value}
          type="button"
          className={`icon-size-btn ${activeSize === value ? "icon-size-btn--active" : ""}`}
          onClick={() => onSizeChange(value)}
          aria-pressed={activeSize === value}
          title={desc}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MainPage
   ═══════════════════════════════════════════════════════════════ */

function HeroCard({ title, description, icon, onClick }) {
  return (
    <button className="hero-card" onClick={onClick} aria-label={`${title} 페이지로 이동`}>
      <span className="hero-icon-wrap" aria-hidden="true">{ICON_MAP[icon]}</span>
      <span className="hero-title">{title}</span>
      <span className="hero-desc">{description}</span>
    </button>
  );
}

function MainPage({ onNavigate }) {
  const HERO_ITEMS = [
    { title: "해커톤 보러가기", description: "진행 중인 해커톤을 확인하세요", icon: "hackathon", to: "/hackathons" },
    { title: "팀 찾기", description: "함께할 팀원을 모집하세요", icon: "camp", to: "/camp" },
    { title: "랭킹 보기", description: "전체 순위를 확인하세요", icon: "ranking", to: "/rankings" },
  ];
  const { status, retry } = usePageData(() => HERO_ITEMS, []);

  return (
    <div className="hero-grid">
      <ProgressBar loading={status === "loading"} />
      {status === "loading" && <HeroSkeleton />}
      {status === "error" && (
        <StatusView status="error" message="데이터를 불러오지 못했습니다." onRetry={retry} />
      )}
      {status === "success" && (
        <>
          {HERO_ITEMS.map((item) => (
            <HeroCard key={item.to} title={item.title} description={item.description} icon={item.icon} onClick={() => onNavigate(item.to)} />
          ))}
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   HackathonListPage
   ═══════════════════════════════════════════════════════════════ */

/* ── Tag grouping ──────────────────────────────────────────── */
const TAG_GROUPS = [
  { label: "기술", tags: ["AI", "딥러닝", "LLM", "블록체인", "IoT", "DevOps"] },
  { label: "분야", tags: ["헬스케어", "교육", "핀테크", "환경"] },
  { label: "기타", tags: ["하드웨어", "데이터", "오픈소스", "UX"] },
];

function HackathonFilterBar({ allTags, activeStatusFilter, activeTagFilters, onStatusChange, onTagToggle, onTagsClear, resultCount }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const drawerRef = useRef(null);

  const activeTagCount = activeTagFilters.length;
  const hasAnyFilter = activeStatusFilter !== "all" || activeTagCount > 0;

  /* Close drawer on outside click */
  useEffect(() => {
    if (!drawerOpen) return;
    function handleClick(e) {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) setDrawerOpen(false);
    }
    function handleEsc(e) { if (e.key === "Escape") setDrawerOpen(false); }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => { document.removeEventListener("mousedown", handleClick); document.removeEventListener("keydown", handleEsc); };
  }, [drawerOpen]);

  /* Filter tags by search */
  const searchLower = tagSearch.toLowerCase();
  const filteredGroups = TAG_GROUPS.map((g) => ({
    ...g,
    tags: g.tags.filter((t) => allTags.includes(t) && t.toLowerCase().includes(searchLower)),
  })).filter((g) => g.tags.length > 0);

  return (
    <div className="filter-bar" ref={drawerRef}>
      {/* Row 1: Status chips + Tag trigger */}
      <div className="filter-row">
        <div className="filter-status-group" role="group" aria-label="상태 필터">
          {STATUS_TOGGLES.map(({ value, label }) => {
            const isActive = activeStatusFilter === value;
            return (
              <button key={value} type="button"
                className={`status-chip ${isActive ? "status-chip-active" : ""}`}
                onClick={() => onStatusChange(value)} aria-pressed={isActive}>
                {value !== "all" && <span className={`status-dot status-dot--${value}`} />}
                {label}
              </button>
            );
          })}
        </div>

        {allTags.length > 0 && (
          <button type="button"
            className={`tag-trigger ${activeTagCount > 0 ? "tag-trigger--has" : ""}`}
            onClick={() => setDrawerOpen((p) => !p)}
            aria-expanded={drawerOpen}>
            <span className="tag-trigger-icon">🏷</span>
            태그 필터
            {activeTagCount > 0 && <span className="tag-badge">{activeTagCount}</span>}
            <span className={`tag-trigger-arrow ${drawerOpen ? "tag-trigger-arrow--open" : ""}`}>▾</span>
          </button>
        )}
      </div>

      {/* Tag Drawer */}
      <div className={`tag-drawer-wrapper ${drawerOpen ? "tag-drawer-wrapper--open" : ""}`}>
        <div className="tag-drawer">
          <div className="tag-drawer-body">
            {/* Search */}
            <div className="tag-search-wrap">
              <span className="tag-search-icon">🔍</span>
              <input
                type="text"
                className="tag-search"
                placeholder="태그 검색..."
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
              />
              {tagSearch && (
                <button type="button" className="tag-search-clear" onClick={() => setTagSearch("")} aria-label="검색 초기화">×</button>
              )}
            </div>

            {/* Grouped tags */}
            {filteredGroups.length === 0 ? (
              <p className="tag-no-results">검색 결과 없음</p>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.label} className="tag-group-section">
                  <span className="tag-group-label">{group.label}</span>
                  <div className="tag-group-chips">
                    {group.tags.map((tag) => {
                      const selected = activeTagFilters.includes(tag);
                      return (
                        <button key={tag} type="button"
                          className={`tag-chip ${selected ? "tag-chip--selected" : ""}`}
                          onClick={() => onTagToggle(tag)} aria-pressed={selected}>
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Drawer footer — live result count */}
          <div className="drawer-actions">
            <span className="drawer-result-count">{resultCount}개의 해커톤</span>
            <button type="button" className="drawer-reset"
              disabled={activeTagCount === 0}
              onClick={() => { onTagsClear(); setTagSearch(""); }}>
              태그 초기화
            </button>
            <button type="button" className="drawer-close" onClick={() => setDrawerOpen(false)}>
              닫기
            </button>
          </div>
        </div>
      </div>

      {/* Active filter summary bar */}
      {hasAnyFilter && (
        <div className="filter-summary">
          {activeStatusFilter !== "all" && (
            <span className="summary-chip">
              {STATUS_TOGGLES.find((s) => s.value === activeStatusFilter)?.label}
              <button type="button" className="summary-chip-remove" onClick={() => onStatusChange("all")} aria-label="상태 필터 제거">×</button>
            </span>
          )}
          {activeTagFilters.map((tag) => (
            <span key={tag} className="summary-chip">
              {tag}
              <button type="button" className="summary-chip-remove" onClick={() => onTagToggle(tag)} aria-label={`${tag} 태그 제거`}>×</button>
            </span>
          ))}
          <button type="button" className="summary-clear-all"
            onClick={() => { onStatusChange("all"); onTagsClear(); }}>
            모두 초기화
          </button>
        </div>
      )}
    </div>
  );
}

function HackathonCard({ hackathon, participantCount, onClick }) {
  const { title, status, tags, thumbnailUrl, period } = hackathon;
  const dday = status !== "ended" ? getDdayInfo(period.submissionDeadlineAt) : null;
  return (
    <button className="hcard" onClick={onClick} aria-label={`${title} 해커톤 상세 페이지로 이동`}
      style={{ textAlign: "left", width: "100%" }}>
      <div className="hcard-thumb"><img src={thumbnailUrl} alt="" loading="lazy" /></div>
      <div className="hcard-content">
        <div className="hcard-title-row">
          <span className="hcard-title">{title}</span>
          <StatusBadge status={status} />
          {dday && <span className={`dday dday--${dday.level}`}>{dday.label}</span>}
        </div>
        {tags.length > 0 && (
          <div className="hcard-tag-row">
            {tags.map((tag) => <span key={tag} className="hcard-tag">{tag}</span>)}
          </div>
        )}
        <dl className="hcard-meta">
          <div className="hcard-meta-item">
            <dt className="hcard-meta-label">제출 마감</dt>
            <dd className="hcard-meta-value">{formatDateKST(period.submissionDeadlineAt, "short")}</dd>
          </div>
          <div className="hcard-meta-item">
            <dt className="hcard-meta-label">종료</dt>
            <dd className="hcard-meta-value">{formatDateKST(period.endAt, "short")}</dd>
          </div>
          <div className="hcard-meta-item">
            <dt className="hcard-meta-label">참가</dt>
            <dd className="hcard-meta-value">{participantCount.toLocaleString("ko-KR")}명</dd>
          </div>
        </dl>
      </div>
    </button>
  );
}

function HackathonListPage({ onNavigate, iconSize, onIconSizeChange }) {
  const [activeStatusFilter, setActiveStatusFilter] = useState("all");
  const [activeTagFilters, setActiveTagFilters] = useState([]);

  const { status, data: hackathons, retry } = usePageData(() => MOCK_HACKATHONS, []);

  const participantCounts = useMemo(() => {
    const counts = {};
    for (const team of MOCK_TEAMS) {
      counts[team.hackathonSlug] = (counts[team.hackathonSlug] ?? 0) + team.memberCount;
    }
    return counts;
  }, []);

  const allTags = useMemo(() => {
    if (!hackathons) return [];
    const tagSet = new Set();
    for (const h of hackathons) for (const tag of h.tags) tagSet.add(tag);
    return Array.from(tagSet).sort();
  }, [hackathons]);

  const filteredHackathons = useMemo(() => {
    if (!hackathons) return [];
    const STATUS_ORDER = { ongoing: 0, upcoming: 1, ended: 2 };
    return hackathons
      .filter((h) => {
        if (activeStatusFilter !== "all" && h.status !== activeStatusFilter) return false;
        if (activeTagFilters.length > 0 && !h.tags.some((t) => activeTagFilters.includes(t))) return false;
        return true;
      })
      .sort((a, b) => {
        const so = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
        if (so !== 0) return so;
        if (a.status === "ended") return new Date(b.period.submissionDeadlineAt) - new Date(a.period.submissionDeadlineAt);
        return new Date(a.period.submissionDeadlineAt) - new Date(b.period.submissionDeadlineAt);
      });
  }, [hackathons, activeStatusFilter, activeTagFilters]);

  const handleTagToggle = (tag) =>
    setActiveTagFilters((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);

  return (
    <div className="hack-page">
      <ProgressBar loading={status === "loading"} />
      <BackButton onClick={() => onNavigate("/")} />
      <h1 className="hack-page-title">해커톤</h1>

      {/* ★ 아이콘 크기 변경 설정 패널 */}
      {status === "success" && (
        <IconSizePicker activeSize={iconSize} onSizeChange={onIconSizeChange} />
      )}

      {status === "loading" && <CardListSkeleton count={4} />}

      {status === "error" && (
        <StatusView status="error" message="해커톤 목록을 불러오지 못했습니다." onRetry={retry} />
      )}

      {status === "empty" && (
        <StatusView status="empty" message="등록된 해커톤이 없습니다." onRetry={null} />
      )}

      {status === "success" && (
      <>
      <HackathonFilterBar allTags={allTags} activeStatusFilter={activeStatusFilter}
        activeTagFilters={activeTagFilters} onStatusChange={setActiveStatusFilter} onTagToggle={handleTagToggle}
        onTagsClear={() => setActiveTagFilters([])} resultCount={filteredHackathons.length} />
      {filteredHackathons.length === 0 ? (
        <div className="status-wrapper">
          <span className="icon-wrap icon-wrap--empty"><IconEmpty /></span>
          <p className="status-msg">조건에 맞는 해커톤이 없습니다</p>
          <button type="button" className="retry-btn" onClick={() => { setActiveStatusFilter("all"); setActiveTagFilters([]); }}>
            필터 초기화
          </button>
        </div>
      ) : (
        <>
        <p className="hack-result-count"><strong>{filteredHackathons.length}</strong>개의 해커톤</p>
        <ul className={`hack-list hack-list--${iconSize}`} role="list" aria-label="해커톤 목록">
          {filteredHackathons.map((h) => (
            <li key={h.slug}>
              <HackathonCard hackathon={h} participantCount={participantCounts[h.slug] ?? 0}
                onClick={() => onNavigate(`/hackathons/${h.slug}`)} />
            </li>
          ))}
        </ul>
        </>
      )}
      </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   HackathonDetailPage — Section Components
   ═══════════════════════════════════════════════════════════════ */

/* ── SectionNav ──────────────────────────────────────────────── */
const SECTION_NAV_ITEMS = [
  { id: "overview",    label: "개요"     },
  { id: "eval",        label: "평가"     },
  { id: "prize",       label: "상금"     },
  { id: "schedule",    label: "일정"     },
  { id: "teams",       label: "팀"       },
  { id: "submit",      label: "제출"     },
  { id: "leaderboard", label: "리더보드" },
];
const SECTION_IDS = SECTION_NAV_ITEMS.map((s) => s.id);

function SectionNav({ activeSectionId, onSectionClick }) {
  return (
    <nav className="section-nav" aria-label="섹션 이동">
      {SECTION_NAV_ITEMS.map(({ id, label }) => (
        <button key={id} type="button"
          className={`section-tab ${activeSectionId === id ? "section-tab-active" : ""}`}
          onClick={() => onSectionClick(id)}
          aria-current={activeSectionId === id ? "true" : undefined}>
          {label}
        </button>
      ))}
    </nav>
  );
}

/* ── useSectionObserver ──────────────────────────────────────── */
function useSectionObserver(sectionIds) {
  const [activeId, setActiveId] = useState(sectionIds[0]);
  const lockRef = useRef(false);

  const lock = useCallback((id) => {
    lockRef.current = true;
    setActiveId(id);
    setTimeout(() => { lockRef.current = false; }, 800);
  }, []);

  useEffect(() => {
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el) => el !== null);
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (lockRef.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      { rootMargin: `-${HEADER_OFFSET_PX}px 0px -40% 0px`, threshold: 0 }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return { activeId, lock };
}

/* ── OverviewSection ─────────────────────────────────────────── */
function OverviewSection({ overview, info, iconSizePx }) {
  const { summary, teamPolicy } = overview;
  const { allowSolo, maxTeamSize } = teamPolicy;
  return (
    <section id="overview" className="d-section">
      <div className="d-section-title-row">
        <span className="section-title-icon"><SectionIcon sectionId="overview" size={iconSizePx} /></span>
        <h2 className="d-section-title">개요</h2>
      </div>
      <div className="d-block"><p className="overview-summary">{summary}</p></div>
      <div className="d-block">
        <h3 className="d-block-title">팀 구성</h3>
        <div className="policy-row">
          {allowSolo && <span className="policy-badge">개인 참가 가능</span>}
          <span className="policy-badge">최대 {maxTeamSize}인</span>
        </div>
      </div>
      {info.notice.length > 0 && (
        <div className="d-block">
          <h3 className="d-block-title">공지사항</h3>
          <ul className="notice-list" role="list">
            {info.notice.map((text, i) => (
              <li key={i} className="notice-item">
                <span className="notice-icon-wrap" aria-hidden="true"><IconInfo /></span>
                <p className="notice-text">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="d-block">
        <div className="link-row">
          <a href={info.links.rules} target="_blank" rel="noopener noreferrer" className="link-button"
            onClick={(e) => e.preventDefault()} aria-label="규정 보기 (새 탭에서 열림)">
            규정 보기 <IconExternal />
          </a>
          <a href={info.links.faq} target="_blank" rel="noopener noreferrer" className="link-button"
            onClick={(e) => e.preventDefault()} aria-label="FAQ (새 탭에서 열림)">
            FAQ <IconExternal />
          </a>
        </div>
      </div>
    </section>
  );
}

/* ── EvalSection ─────────────────────────────────────────────── */
function EvalSection({ evalData, iconSizePx }) {
  return (
    <section id="eval" className="d-section">
      <div className="d-section-title-row">
        <span className="section-title-icon"><SectionIcon sectionId="eval" size={iconSizePx} /></span>
        <h2 className="d-section-title">평가</h2>
      </div>
      <div className="metric-block">
        <h3 className="metric-name">{evalData.metricName}</h3>
        <p className="eval-description">{evalData.description}</p>
      </div>
      {evalData.type === "metric" && (
        <div className="info-card">
          <div className="info-row">
            <span className="info-label">최대 실행 시간</span>
            <span className="info-value">
              <span className="mono">{evalData.limits.maxRuntimeSec}</span>
              <span className="info-unit">초</span>
            </span>
          </div>
          <div className="info-row">
            <span className="info-label">일일 제출 제한</span>
            <span className="info-value">
              <span className="mono">{evalData.limits.maxSubmissionsPerDay}</span>
              <span className="info-unit">회</span>
            </span>
          </div>
        </div>
      )}
      {evalData.type === "vote" && (
        <div className="vote-block">
          {evalData.scoreDisplay.label && <p className="score-label">{evalData.scoreDisplay.label}</p>}
          <div className="eval-table-wrap">
            <table className="eval-table">
              <thead>
                <tr><th className="eval-th">평가 주체</th><th className="eval-th">가중치</th></tr>
              </thead>
              <tbody>
                {evalData.scoreDisplay.breakdown.map((item) => (
                  <tr key={item.key}>
                    <td className="eval-td">{item.label}</td>
                    <td className="eval-td"><span className="mono">{item.weightPercent}</span><span className="weight-unit">%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

/* ── PrizeSection ────────────────────────────────────────────── */
function PrizeSection({ prize, iconSizePx }) {
  return (
    <section id="prize" className="d-section">
      <div className="d-section-title-row">
        <span className="section-title-icon"><SectionIcon sectionId="prize" size={iconSizePx} /></span>
        <h2 className="d-section-title">상금</h2>
      </div>
      {prize === null && <p className="prize-placeholder">상금 정보가 없습니다.</p>}
      {prize !== null && (
        <div className="tier-row">
          {prize.items.map((tier, index) => {
            const medal = getMedal(index);
            return (
              <div key={`${tier.place}-${index}`} className={`tier-card ${medal !== "none" ? `tier-card--${medal}` : ""}`}>
                <div className="medal-wrap"><MedalIcon variant={medal} /></div>
                <span className="place-label">{tier.place}</span>
                <span className="amount">
                  <span className="amount-value">{tier.amountKRW.toLocaleString("ko-KR")}</span>
                  <span className="amount-unit">원</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ── ScheduleSection ─────────────────────────────────────────── */
function ScheduleSection({ schedule, iconSizePx }) {
  const { timezone, milestones } = schedule;
  return (
    <section id="schedule" className="d-section">
      <div className="d-section-title-row" style={{ marginBottom: 8 }}>
        <span className="section-title-icon"><SectionIcon sectionId="schedule" size={iconSizePx} /></span>
        <h2 className="d-section-title">일정</h2>
      </div>
      {timezone && <p className="timezone-label">{timezone}</p>}
      <ol className="timeline" aria-label="일정 타임라인">
        {milestones.map((ms, i) => {
          const isPast = isMilestonePast(ms.at);
          return (
            <li key={`${ms.name}-${i}`} className="milestone">
              <span className={`dot ${isPast ? "dot-past" : ""}`} aria-hidden="true" />
              <div className="milestone-content">
                <span className={`milestone-name ${isPast ? "milestone-name-past" : ""}`}>{ms.name}</span>
                <time className="milestone-date" dateTime={ms.at.toISOString()}>{formatDateKST(ms.at, "full")}</time>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ── TeamsSectionLink ────────────────────────────────────────── */
function TeamsSectionLink({ campEnabled, hackathonSlug, teamCount, onNavigate, iconSizePx }) {
  return (
    <section id="teams" className="d-section">
      <div className="d-section-title-row">
        <span className="section-title-icon"><SectionIcon sectionId="teams" size={iconSizePx} /></span>
        <h2 className="d-section-title">팀</h2>
      </div>
      {campEnabled ? (
        <div className="teams-card">
          <p className="teams-card-text">
            현재 <strong className="team-count-highlight">{teamCount.toLocaleString("ko-KR")}개 팀</strong>이 모집 중입니다
          </p>
          <button className="cta-button" onClick={() => onNavigate(`/camp?hackathon=${hackathonSlug}`)}
            aria-label="팀 찾기 / 팀 만들기">
            팀 찾기 / 팀 만들기
          </button>
        </div>
      ) : (
        <div className="teams-card teams-card-disabled">
          <p className="teams-card-muted">이 해커톤은 팀 모집을 지원하지 않습니다.</p>
        </div>
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SubmitForm — Full implementation (from SubmitForm.tsx)
   useReducer + sync validation + FileReader async
   ═══════════════════════════════════════════════════════════════ */

const SUBMIT_INITIAL_STATE = {
  teamName: "",
  notes: "",
  artifacts: {},
  errors: {},
  isSubmitting: false,
};

function submitFormReducer(state, action) {
  switch (action.type) {
    case SUBMIT_ACTION.SET_FIELD: {
      const { [action.field]: _rm, ...rest } = state.errors;
      return { ...state, [action.field]: action.value, errors: rest };
    }
    case SUBMIT_ACTION.ADD_ARTIFACT: {
      const { [action.stepKey]: _rm, ...rest } = state.errors;
      return { ...state, artifacts: { ...state.artifacts, [action.stepKey]: action.artifact }, errors: rest };
    }
    case SUBMIT_ACTION.REMOVE_ARTIFACT: {
      const { [action.stepKey]: _rm, ...rest } = state.artifacts;
      return { ...state, artifacts: rest };
    }
    case SUBMIT_ACTION.SET_ERRORS:
      return { ...state, errors: action.errors, isSubmitting: false };
    case SUBMIT_ACTION.CLEAR_FIELD_ERROR: {
      const { [action.field]: _rm, ...rest } = state.errors;
      return { ...state, errors: rest };
    }
    case SUBMIT_ACTION.SET_SUBMITTING:
      return { ...state, isSubmitting: action.isSubmitting };
    case SUBMIT_ACTION.RESET:
      return SUBMIT_INITIAL_STATE;
    default:
      return state;
  }
}

function validateSubmission(state, submissionItems) {
  const errors = {};

  if (state.teamName.trim().length < 1) {
    errors.teamName = "팀명을 입력해 주세요.";
  } else if (state.teamName.trim().length > MAX_SUBMIT_NAME_LEN) {
    errors.teamName = `팀명은 ${MAX_SUBMIT_NAME_LEN}자 이내로 입력해 주세요.`;
  }

  if (submissionItems.length === 0) {
    if (!state.artifacts["default"]) {
      errors["default"] = "파일을 업로드해 주세요.";
    }
  } else {
    for (const step of submissionItems) {
      const artifact = state.artifacts[step.key];
      if (!artifact) {
        errors[step.key] = `${step.title}을(를) 제출해 주세요.`;
        continue;
      }
      if (step.format === "zip") {
        if (artifact.fileSize > MAX_FILE_BYTES) {
          errors[step.key] = "파일 크기는 5MB 이하여야 합니다.";
        }
      } else if (step.format === "url") {
        if (!isValidUrl(artifact.dataUrl)) {
          errors[step.key] = "올바른 URL을 입력해 주세요.";
        }
      } else if (step.format === "pdf_url") {
        if (!isValidUrl(artifact.dataUrl) || !isPdfUrl(artifact.dataUrl)) {
          errors[step.key] = "PDF 링크를 입력해 주세요.";
        }
      } else if (step.format === "text_or_url") {
        if (artifact.dataUrl.trim().length < 1) {
          errors[step.key] = "내용을 입력해 주세요.";
        }
      }
    }
  }

  const totalSize = Object.values(state.artifacts).reduce((sum, a) => sum + a.fileSize, 0);
  if (totalSize > MAX_SUBMISSION_BYTES) {
    errors._total = "전체 파일 크기는 10MB 이하여야 합니다.";
  }

  return errors;
}

function SubmitForm({ hackathonSlug, allowedArtifactTypes, submissionItems, onSubmit }) {
  const [state, dispatch] = useReducer(submitFormReducer, SUBMIT_INITIAL_STATE);
  const fileInputRefs = useRef({});
  const isSingleUpload = submissionItems.length === 0;

  function handleFieldChange(field, value) {
    dispatch({ type: SUBMIT_ACTION.SET_FIELD, field, value });
  }

  function handleTextArtifactChange(stepKey, value) {
    dispatch({
      type: SUBMIT_ACTION.ADD_ARTIFACT,
      stepKey,
      artifact: { stepKey, fileName: "", fileSize: 0, dataUrl: value },
    });
  }

  async function handleFileChange(stepKey, file) {
    if (!file) {
      dispatch({ type: SUBMIT_ACTION.REMOVE_ARTIFACT, stepKey });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      dispatch({ type: SUBMIT_ACTION.SET_ERRORS, errors: { [stepKey]: "파일 크기는 5MB 이하여야 합니다." } });
      return;
    }
    const expectedMimes = MIME_MAP["zip"] ?? [];
    if (stepKey !== "default" && expectedMimes.length > 0) {
      if (!expectedMimes.includes(file.type)) {
        dispatch({ type: SUBMIT_ACTION.SET_ERRORS, errors: { [stepKey]: "ZIP 파일만 업로드할 수 있습니다." } });
        return;
      }
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      dispatch({
        type: SUBMIT_ACTION.ADD_ARTIFACT,
        stepKey,
        artifact: { stepKey, fileName: file.name, fileSize: file.size, dataUrl },
      });
    } catch {
      dispatch({ type: SUBMIT_ACTION.SET_ERRORS, errors: { [stepKey]: "파일을 읽을 수 없습니다." } });
    }
  }

  function handleSubmit() {
    const errors = validateSubmission(state, submissionItems);
    if (Object.keys(errors).length > 0) {
      dispatch({ type: SUBMIT_ACTION.SET_ERRORS, errors });
      return;
    }
    dispatch({ type: SUBMIT_ACTION.SET_SUBMITTING, isSubmitting: true });
    const submission = {
      id: generateSubmissionId(),
      hackathonSlug,
      teamName: state.teamName.trim(),
      notes: state.notes.trim(),
      artifacts: Object.values(state.artifacts),
      submittedAt: new Date(),
    };
    onSubmit(submission);
    dispatch({ type: SUBMIT_ACTION.RESET });
  }

  return (
    <div className="sf-form">
      {/* teamName */}
      <div className="sf-field-group">
        <label className="sf-label" htmlFor="submitTeamName">
          팀명 <span className="sf-required">*</span>
        </label>
        <input
          id="submitTeamName"
          type="text"
          className="sf-input"
          value={state.teamName}
          onChange={(e) => handleFieldChange("teamName", e.target.value)}
          placeholder="팀명을 입력해 주세요"
          maxLength={MAX_SUBMIT_NAME_LEN + 10}
          aria-invalid={!!state.errors.teamName}
          aria-describedby={state.errors.teamName ? "err-teamName" : undefined}
          disabled={state.isSubmitting}
        />
        {state.errors.teamName && (
          <span id="err-teamName" className="sf-field-error" role="alert">{state.errors.teamName}</span>
        )}
      </div>

      {/* Single Upload Mode */}
      {isSingleUpload && (
        <div className="sf-field-group">
          <label className="sf-label">파일 업로드 <span className="sf-required">*</span></label>
          <input
            ref={(el) => { fileInputRefs.current["default"] = el; }}
            type="file"
            accept={allowedArtifactTypes.map((t) => ACCEPT_MAP[t] ?? `.${t}`).join(",")}
            className="sf-hidden-input"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => handleFileChange("default", e.target.files?.[0] ?? null)}
            disabled={state.isSubmitting}
          />
          <button
            type="button"
            className="sf-file-button"
            onClick={() => fileInputRefs.current["default"]?.click()}
            aria-label="파일 선택"
            disabled={state.isSubmitting}
          >
            {state.artifacts["default"] ? `✓ ${state.artifacts["default"].fileName}` : "파일 선택…"}
          </button>
          {state.errors["default"] && (
            <span className="sf-field-error" role="alert">{state.errors["default"]}</span>
          )}
        </div>
      )}

      {/* Multi-Step Mode */}
      {!isSingleUpload && submissionItems.map((step) => {
        const artifact = state.artifacts[step.key];
        const error = state.errors[step.key];
        const fieldId = `submit-step-${step.key}`;
        const errId = `err-${step.key}`;

        return (
          <div key={step.key} className="sf-field-group">
            <label className="sf-label" htmlFor={fieldId}>
              {step.title} <span className="sf-required">*</span>
            </label>

            {(step.format === "text_or_url" || step.format === "url") && (
              <input
                id={fieldId}
                type={step.format === "url" ? "url" : "text"}
                className="sf-input"
                value={artifact?.dataUrl ?? ""}
                onChange={(e) => handleTextArtifactChange(step.key, e.target.value)}
                placeholder={step.format === "url" ? "https://..." : "텍스트 또는 URL을 입력해 주세요"}
                aria-invalid={!!error}
                aria-describedby={error ? errId : undefined}
                disabled={state.isSubmitting}
              />
            )}

            {step.format === "pdf_url" && (
              <input
                id={fieldId}
                type="url"
                className="sf-input"
                value={artifact?.dataUrl ?? ""}
                onChange={(e) => handleTextArtifactChange(step.key, e.target.value)}
                placeholder="https://...pdf"
                aria-invalid={!!error}
                aria-describedby={error ? errId : undefined}
                disabled={state.isSubmitting}
              />
            )}

            {step.format === "zip" && (
              <>
                <input
                  ref={(el) => { fileInputRefs.current[step.key] = el; }}
                  type="file"
                  accept={ACCEPT_MAP.zip}
                  className="sf-hidden-input"
                  tabIndex={-1}
                  aria-hidden="true"
                  id={fieldId}
                  onChange={(e) => handleFileChange(step.key, e.target.files?.[0] ?? null)}
                  disabled={state.isSubmitting}
                />
                <button
                  type="button"
                  className="sf-file-button"
                  onClick={() => fileInputRefs.current[step.key]?.click()}
                  aria-label={`${step.title} ZIP 파일 선택`}
                  disabled={state.isSubmitting}
                >
                  {artifact ? `✓ ${artifact.fileName}` : "ZIP 파일 선택…"}
                </button>
              </>
            )}

            {error && (
              <span id={errId} className="sf-field-error" role="alert">{error}</span>
            )}
          </div>
        );
      })}

      {/* Notes */}
      <div className="sf-field-group">
        <label className="sf-label" htmlFor="submitNotes">
          메모 <span className="sf-optional">(선택)</span>
        </label>
        <textarea
          id="submitNotes"
          className="sf-input sf-textarea"
          value={state.notes}
          onChange={(e) => handleFieldChange("notes", e.target.value)}
          placeholder="제출에 대한 메모를 입력해 주세요 (선택 사항)"
          rows={3}
          disabled={state.isSubmitting}
        />
      </div>

      {/* Total size error */}
      {state.errors._total && (
        <span className="sf-field-error" role="alert">{state.errors._total}</span>
      )}

      {/* Submit */}
      <div className="sf-actions">
        <button
          type="button"
          className="sf-submit-btn"
          onClick={handleSubmit}
          disabled={state.isSubmitting}
          aria-busy={state.isSubmitting}
        >
          {state.isSubmitting ? "제출 중…" : "제출하기"}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SubmissionCard — Full implementation (from SubmissionCard.tsx)
   ═══════════════════════════════════════════════════════════════ */

function SubmissionCard({ submission }) {
  const { teamName, submittedAt, artifacts, notes } = submission;
  const notesPreview = notes.length > NOTES_PREVIEW_LEN
    ? `${notes.slice(0, NOTES_PREVIEW_LEN)}…`
    : notes;

  return (
    <article className="sc-card" aria-label={`${teamName} 제출 내역`}>
      <div className="sc-header">
        <span className="sc-team">{teamName}</span>
        <time className="sc-timestamp" dateTime={submittedAt.toISOString()}>
          {formatDateKST(submittedAt, "full")}
        </time>
      </div>
      <div className="sc-meta">
        <span className="sc-meta-item">
          산출물{" "}<span className="sc-meta-value">{artifacts.length}개</span>
        </span>
      </div>
      {notes.trim().length > 0 && (
        <p className="sc-notes">{notesPreview}</p>
      )}
    </article>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SubmitSection — Wired with real SubmitForm + SubmissionCard
   ═══════════════════════════════════════════════════════════════ */

function SubmitSection({ submit, hackathonSlug, existingSubmissions, onNewSubmission, iconSizePx }) {
  const { guide, allowedArtifactTypes, submissionItems } = submit;

  return (
    <section id="submit" className="d-section">
      <div className="d-section-title-row">
        <span className="section-title-icon"><SectionIcon sectionId="submit" size={iconSizePx} /></span>
        <h2 className="d-section-title">제출</h2>
      </div>

      {guide.length > 0 && (
        <div className="d-block">
          <h3 className="d-block-title">제출 가이드</h3>
          <ol className="guide-list">
            {guide.map((step, i) => (
              <li key={i} className="guide-item">
                <span className="guide-number">{i + 1}</span>
                <span className="guide-text">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {allowedArtifactTypes.length > 0 && (
        <div className="d-block">
          <p className="format-line">
            <span className="format-label">제출 형식</span>
            <span className="format-value">{allowedArtifactTypes.join(", ")}</span>
          </p>
        </div>
      )}

      <div className="d-block">
        <h3 className="d-block-title">제출하기</h3>
        <SubmitForm
          hackathonSlug={hackathonSlug}
          allowedArtifactTypes={allowedArtifactTypes}
          submissionItems={submissionItems}
          onSubmit={onNewSubmission}
        />
      </div>

      {existingSubmissions.length > 0 && (
        <div className="d-block">
          <div className="d-block-title-row">
            이전 제출 내역
            <span className="submit-count-badge">{existingSubmissions.length}건</span>
          </div>
          <ul className="submission-list" role="list">
            {existingSubmissions.map((sub) => (
              <li key={sub.id}><SubmissionCard submission={sub} /></li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LeaderboardRow — Full implementation (from LeaderboardRow.tsx)
   Medal borders, artifacts column, mono scores
   ═══════════════════════════════════════════════════════════════ */

function LeaderboardRow({ entry, showBreakdown, showArtifacts }) {
  const medalMap = { 1: "gold", 2: "silver", 3: "bronze" };
  const medal = medalMap[entry.rank] || null;
  const medalCls = medal ? ` lb-row--${medal}` : "";

  return (
    <tr className={`lb-row${medalCls}`}>
      <td className="lb-td">
        <span className="lb-rank">{entry.rank}</span>
      </td>
      <td className="lb-td">
        <span className="lb-team">{entry.teamName}</span>
      </td>
      <td className="lb-td">
        <span className="lb-score">{entry.score.toLocaleString("ko-KR", { minimumFractionDigits: 1 })}</span>
      </td>
      <td className="lb-td">
        <time className="lb-timestamp" dateTime={entry.submittedAt.toISOString()}>
          {formatDateKST(entry.submittedAt, "full")}
        </time>
      </td>

      {showBreakdown && (
        <td className="lb-td">
          <span className="lb-score">
            {entry.scoreBreakdown?.participant != null
              ? entry.scoreBreakdown.participant.toLocaleString("ko-KR", { minimumFractionDigits: 1 })
              : "\u2014"}
          </span>
        </td>
      )}
      {showBreakdown && (
        <td className="lb-td">
          <span className="lb-score">
            {entry.scoreBreakdown?.judge != null
              ? entry.scoreBreakdown.judge.toLocaleString("ko-KR", { minimumFractionDigits: 1 })
              : "\u2014"}
          </span>
        </td>
      )}

      {showArtifacts && (
        <td className="lb-td">
          {entry.artifacts !== null ? (
            <div className="lb-artifact-links">
              {entry.artifacts.webUrl && (
                <a href={entry.artifacts.webUrl} target="_blank" rel="noopener noreferrer"
                  className="lb-artifact-link" aria-label={`${entry.teamName} 웹 산출물 (새 탭에서 열림)`}>
                  웹
                </a>
              )}
              {entry.artifacts.pdfUrl && (
                <a href={entry.artifacts.pdfUrl} target="_blank" rel="noopener noreferrer"
                  className="lb-artifact-link" aria-label={`${entry.teamName} PDF 산출물 (새 탭에서 열림)`}>
                  PDF
                </a>
              )}
            </div>
          ) : (
            <span className="lb-no-artifact">{"\u2014"}</span>
          )}
        </td>
      )}
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════════════
   LeaderboardSection — Full implementation (from LeaderboardSection.tsx)
   showArtifacts derived at section level, scroll wrapper, null branch
   ═══════════════════════════════════════════════════════════════ */

function LeaderboardSection({ leaderboard, evalType, iconSizePx }) {
  const showBreakdown = evalType === "vote";
  const showArtifacts =
    leaderboard !== null &&
    leaderboard.entries.some((e) => e.artifacts !== null);

  return (
    <section id="leaderboard" className="d-section" style={{ borderBottom: "none" }}>
      {leaderboard === null ? (
        <div className="lb-empty-wrap">
          <div className="d-section-title-row" style={{ margin: 0 }}>
            <span className="section-title-icon"><SectionIcon sectionId="leaderboard" size={iconSizePx} /></span>
            <h2 className="d-section-title" style={{ margin: 0 }}>리더보드</h2>
          </div>
          <p className="lb-empty-text">리더보드 데이터가 없습니다.</p>
        </div>
      ) : (
        <>
          <div className="lb-header-row">
            <div className="d-section-title-row" style={{ margin: 0 }}>
              <span className="section-title-icon"><SectionIcon sectionId="leaderboard" size={iconSizePx} /></span>
              <h2 className="d-section-title" style={{ margin: 0 }}>리더보드</h2>
            </div>
            <time className="lb-updated" dateTime={leaderboard.updatedAt.toISOString()}>
              최종 업데이트: {formatDateKST(leaderboard.updatedAt, "full")}
            </time>
          </div>
          <div className="lb-table-wrap">
            <table className="lb-table">
              <thead>
                <tr>
                  <th className="lb-th">순위</th>
                  <th className="lb-th">팀명</th>
                  <th className="lb-th">점수</th>
                  <th className="lb-th">제출 시각</th>
                  {showBreakdown && (
                    <>
                      <th className="lb-th">참가자 점수</th>
                      <th className="lb-th">심사위원 점수</th>
                    </>
                  )}
                  {showArtifacts && (
                    <th className="lb-th">산출물</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {leaderboard.entries.map((entry) => (
                  <LeaderboardRow
                    key={`${entry.rank}-${entry.teamName}`}
                    entry={entry}
                    showBreakdown={showBreakdown}
                    showArtifacts={showArtifacts}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   HackathonDetailPage
   ═══════════════════════════════════════════════════════════════ */
function HackathonDetailPage({ slug, onNavigate, iconSizePx }) {
  const { status, data: detail, retry } = usePageData(() => {
    const d = MOCK_DETAILS[slug];
    if (!d) throw new Error("not_found");
    return d;
  }, [slug]);

  const leaderboard = MOCK_LEADERBOARDS[slug] ?? null;

  const { activeId: activeSectionId, lock: lockSection } = useSectionObserver(SECTION_IDS);

  /* Submissions — localStorage 저장 */
  const lsSubKey = "submissions_" + slug;
  const defaultSubs = INITIAL_MOCK_SUBMISSIONS.filter((s) => s.hackathonSlug === slug).map((s) => ({ ...s, submittedAt: s.submittedAt.toISOString() }));
  const [submissions, setSubmissions] = useLocalState(lsSubKey, defaultSubs);
  const subsWithDates = useMemo(() => submissions.map((s) => ({ ...s, submittedAt: new Date(s.submittedAt) })), [submissions]);

  const [toastMsg, setToastMsg] = useState("");
  const [toastKey, setToastKey] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);

  const handleNewSubmission = useCallback((submission) => {
    const serialized = { ...submission, submittedAt: submission.submittedAt.toISOString() };
    setSubmissions((prev) => [serialized, ...prev]);
    setToastMsg(`"${submission.teamName}" 제출 완료`);
    setToastKey((k) => k + 1);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2600);
  }, []);

  const handleSectionClick = useCallback((sectionId) => {
    lockSection(sectionId);
    const el = document.getElementById(sectionId);
    if (!el) return;
    const pos = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: pos - HEADER_OFFSET_PX, behavior: "smooth" });
  }, [lockSection]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [slug]);

  const teamCount = useMemo(
    () => MOCK_TEAMS.filter((t) => t.hackathonSlug === slug).length,
    [slug]
  );

  const evalType = detail?.sections?.eval?.type;

  return (
    <div className="detail-page">
      <ProgressBar loading={status === "loading"} />
      {status === "success" && <SectionNav activeSectionId={activeSectionId} onSectionClick={handleSectionClick} />}
      <div className="detail-content">
        <header className="detail-header">
          <BackButton onClick={() => onNavigate("/hackathons")} />
          {status === "success" && <h1 className="detail-page-title">{detail.title}</h1>}
          {status === "loading" && <div className="skel skel-title" />}
        </header>

        {status === "loading" && (
          <div className="skel-list" style={{ gap: 24 }}>
            {[0, 1, 2, 3].map((i) => <div key={i} className="skel skel-card" />)}
          </div>
        )}

        {status === "error" && (
          <StatusView status="error" message="상세 정보를 불러오지 못했습니다." onRetry={retry} />
        )}

        {status === "success" && (
        <>
        <OverviewSection overview={detail.sections.overview} info={detail.sections.info} iconSizePx={iconSizePx} />
        <EvalSection evalData={detail.sections.eval} iconSizePx={iconSizePx} />
        <PrizeSection prize={detail.sections.prize} iconSizePx={iconSizePx} />
        <ScheduleSection schedule={detail.sections.schedule} iconSizePx={iconSizePx} />
        <TeamsSectionLink
          campEnabled={detail.sections.teams.campEnabled}
          hackathonSlug={slug}
          teamCount={teamCount}
          onNavigate={onNavigate}
          iconSizePx={iconSizePx}
        />
        <SubmitSection
          submit={detail.sections.submit}
          hackathonSlug={slug}
          existingSubmissions={subsWithDates}
          onNewSubmission={handleNewSubmission}
          iconSizePx={iconSizePx}
        />
        <LeaderboardSection leaderboard={leaderboard} evalType={evalType} iconSizePx={iconSizePx} />
        </>
        )}
      </div>
      <Toast key={toastKey} message={toastMsg} visible={toastVisible} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CampPage — Team recruitment board
   Components: CampHeader, CampFilterBar, OpenBadge, TeamCard,
               TeamCreateForm, CampPage
   ═══════════════════════════════════════════════════════════════ */

/* ── OpenBadge ──────────────────────────────────────────────── */
function OpenBadge({ isOpen }) {
  return (
    <span className={`ob-badge ${isOpen ? "ob-open" : "ob-closed"}`}>
      {isOpen ? "모집중" : "모집마감"}
    </span>
  );
}

/* ── CampHeader ─────────────────────────────────────────────── */
function CampHeader({ onCreateClick }) {
  return (
    <div className="camp-header">
      <h1 className="camp-title">팀원 모집</h1>
      <button type="button" className="camp-create-btn" onClick={onCreateClick}>
        팀 만들기
      </button>
    </div>
  );
}

/* ── CampFilterBar ──────────────────────────────────────────── */
const CAMP_STATUS_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "open", label: "모집중" },
  { value: "closed", label: "모집마감" },
];

function CampFilterBar({ hackathons, activeSlug, onSlugChange, activeOpenFilter, onOpenFilterChange }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef(null);

  const selectedHackName = activeSlug !== "all"
    ? hackathons.find((h) => h.slug === activeSlug)?.title || activeSlug
    : null;

  function truncate(text, max) {
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  /* Close on outside click / Escape */
  useEffect(() => {
    if (!drawerOpen) return;
    function handleClick(e) {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) setDrawerOpen(false);
    }
    function handleEsc(e) { if (e.key === "Escape") setDrawerOpen(false); }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => { document.removeEventListener("mousedown", handleClick); document.removeEventListener("keydown", handleEsc); };
  }, [drawerOpen]);

  return (
    <div className="camp-filter" ref={drawerRef}>
      <div className="camp-filter-row">
        {/* Status: 모집중 / 모집마감 */}
        <div className="camp-status-group" role="group" aria-label="모집 상태 필터">
          {CAMP_STATUS_OPTIONS.map(({ value, label }) => {
            const isActive = activeOpenFilter === value;
            return (
              <button key={value} type="button"
                className={`camp-chip ${isActive ? "camp-chip-active" : ""}`}
                onClick={() => onOpenFilterChange(value)} aria-pressed={isActive}>
                {label}
              </button>
            );
          })}
        </div>

        {/* Hackathon drawer trigger */}
        <button type="button"
          className={`camp-hack-trigger ${activeSlug !== "all" ? "camp-hack-trigger--has" : ""}`}
          onClick={() => setDrawerOpen((p) => !p)}
          aria-expanded={drawerOpen}>
          {selectedHackName ? truncate(selectedHackName, 15) : "해커톤 선택"}
          <span className={`camp-hack-arrow ${drawerOpen ? "camp-hack-arrow--open" : ""}`}>▾</span>
        </button>
      </div>

      {/* Hackathon drawer */}
      <div className={`camp-hack-drawer-wrap ${drawerOpen ? "camp-hack-drawer-wrap--open" : ""}`}>
        <div className="camp-hack-drawer">
          <div className="camp-hack-drawer-body">
            <button type="button"
              className={`camp-chip ${activeSlug === "all" ? "camp-chip-active" : ""}`}
              onClick={() => { onSlugChange("all"); setDrawerOpen(false); }}>
              전체
            </button>
            {hackathons.map((h) => (
              <button key={h.slug} type="button"
                className={`camp-chip ${activeSlug === h.slug ? "camp-chip-active" : ""}`}
                onClick={() => { onSlugChange(h.slug); setDrawerOpen(false); }}
                title={h.title}>
                {truncate(h.title, CAMP_TITLE_TRUNCATE)}
              </button>
            ))}
          </div>
          <div className="camp-hack-drawer-footer">
            <span className="camp-hack-count">{hackathons.length}개 해커톤</span>
            <button type="button" className="camp-hack-close" onClick={() => setDrawerOpen(false)}>닫기</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── TeamCard ───────────────────────────────────────────────── */
function TeamCard({ team, isOwned, onToggleOpen, onEdit, onDelete }) {
  const { teamCode, name, isOpen, intro, lookingFor, memberCount, contact, createdAt } = team;
  return (
    <article className="tc-card">
      <div className="tc-title-row">
        <span className="tc-name">{name}</span>
        <OpenBadge isOpen={isOpen} />
      </div>
      <p className="tc-intro">{intro}</p>
      {lookingFor.length > 0 && (
        <div className="tc-tag-row" aria-label="모집 포지션">
          {lookingFor.map((pos) => (
            <span key={pos} className="tc-pos-chip">{pos}</span>
          ))}
        </div>
      )}
      <div className="tc-meta-row">
        <span className="tc-meta-item">
          <span className="tc-meta-value">{memberCount}</span>명
        </span>
        <span className="tc-meta-divider" aria-hidden="true">·</span>
        <time className="tc-meta-item" dateTime={createdAt.toISOString()}>
          {formatDateKST(createdAt, "short")}
        </time>
      </div>
      <div className="tc-action-row">
        <a
          href={contact.url}
          target="_blank"
          rel="noopener noreferrer"
          className="tc-contact"
          aria-label={`${name} 팀에 연락하기 (새 탭에서 열림)`}
        >
          연락하기
        </a>
        {isOwned && (
          <div className="tc-owner">
            <button type="button" className={`tc-toggle ${isOpen ? "tc-toggle--close" : "tc-toggle--reopen"}`} onClick={() => onToggleOpen(teamCode)}
              aria-label={isOpen ? "모집 마감으로 변경" : "모집중으로 변경"}>
              {isOpen ? "모집 마감" : "모집 재개"}
            </button>
            <button type="button" className="tc-edit" onClick={() => onEdit(teamCode)}>
              수정
            </button>
            <button type="button" className="tc-delete" onClick={() => onDelete(teamCode)}>
              삭제
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

/* ── TeamCreateForm — useReducer ────────────────────────────── */

const POSITION_PRESETS = [
  "프론트엔드", "백엔드", "디자이너", "PM",
  "데이터 분석", "AI/ML", "iOS", "Android",
  "DevOps", "QA",
];

const TCF_INITIAL = {
  hackathonSlug: "",
  name: "",
  intro: "",
  isOpen: true,
  lookingFor: [],
  contactUrl: "",
  errors: {},
};

function tcfReducer(state, action) {
  switch (action.type) {
    case TEAM_ACTION.SET_TEXT_FIELD: {
      const { [action.field]: _rm, ...rest } = state.errors;
      return { ...state, [action.field]: action.value, errors: rest };
    }
    case TEAM_ACTION.SET_IS_OPEN:
      return { ...state, isOpen: action.value };
    case TEAM_ACTION.ADD_TAG: {
      if (state.lookingFor.includes(action.tag)) return state;
      if (state.lookingFor.length >= MAX_LOOKING_FOR_TAGS) return state;
      const { lookingFor: _rm, ...rest } = state.errors;
      return { ...state, lookingFor: [...state.lookingFor, action.tag], errors: rest };
    }
    case TEAM_ACTION.REMOVE_TAG:
      return { ...state, lookingFor: state.lookingFor.filter((t) => t !== action.tag) };
    case TEAM_ACTION.SET_ERRORS:
      return { ...state, errors: action.errors };
    case TEAM_ACTION.CLEAR_FIELD_ERROR: {
      const { [action.field]: _rm, ...rest } = state.errors;
      return { ...state, errors: rest };
    }
    case TEAM_ACTION.RESET:
      return action.initial;
    default:
      return state;
  }
}

function validateTeamForm(state) {
  const errors = {};
  if (state.name.trim().length < 1) errors.name = "팀명을 입력해 주세요.";
  else if (state.name.trim().length > MAX_TEAM_NAME_LEN) errors.name = `팀명은 ${MAX_TEAM_NAME_LEN}자 이내로 입력해 주세요.`;
  if (state.intro.trim().length < 1) errors.intro = "소개를 입력해 주세요.";
  else if (state.intro.trim().length > MAX_TEAM_INTRO_LEN) errors.intro = `소개는 ${MAX_TEAM_INTRO_LEN}자 이내로 입력해 주세요.`;
  if (state.lookingFor.length < 1) errors.lookingFor = "모집 포지션을 1개 이상 입력해 주세요.";
  if (!isValidUrl(state.contactUrl)) errors.contactUrl = "올바른 URL을 입력해 주세요.";
  if (state.hackathonSlug.length < 1) errors.hackathonSlug = "해커톤을 선택해 주세요.";
  return errors;
}

function TeamCreateForm({ hackathonSlug, hackathons, onSubmit, onCancel, editingTeam }) {
  const isEdit = !!editingTeam;
  const initial = isEdit
    ? {
        hackathonSlug: editingTeam.hackathonSlug,
        name: editingTeam.name,
        intro: editingTeam.intro,
        isOpen: editingTeam.isOpen,
        lookingFor: [...editingTeam.lookingFor],
        contactUrl: editingTeam.contact?.url || "",
        errors: {},
      }
    : { ...TCF_INITIAL, hackathonSlug: hackathonSlug === "all" ? "" : hackathonSlug };
  const [state, dispatch] = useReducer(tcfReducer, initial);
  const [tagInput, setTagInput] = useState("");

  function handleTagKeyDown(e) {
    if (e.nativeEvent?.isComposing || e.isComposing) return;
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addCustomTag();
    }
  }

  function addCustomTag() {
    const tag = tagInput.trim().replace(/,/g, "");
    if (tag.length > 0) {
      dispatch({ type: TEAM_ACTION.ADD_TAG, tag });
      setTagInput("");
    }
  }

  function handleSubmit() {
    const errors = validateTeamForm(state);
    if (Object.keys(errors).length > 0) {
      dispatch({ type: TEAM_ACTION.SET_ERRORS, errors });
      return;
    }
    const team = {
      teamCode: isEdit ? editingTeam.teamCode : generateTeamCode(),
      hackathonSlug: state.hackathonSlug,
      name: state.name.trim(),
      isOpen: state.isOpen,
      memberCount: isEdit ? editingTeam.memberCount : 1,
      lookingFor: state.lookingFor,
      intro: state.intro.trim(),
      contact: { type: "link", url: state.contactUrl.trim() },
      createdAt: isEdit ? editingTeam.createdAt : new Date(),
    };
    onSubmit(team);
    onCancel();
  }

  return (
    <div className="tcf-wrapper">
      <div className="tcf-header">
        <h2 className="tcf-title">{isEdit ? "팀 수정" : "팀 만들기"}</h2>
        <button type="button" className="tcf-close" onClick={onCancel} aria-label="취소">✕</button>
      </div>
      <div className="tcf-form">
        {/* hackathonSlug */}
        <div className="tcf-field">
          <label className="tcf-label" htmlFor="tcf-hackathon">해커톤 <span className="tcf-req">*</span></label>
          <select
            id="tcf-hackathon" className="tcf-select" value={state.hackathonSlug}
            onChange={(e) => dispatch({ type: TEAM_ACTION.SET_TEXT_FIELD, field: "hackathonSlug", value: e.target.value })}
            aria-invalid={!!state.errors.hackathonSlug}
          >
            <option value="">해커톤을 선택해 주세요</option>
            {hackathons.map((h) => <option key={h.slug} value={h.slug}>{h.title}</option>)}
          </select>
          {state.errors.hackathonSlug && <span className="tcf-error">{state.errors.hackathonSlug}</span>}
        </div>

        {/* name */}
        <div className="tcf-field">
          <label className="tcf-label" htmlFor="tcf-name">팀명 <span className="tcf-req">*</span></label>
          <input id="tcf-name" type="text" className="tcf-input" value={state.name}
            onChange={(e) => dispatch({ type: TEAM_ACTION.SET_TEXT_FIELD, field: "name", value: e.target.value })}
            placeholder="팀명을 입력해 주세요" maxLength={MAX_TEAM_NAME_LEN + 5} aria-invalid={!!state.errors.name}
          />
          {state.errors.name && <span className="tcf-error">{state.errors.name}</span>}
        </div>

        {/* intro */}
        <div className="tcf-field">
          <label className="tcf-label" htmlFor="tcf-intro">팀 소개 <span className="tcf-req">*</span></label>
          <textarea id="tcf-intro" className="tcf-input tcf-textarea" value={state.intro}
            onChange={(e) => dispatch({ type: TEAM_ACTION.SET_TEXT_FIELD, field: "intro", value: e.target.value })}
            placeholder={`팀 소개를 입력해 주세요 (최대 ${MAX_TEAM_INTRO_LEN}자)`}
            rows={4} maxLength={MAX_TEAM_INTRO_LEN + 10} aria-invalid={!!state.errors.intro}
          />
          <div className="tcf-char-count">{state.intro.length} / {MAX_TEAM_INTRO_LEN}</div>
          {state.errors.intro && <span className="tcf-error">{state.errors.intro}</span>}
        </div>

        {/* isOpen */}
        <div className="tcf-field">
          <label className="tcf-checkbox-label">
            <input type="checkbox" className="tcf-checkbox" checked={state.isOpen}
              onChange={(e) => dispatch({ type: TEAM_ACTION.SET_IS_OPEN, value: e.target.checked })} />
            <span>모집 중 상태로 시작</span>
          </label>
        </div>

        {/* lookingFor — preset chips + custom input */}
        <div className="tcf-field">
          <label className="tcf-label">모집 포지션 <span className="tcf-req">*</span></label>

          {/* Step 1: Preset selection */}
          <div className="tcf-presets">
            {POSITION_PRESETS.map((pos) => {
              const selected = state.lookingFor.includes(pos);
              const atLimit = !selected && state.lookingFor.length >= MAX_LOOKING_FOR_TAGS;
              return (
                <button key={pos} type="button"
                  className={`tcf-preset ${selected ? "tcf-preset--selected" : ""} ${atLimit ? "tcf-preset--disabled" : ""}`}
                  onClick={() => {
                    if (selected) dispatch({ type: TEAM_ACTION.REMOVE_TAG, tag: pos });
                    else dispatch({ type: TEAM_ACTION.ADD_TAG, tag: pos });
                  }}
                  aria-pressed={selected}
                  disabled={atLimit}
                >
                  {pos}
                </button>
              );
            })}
          </div>

          {/* Step 2: Selected tags summary (custom ones get × removal) */}
          {state.lookingFor.length > 0 && (
            <div className="tcf-tag-wrap" style={{ marginBottom: 10 }}>
              {state.lookingFor.map((tag) => (
                <span key={tag} className="tcf-tag-chip">
                  {tag}
                  <button type="button" className="tcf-tag-rm"
                    onClick={() => dispatch({ type: TEAM_ACTION.REMOVE_TAG, tag })}
                    aria-label={`${tag} 포지션 삭제`}>×</button>
                </span>
              ))}
            </div>
          )}

          {/* Step 3: Custom free-text input + add button */}
          {state.lookingFor.length < MAX_LOOKING_FOR_TAGS && (
            <>
              <span className="tcf-custom-label">목록에 없는 포지션 직접 입력</span>
              <div className="tcf-custom-row">
                <input id="tcf-lookingFor" type="text" className="tcf-input"
                  value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown} placeholder="예: 블록체인 개발자"
                  aria-invalid={!!state.errors.lookingFor}
                  style={{ flex: 1 }} />
                <button type="button" className="tcf-add-btn"
                  onClick={addCustomTag}
                  disabled={tagInput.trim().length === 0}>
                  추가
                </button>
              </div>
            </>
          )}

          {state.errors.lookingFor && <span className="tcf-error">{state.errors.lookingFor}</span>}
        </div>

        {/* contact.url */}
        <div className="tcf-field">
          <label className="tcf-label" htmlFor="tcf-contact">연락처 URL <span className="tcf-req">*</span></label>
          <input id="tcf-contact" type="url" className="tcf-input" value={state.contactUrl}
            onChange={(e) => dispatch({ type: TEAM_ACTION.SET_TEXT_FIELD, field: "contactUrl", value: e.target.value })}
            placeholder="https://..." aria-invalid={!!state.errors.contactUrl} />
          {state.errors.contactUrl && <span className="tcf-error">{state.errors.contactUrl}</span>}
        </div>

        {/* Actions */}
        <div className="tcf-actions">
          <button type="button" className="tcf-cancel-btn" onClick={onCancel}>취소</button>
          <button type="button" className="tcf-submit-btn" onClick={handleSubmit}>{isEdit ? "수정 완료" : "팀 만들기"}</button>
        </div>
      </div>
    </div>
  );
}

/* ── CampPage (route container) ─────────────────────────────── */
function CampPage({ onNavigate, initialFilter }) {
  const { status: pageStatus, retry } = usePageData(() => true, []);

  /* Teams — localStorage 저장, Date 복원 */
  const [teams, setTeams] = useLocalState("teams", MOCK_TEAMS.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() })));
  const teamsWithDates = useMemo(() => teams.map((t) => ({ ...t, createdAt: new Date(t.createdAt) })), [teams]);

  const [filterSlug, setFilterSlug] = useState(initialFilter || "all");
  const [openFilter, setOpenFilter] = useState("all");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [ownedCodes, setOwnedCodes] = useLocalState("ownedCodes", []);

  const hackathonList = useMemo(() =>
    MOCK_HACKATHONS.map((h) => ({ slug: h.slug, title: h.title })),
    []
  );

  const filteredTeams = useMemo(() => {
    return teamsWithDates
      .filter((t) => {
        if (filterSlug !== "all" && t.hackathonSlug !== filterSlug) return false;
        if (openFilter === "open" && !t.isOpen) return false;
        if (openFilter === "closed" && t.isOpen) return false;
        return true;
      })
      .sort((a, b) => {
        const oo = (a.isOpen ? 0 : 1) - (b.isOpen ? 0 : 1);
        if (oo !== 0) return oo;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
  }, [teamsWithDates, filterSlug, openFilter]);

  /* Toast */
  const [toastMsg, setToastMsg] = useState("");
  const [toastKey, setToastKey] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastVariant, setToastVariant] = useState(null);

  function showToast(msg, variant) {
    setToastMsg(msg);
    setToastKey((k) => k + 1);
    setToastVisible(true);
    setToastVariant(variant || null);
    setTimeout(() => setToastVisible(false), 2600);
  }

  function handleFormSubmit(team) {
    const serialized = { ...team, createdAt: team.createdAt instanceof Date ? team.createdAt.toISOString() : team.createdAt };
    if (editingTeam) {
      setTeams((prev) => prev.map((t) => t.teamCode === serialized.teamCode ? serialized : t));
      showToast(`"${team.name}" 팀이 수정되었습니다`);
    } else {
      setTeams((prev) => [serialized, ...prev]);
      setOwnedCodes((prev) => [...prev, team.teamCode]);
      showToast(`"${team.name}" 팀이 생성되었습니다`);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleToggleOpen(teamCode) {
    setTeams((prev) =>
      prev.map((t) => t.teamCode === teamCode ? { ...t, isOpen: !t.isOpen } : t)
    );
  }

  function handleEdit(teamCode) {
    const team = teamsWithDates.find((t) => t.teamCode === teamCode);
    if (!team) return;
    setEditingTeam(team);
    setShowCreateForm(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleDelete(teamCode) {
    const team = teamsWithDates.find((t) => t.teamCode === teamCode);
    if (!team) return;
    setTeams((prev) => prev.filter((t) => t.teamCode !== teamCode));
    setOwnedCodes((prev) => prev.filter((c) => c !== teamCode));
    if (editingTeam?.teamCode === teamCode) setEditingTeam(null);
    showToast(`"${team.name}" 팀이 삭제되었습니다`, "destructive");
  }

  function handleCloseForm() {
    setShowCreateForm(false);
    setEditingTeam(null);
  }

  const isFormOpen = showCreateForm || !!editingTeam;

  return (
    <div className="camp-page">
      <ProgressBar loading={pageStatus === "loading"} />
      <BackButton onClick={() => onNavigate("/")} />
      <CampHeader onCreateClick={() => {
        setEditingTeam(null);
        setShowCreateForm((p) => !p);
      }} />

      {pageStatus === "loading" && <CardListSkeleton count={5} />}

      {pageStatus === "error" && (
        <StatusView status="error" message="팀 목록을 불러오지 못했습니다." onRetry={retry} />
      )}

      {(pageStatus === "success" || pageStatus === "empty") && (
      <>
      <CampFilterBar hackathons={hackathonList} activeSlug={filterSlug} onSlugChange={setFilterSlug}
        activeOpenFilter={openFilter} onOpenFilterChange={setOpenFilter} />

      {isFormOpen && (
        <TeamCreateForm
          hackathonSlug={filterSlug}
          hackathons={hackathonList}
          onSubmit={handleFormSubmit}
          onCancel={handleCloseForm}
          editingTeam={editingTeam}
        />
      )}

      {filteredTeams.length === 0 ? (
        <StatusView
          status="empty"
          message={filterSlug === "all" ? "등록된 팀이 없습니다" : "이 해커톤에 등록된 팀이 없습니다"}
          onRetry={null}
        />
      ) : (
        <ul className="camp-team-list" role="list" aria-label="팀 목록">
          {filteredTeams.map((team) => (
            <li key={team.teamCode}>
              <TeamCard
                team={team}
                isOwned={ownedCodes.includes(team.teamCode)}
                onToggleOpen={handleToggleOpen}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            </li>
          ))}
        </ul>
      )}
      </>
      )}

      <Toast key={toastKey} message={toastMsg} visible={toastVisible} variant={toastVariant} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   RankingsPage — §3-5  (PeriodFilter + RankingTable)
   ═══════════════════════════════════════════════════════════════ */

const PERIOD_OPTIONS = [
  { value: "7d",  label: "최근 7일"  },
  { value: "30d", label: "최근 30일" },
  { value: "all", label: "전체"      },
];

function PeriodFilter({ activePeriod, onPeriodChange }) {
  return (
    <div className="pf-group" role="group" aria-label="기간 필터">
      {PERIOD_OPTIONS.map(({ value, label }) => {
        const isActive = activePeriod === value;
        return (
          <button
            key={value}
            type="button"
            className={`pf-btn ${isActive ? "pf-btn-active" : ""}`}
            onClick={() => onPeriodChange(value)}
            aria-pressed={isActive}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

const RT_MEDAL_MAP = ["gold", "silver", "bronze"];
function getRtMedal(rank) {
  return RT_MEDAL_MAP[rank - 1] || "none";
}

function RankingTable({ entries }) {
  const [expanded, setExpanded] = useState(false);
  const PREVIEW_COUNT = 5;
  const hasMore = entries.length > PREVIEW_COUNT;
  const visible = expanded ? entries : entries.slice(0, PREVIEW_COUNT);

  if (entries.length === 0) {
    return (
      <div className="rt-empty-wrap">
        <StatusView status="empty" message="랭킹 데이터가 없습니다" onRetry={null} />
      </div>
    );
  }

  return (
    <div className="rt-table-wrap">
      <table className="rt-table">
        <thead>
          <tr>
            <th className="rt-th rt-th-rank" scope="col">순위</th>
            <th className="rt-th rt-th-team" scope="col">팀명</th>
            <th className="rt-th rt-th-points" scope="col">포인트</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((entry) => {
            const medal = getRtMedal(entry.rank);
            const medalClass = medal !== "none" ? `rt-row--${medal}` : "";
            return (
              <tr key={`${entry.rank}-${entry.teamName}`} className={`rt-row ${medalClass}`}>
                <td className="rt-td rt-td-rank">
                  <span className="rt-rank-num">{entry.rank}</span>
                </td>
                <td className="rt-td">
                  <span className="rt-team-name">{entry.teamName}</span>
                </td>
                <td className="rt-td rt-td-points">
                  <span className="rt-points">{entry.points.toLocaleString("ko-KR")}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {hasMore && (
        <button
          type="button"
          className="rt-expand-btn"
          onClick={() => setExpanded((p) => !p)}
        >
          {expanded ? "접기" : "펼쳐보기"}
          <span className={`rt-expand-arrow ${expanded ? "rt-expand-arrow--up" : ""}`}>▾</span>
        </button>
      )}
    </div>
  );
}

function deriveRankings(leaderboards, period) {
  // Step 1: Flatten
  const allEntries = Object.values(leaderboards).flatMap((lb) => lb.entries);

  // Step 2: Filter by period
  const filtered = period === "all"
    ? allEntries
    : allEntries.filter((e) => isWithinPeriod(e.submittedAt, period));

  // Step 3: Group by teamName
  const teamMap = new Map();
  for (const entry of filtered) {
    const d = entry.submittedAt instanceof Date ? entry.submittedAt : new Date(entry.submittedAt);
    const entryTime = d.getTime();
    const existing = teamMap.get(entry.teamName);
    if (existing) {
      existing.points += entry.score;
      existing.lastSubmittedAt = Math.max(existing.lastSubmittedAt, entryTime);
    } else {
      teamMap.set(entry.teamName, { points: entry.score, lastSubmittedAt: entryTime });
    }
  }

  // Step 4: Sort descending, assign rank
  const sorted = Array.from(teamMap.entries())
    .map(([teamName, data]) => ({
      teamName,
      points: Math.round(data.points * SCORE_PRECISION) / SCORE_PRECISION,
      lastSubmittedAt: new Date(data.lastSubmittedAt),
      rank: 0,
    }))
    .sort((a, b) => b.points - a.points);

  sorted.forEach((entry, index) => { entry.rank = index + 1; });
  return sorted;
}

function RankingsPage({ onNavigate }) {
  const [activePeriod, setActivePeriod] = useState("all");

  const { status, data: leaderboards, retry } = usePageData(() => MOCK_LEADERBOARDS, []);

  const rankings = useMemo(
    () => leaderboards ? deriveRankings(leaderboards, activePeriod) : [],
    [leaderboards, activePeriod]
  );

  return (
    <div className="rank-page">
      <ProgressBar loading={status === "loading"} />
      <BackButton onClick={() => onNavigate("/")} />
      <div className="rank-header-row">
        <h1 className="rank-page-title">랭킹</h1>
        {status === "success" && <PeriodFilter activePeriod={activePeriod} onPeriodChange={setActivePeriod} />}
      </div>

      {status === "loading" && <TableSkeleton rows={5} />}

      {status === "error" && (
        <StatusView status="error" message="랭킹 데이터를 불러오지 못했습니다." onRetry={retry} />
      )}

      {status === "success" && <RankingTable entries={rankings} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   RotatingBanner — 5초 간격 플랜카드
   ═══════════════════════════════════════════════════════════════ */
const BANNER_SLIDES = [
  {
    title: "2026 해커톤",
    subtitle: "지금 바로 도전하세요",
    gradFrom: "#4F46E5", gradTo: "#7C3AED",
    icon: `<rect x="-20" y="-18" width="40" height="32" rx="4" stroke="white" stroke-width="1.5" fill="none"/><polyline points="-10,-4 -4,-10 2,-2 8,-8 14,-2" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="-10" cy="-10" r="3" fill="white" opacity="0.6"/>`,
  },
  {
    title: "카피바라 원정대",
    subtitle: "함께 떠나는 모험",
    gradFrom: "#059669", gradTo: "#34D399",
    icon: `<ellipse cx="0" cy="2" rx="16" ry="12" fill="white" opacity="0.25" stroke="white" stroke-width="1.5"/><circle cx="-6" cy="-2" r="2" fill="white" opacity="0.7"/><circle cx="6" cy="-2" r="2" fill="white" opacity="0.7"/><ellipse cx="0" cy="4" rx="4" ry="2.5" fill="white" opacity="0.5"/><circle cx="0" cy="-12" r="7" fill="none" stroke="white" stroke-width="1.5"/><line x1="-3" y1="-14" x2="-3" y2="-10" stroke="white" stroke-width="1" opacity="0.5"/><line x1="3" y1="-14" x2="3" y2="-10" stroke="white" stroke-width="1" opacity="0.5"/>`,
  },
];

function RotatingBanner() {
  const [index, setIndex] = useState(0);
  const [anim, setAnim] = useState("rot-banner-in");
  const dirRef = useRef("left"); // slide direction
  const touchRef = useRef(null);
  const timerRef = useRef(null);

  const goTo = useCallback((next, dir) => {
    dirRef.current = dir;
    setAnim(dir === "left" ? "rot-banner-out-left" : "rot-banner-out-right");
    setTimeout(() => {
      setIndex(next);
      setAnim(dir === "left" ? "rot-banner-out-right" : "rot-banner-out-left");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnim("rot-banner-in"));
      });
    }, 280);
  }, []);

  const goNext = useCallback(() => {
    goTo((index + 1) % BANNER_SLIDES.length, "left");
  }, [index, goTo]);

  const goPrev = useCallback(() => {
    goTo((index - 1 + BANNER_SLIDES.length) % BANNER_SLIDES.length, "right");
  }, [index, goTo]);

  // Auto rotate
  useEffect(() => {
    timerRef.current = setInterval(goNext, 5000);
    return () => clearInterval(timerRef.current);
  }, [goNext]);

  // Touch / pointer swipe
  function handlePointerDown(e) {
    touchRef.current = { x: e.clientX, time: Date.now() };
  }
  function handlePointerUp(e) {
    if (!touchRef.current) return;
    const dx = e.clientX - touchRef.current.x;
    const dt = Date.now() - touchRef.current.time;
    touchRef.current = null;
    if (Math.abs(dx) > 30 && dt < 500) {
      clearInterval(timerRef.current);
      if (dx < 0) goNext(); else goPrev();
      timerRef.current = setInterval(goNext, 5000);
    }
  }

  const slide = BANNER_SLIDES[index];
  const bg = `linear-gradient(135deg, ${slide.gradFrom}, ${slide.gradTo})`;
  const svgData = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="-30 -30 60 60">${slide.icon}</svg>`)}`;

  return (
    <div
      className="rot-banner"
      style={{ background: bg }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <div className={`rot-banner-inner ${anim}`}>
        <img className="rot-banner-icon" src={svgData} alt="" aria-hidden="true" draggable={false} />
        <div className="rot-banner-text">
          <span className="rot-banner-title">{slide.title}</span>
          <span className="rot-banner-sub">{slide.subtitle}</span>
        </div>
      </div>
      <div className="rot-banner-dots">
        {BANNER_SLIDES.map((_, i) => (
          <span
            key={i}
            className={`rot-banner-dot ${i === index ? "rot-banner-dot--active" : ""}`}
            onClick={() => {
              if (i === index) return;
              clearInterval(timerRef.current);
              goTo(i, i > index ? "left" : "right");
              timerRef.current = setInterval(goNext, 5000);
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   NavBar + FullScreenMenu
   ═══════════════════════════════════════════════════════════════ */
const NAV_LINKS = [
  { label: "해커톤", to: "/hackathons" },
  { label: "팀 찾기", to: "/camp" },
  { label: "랭킹", to: "/rankings" },
];

function NavBar({ onToggleMenu, onNavigate }) {
  return (
    <header className="navbar" role="banner">
      <button className="logo" onClick={() => onNavigate("/")} aria-label="홈으로 이동">
        <span className="logo-accent">HACK</span><span className="logo-muted">ATHON</span>
      </button>
      <button type="button" className="hamburger" onClick={onToggleMenu} aria-label="메뉴 열기">
        <span className="hamburger-line" /><span className="hamburger-line" /><span className="hamburger-line" />
      </button>
    </header>
  );
}

function FullScreenMenu({ open, onClose, currentPath, onNavigate, currentTheme, onThemeChange, colorMode, onColorModeChange }) {
  if (!open) return null;

  const [draft, setDraft] = useState({ primary: currentTheme.primary, secondary: currentTheme.secondary });

  useEffect(() => {
    setDraft({ primary: currentTheme.primary, secondary: currentTheme.secondary });
  }, [open]);

  function handleApply() {
    onThemeChange({ primary: draft.primary, secondary: draft.secondary });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="fsmenu-overlay">
      <div className="fsmenu-header">
        <button className="logo" onClick={() => { onNavigate("/"); onClose(); }} aria-label="홈으로 이동">
          <span className="logo-accent">HACK</span><span className="logo-muted">ATHON</span>
        </button>
        <button type="button" className="fsmenu-close" onClick={onClose} aria-label="메뉴 닫기">✕</button>
      </div>
      <nav className="fsmenu-nav">
        {NAV_LINKS.map(({ label, to }) => (
          <button
            key={to}
            type="button"
            className={`fsmenu-link ${currentPath === to || currentPath.startsWith(to + "/") ? "fsmenu-link--active" : ""}`}
            onClick={() => { onNavigate(to); onClose(); }}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="fsmenu-divider" />
      <div className="fsmenu-theme">
        <div className="fsmenu-theme-header">
          <span className="fsmenu-theme-title">테마 설정</span>
          <button
            type="button"
            className="theme-mode-toggle"
            onClick={() => onColorModeChange(colorMode === "dark" ? "light" : "dark")}
          >
            <span className="theme-mode-icon">{colorMode === "dark" ? "🌙" : "☀️"}</span>
            {colorMode === "dark" ? "다크" : "라이트"}
          </button>
        </div>
        <div className="theme-presets" style={{ marginBottom: 12 }}>
          {THEME_PRESETS.map((preset) => {
            const active = preset.primary === draft.primary && preset.secondary === draft.secondary;
            return (
              <button
                key={preset.name}
                type="button"
                className={`theme-preset-btn ${active ? "theme-preset-btn--active" : ""}`}
                onClick={() => setDraft({ primary: preset.primary, secondary: preset.secondary })}
                aria-pressed={active}
              >
                <span className="theme-swatch-pair">
                  <span className="theme-swatch" style={{ background: preset.primary }} />
                  <span className="theme-swatch" style={{ background: preset.secondary }} />
                </span>
                {preset.name}
              </button>
            );
          })}
        </div>
        <div className="theme-custom-row">
          <div className="theme-color-input-wrap">
            <span className="theme-color-label">Primary</span>
            <input type="color" className="theme-color-input" value={draft.primary}
              onChange={(e) => setDraft((d) => ({ ...d, primary: e.target.value }))} />
          </div>
          <div className="theme-color-input-wrap">
            <span className="theme-color-label">Secondary</span>
            <input type="color" className="theme-color-input" value={draft.secondary}
              onChange={(e) => setDraft((d) => ({ ...d, secondary: e.target.value }))} />
          </div>
          <button type="button" className="theme-apply-btn" onClick={handleApply}>적용</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   App (Router)
   ═══════════════════════════════════════════════════════════════ */

export default function App() {
  const [path, setPath] = useState("/");
  const [showBanner, setShowBanner] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  /* ★ 투톤 테마 상태 — localStorage 저장 */
  const [theme, setTheme] = useLocalState("theme", { primary: THEME_PRESETS[0].primary, secondary: THEME_PRESETS[0].secondary });
  const [colorMode, setColorMode] = useLocalState("colorMode", "light");
  const tokens = useMemo(() => buildTokens(theme.primary, theme.secondary, colorMode), [theme, colorMode]);
  const css = useMemo(() => buildCss(tokens), [tokens]);

  /* ★ 아이콘 크기 상태 — localStorage 저장 */
  const [iconSize, setIconSize] = useLocalState("iconSize", DEFAULT_ICON_SIZE);
  const iconSizePx = ICON_SIZE_OPTIONS.find((o) => o.value === iconSize)?.px ?? 24;

  const navigate = (to) => { setPath(to); window.scrollTo(0, 0); };
  const persistenceError = showBanner ? "localStorage 쓰기에 실패했습니다. 변경사항이 저장되지 않을 수 있습니다." : null;

  const renderContent = () => {
    if (path === "/") return <MainPage onNavigate={navigate} />;
    if (path === "/hackathons") return <HackathonListPage onNavigate={navigate} iconSize={iconSize} onIconSizeChange={setIconSize} />;
    if (path.startsWith("/hackathons/")) {
      const slug = path.replace("/hackathons/", "");
      return <HackathonDetailPage slug={slug} onNavigate={navigate} iconSizePx={iconSizePx} />;
    }
    if (path === "/camp" || path.startsWith("/camp?")) {
      const qIdx = path.indexOf("?");
      let initFilter = "all";
      if (qIdx > -1) {
        const params = new URLSearchParams(path.slice(qIdx));
        initFilter = params.get("hackathon") || "all";
      }
      return <CampPage onNavigate={navigate} initialFilter={initFilter} />;
    }
    if (path === "/rankings") return <RankingsPage onNavigate={navigate} />;
    return (
      <div className="page-placeholder">
        <h2>404</h2>
        <p>페이지를 찾을 수 없습니다.</p>
      </div>
    );
  };

  return (
    <>
      <style>{css}</style>
      <div className={`shell${showBanner ? " has-banner" : ""}`}>
        <NavBar onToggleMenu={() => setMenuOpen(true)} onNavigate={navigate} />
        <RotatingBanner />
        <FullScreenMenu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          currentPath={path}
          onNavigate={navigate}
          currentTheme={theme}
          onThemeChange={setTheme}
          colorMode={colorMode}
          onColorModeChange={setColorMode}
        />
        {persistenceError !== null && (
          <div role="alert" aria-live="assertive" className="banner">
            <span className="banner-icon" aria-hidden="true">⚠</span>{persistenceError}
          </div>
        )}
        <main className="shell-content">{renderContent()}</main>
      </div>
    </>
  );
}
