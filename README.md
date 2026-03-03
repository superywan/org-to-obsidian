# org-to-obsidian

jw.org 및 WOL(Watchtower Online Library)의 한국어 콘텐츠를 Obsidian Vault로 임포트하는 Node.js 스크립트입니다.

## 주요 기능

- **15종 콘텐츠 임포트**: 서적, 성경, 파수대, 깨어라, 통찰, 집회 교재, 영상 자막 등
- **내부 링크 자동 변환**: WOL HTML의 모든 참조를 Obsidian wikilink(`[[path|text]]`)로 변환
- **성구 인라인 태그**: 성경 참조 옆에 `#성구/창세기/3/15` 형태의 계층 태그 자동 생성
- **웹 UI**: 브라우저에서 카테고리/항목 선택 + 실시간 로그

## 사용법

### 사전 준비

1. Node.js 설치
2. 의존성 설치:
   ```bash
   npm install
   ```
3. `constant.js`에서 Vault 경로를 본인의 Obsidian Vault 경로로 수정:
   ```js
   export const VAULT_BASE = "/path/to/your/Obsidian Vault/";
   ```

### 웹 UI로 실행 (권장)

```bash
node server.js
```

브라우저에서 `http://localhost:3000`을 열면:
- 각 카테고리별 토글로 임포트 대상 선택
- 세부 항목(연도, 출판물 등) 선택 가능
- 실시간 로그 스트리밍으로 진행 상황 확인

### CLI로 실행

```bash
node main.js
```

영상, 서적, 통찰 3종만 임포트합니다. 전체 카테고리 임포트는 웹 UI를 사용하세요.

### 처음부터 다시 임포트하기

캐시 파일(JSON)은 유지하고 Vault의 `.md` 파일만 삭제하면 됩니다:

```bash
rm -rf /path/to/vault/library/org-*/
```

이후 서버를 실행하여 임포트하면 새 파일이 생성됩니다.

## 작동 원리

### 2단계 처리 파이프라인

**Phase 1 — docId 매핑 구축**
1. WOL 루트 페이지에서 각 섹션(서적, 파수대 등)의 현재 URL을 동적으로 해석
2. 선택된 카테고리의 출판물 구조를 크롤링
3. 각 문서의 docId와 Vault 파일 경로를 매핑하여 `docid-map.json`에 저장

**Phase 2 — 콘텐츠 임포트**
1. 각 문서의 HTML을 WOL에서 가져옴
2. HTML을 Markdown으로 변환 (cheerio 파싱)
3. 내부 `<a>` 태그를 wikilink로 변환 (Phase 1의 매핑 활용)
4. 성경 참조에 인라인 태그 추가
5. `/wol/pc/`, `/wol/tc/` 리다이렉트 링크를 배치로 해결
6. `.md` 파일로 저장 (이미 존재하는 파일은 스킵)

### 데이터 소스

| 소스 | 용도 |
|---|---|
| `b.jw-cdn.org` | JWT 토큰, 영상 카테고리/자막 |
| `wol.jw.org` | 출판물 구조, 문서 HTML, 성경 |

언어는 한국어(`KO`, `r8/lp-ko`)로 고정되어 있습니다.

### 캐시 파일

| 파일 | 용도 | 비고 |
|---|---|---|
| `docid-map.json` | docId ↔ Vault 경로 매핑 | Phase 1에서 자동 생성/갱신 |
| `redirect-cache.json` | WOL 리다이렉트 결과 캐시 | 네트워크 요청 절약 (수 만 건) |
| `book-name-map.json` | 성경 책이름 → 번호 매핑 | 성경 임포트 시 자동 생성 |

## 프로젝트 구조

```
├── server.js          # HTTP 서버 (웹 UI + SSE 로그 + 임포트 API)
├── main.js            # CLI 진입점 (영상/서적/통찰)
├── index.html         # 웹 UI (카테고리 선택 + 실시간 로그)
├── constant.js        # Vault 경로 상수
├── requests.js        # jw.org/WOL API 요청 (axios)
├── docid-map.js       # docId 매핑, HTML→MD 파싱, 링크 변환, 성구 태그
├── wol-sections.js    # WOL 섹션 URL 동적 해석
├── importers/         # 카테고리별 임포터 (15종)
│   ├── video.js
│   ├── books.js
│   ├── bible.js
│   ├── insight.js
│   ├── watchtower.js
│   ├── awake.js
│   ├── meeting.js
│   ├── kingdom-service.js
│   ├── programs.js
│   ├── brochures.js
│   ├── tracts.js
│   ├── web-series.js
│   ├── guidelines.js
│   ├── glossary.js
│   └── wol-index.js
├── docid-map.json     # [자동 생성] docId 매핑 캐시
├── redirect-cache.json # [자동 생성] 리다이렉트 캐시
└── book-name-map.json  # [자동 생성] 성경 책이름 매핑
```

## 변경 이력

<details>
<summary><strong>v1.2</strong> — 단락 딥링크 + 영상 자막 성구 태그</summary>

### 단락 블록 ID 및 딥링크

모든 기사(서적, 통찰, 파수대, 색인 등)의 단락에 Obsidian 블록 ID(`^pN`)를 추가하여 단락 수준 딥링크를 지원합니다.

```
# 제목 ^p1

첫 번째 단락입니다. ^p2

[[library/org-insight/아/요한의 편지들#^p15|통-2 549]]
```

- `parseArticleContent()`에서 `<p id="p1">`, `<h1 id="p5">` 등의 HTML ID를 `^pN` 블록 ID로 변환
- `resolveLink()`에서 URL fragment(`#pN`, `#h=N:...`)를 Obsidian fragment(`#^pN`)로 변환
- `/wol/pc/`, `/wol/tc/` 리다이렉트 URL의 fragment를 캐시에 보존

색인 기사에서 링크를 클릭하면 대상 기사의 **해당 단락**으로 바로 이동합니다.

### 영상 자막 성구 태그

비디오 자막의 평문 텍스트에서 성구 참조를 자동 감지하여 wikilink와 태그를 추가합니다.

**변환 전:**
```
예수께선 요한복음 14:1의 이러한 위로가 되는 말씀을 하십니다.
```

**변환 후:**
```
예수께선 [[.../요한복음 14장#^v1|요한복음 14:1]] #성구/요한복음/14/1 의 이러한 위로가 되는 말씀을 하십니다.
```

지원하는 자막 성구 패턴:

| 패턴 | 예시 |
|------|------|
| 장:절 | `요한복음 14:1`, `시편 83:18` |
| 절 범위 | `마태복음 6:25-33` |
| 절 나열 | `요한복음 5:28, 29` |
| 장경계 범위 | `이사야 9:1–10:15` |
| 복합 책이름 | `고린도 전서 13:4`, `베드로 후서 2:9` |
| 접미사 생략형 | `마태 6:33`, `히브리 11:1` |
| 장/절 형식 | `히브리서 11장 24절` |
| 편/절 형식 (시편) | `시편 91편 11절` |

- 한글 조사 앞의 오탐 방지 (`(?<![가-힣])` lookbehind)
- `BOOK_ABBREV_MAP` + `book-name-map.json`의 150+ 책이름 변형 지원

</details>

<details>
<summary><strong>v1.1</strong> — 성구 인라인 태그</summary>

### 성구 인라인 태그

성경 구절을 참조하는 모든 wikilink 옆에 Obsidian 태그를 자동 생성합니다.

```
([[...|창세 3:15]] #성구/창세기/3/15 [[...|계시 12:13,]] #성구/요한계시록/12/13)
```

Obsidian의 태그 계층 구조를 활용한 검색:

| 검색 | 결과 |
|---|---|
| `#성구` | 성경을 인용한 모든 문서 |
| `#성구/창세기` | 창세기를 인용한 모든 문서 |
| `#성구/창세기/3` | 창세기 3장을 인용한 모든 문서 |
| `#성구/창세기/3/15` | 창세기 3:15를 인용한 모든 문서 |

지원하는 참조 패턴:

- 단일 절: `창세 3:15` → `#성구/창세기/3/15`
- 범위: `창세 3:15-17` → `#성구/창세기/3/15` `#성구/창세기/3/16` `#성구/창세기/3/17`
- 쉼표 구분: `대첫 17:1, 2` → `#성구/역대기상/17/1` `#성구/역대기상/17/2`
- 장 참조: `다니엘 4장` → `#성구/다니엘/4`
- 장 범위: `창세 6-9장` → `#성구/창세기/6` ~ `#성구/창세기/9`
- 장경계 범위: `여호수아 9:1–10:15` → `#성구/여호수아/9` + `#성구/여호수아/10/1` ~ `#성구/여호수아/10/15`
- 이어지는 참조: 이전 링크의 책/장 컨텍스트를 추적하여 `17`만 있어도 정확한 태그 생성

</details>

<details>
<summary><strong>v1.0</strong> — 최초 릴리스</summary>

### 지원 콘텐츠 (15종)

| 카테고리 | 설명 | Vault 폴더 |
|---|---|---|
| 영상 자막 | jw.org 비디오 자막 (VTT → MD) | `org-videos/` |
| 서적 | 출판물 서적 전체 | `org-books/` |
| 통찰 | 성경 통찰 사전 | `org-insight/` |
| 파수대 | 파수대 잡지 (연도별) | `org-watchtower/` |
| 깨어라 | 깨어라 잡지 (연도별) | `org-awake/` |
| 집회 교재 | 집회 교재 | `org-meeting/` |
| 왕국 봉사 | 왕국 봉사 | `org-kingdom-service/` |
| 프로그램 | 대회/행사 프로그램 | `org-programs/` |
| 팜플렛 | 팜플렛/소책자 | `org-brochures/` |
| 전도지 | 전도지 | `org-tracts/` |
| 연재 기사 | 웹 연재 시리즈 | `org-web-series/` |
| 지침 | 지침서 | `org-guidelines/` |
| 용어 설명 | 용어 해설 | `org-glossary/` |
| 색인 | WOL 색인 | `org-index/` |
| 성경 | 신세계역 성경 전권 | `org-bible/` |

### 내부 링크 변환

WOL HTML의 모든 내부 참조를 Obsidian wikilink로 자동 변환합니다.

- **출판물 간 링크**: docId 매핑을 통해 출판물 사이의 상호 참조를 wikilink로 연결
- **성경 구절 링크**: 절 수준 앵커(`#^v15`)까지 정확하게 연결
- **리다이렉트 해결**: `/wol/pc/`, `/wol/tc/` 간접 링크를 실제 대상으로 해석 (캐시 지원)

### 웹 UI

브라우저 기반 UI로 카테고리/세부 항목 선택, SSE 실시간 로그 스트리밍 지원.

</details>
