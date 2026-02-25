# CodeNarrator — Claude Code 프롬프트

비전공자를 위한 코드 설명 도구. 코드를 붙여넣으면 각 부분을 단계별 스토리텔링 형식으로 설명해준다.
CLI 먼저 구현, 이후 VS Code 확장으로 확장.

---

## 프로젝트 구조

```
code-narrator/
├── src/
│   ├── index.js          # CLI 진입점
│   ├── narrator.js       # Claude API 호출 + 설명 생성 핵심 로직
│   ├── detector.js       # 언어 자동 감지
│   ├── formatter.js      # 출력 포맷 (터미널 컬러, 단계별 출력)
│   └── prompts/
│       ├── system.js     # Claude 시스템 프롬프트
│       └── templates.js  # 언어별 설명 템플릿 힌트
├── bin/
│   └── code-narrator.js  # npx 실행 진입점
├── package.json
├── .env.example
└── README.md
```

---

## 설치 및 환경

```bash
# 프로젝트 생성
mkdir code-narrator && cd code-narrator
npm init -y

# 의존성
npm install @anthropic-ai/sdk commander chalk ora dotenv
npm install -D eslint
```

### package.json

```json
{
  "name": "code-narrator",
  "version": "0.1.0",
  "description": "비전공자를 위한 코드 설명 도구",
  "type": "module",
  "bin": {
    "code-narrator": "bin/code-narrator.js"
  },
  "main": "src/index.js",
  "scripts": {
    "start": "node bin/code-narrator.js",
    "dev": "node --watch bin/code-narrator.js"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### .env.example

```
ANTHROPIC_API_KEY=your-api-key-here
```

---

## 구현 코드

### bin/code-narrator.js

```javascript
#!/usr/bin/env node
import '../src/index.js'
```

### src/index.js

```javascript
import { program } from 'commander'
import { readFileSync } from 'fs'
import { explain } from './narrator.js'
import { detectLanguage } from './detector.js'
import { printResult } from './formatter.js'
import 'dotenv/config'

program
  .name('code-narrator')
  .description('비전공자를 위한 코드 설명 도구')
  .version('0.1.0')

// 파일을 직접 넘기는 방식
// 예: code-narrator explain ./src/index.js
program
  .command('explain <file>')
  .description('파일을 읽어서 코드를 설명해줍니다')
  .option('-l, --lang <language>', '언어 직접 지정 (자동 감지 가능)')
  .option('-f, --focus <part>', '특정 함수나 섹션만 설명 (예: "login function")')
  .action(async (file, options) => {
    try {
      const code = readFileSync(file, 'utf-8')
      const lang = options.lang || detectLanguage(file, code)
      const result = await explain({ code, lang, focus: options.focus })
      printResult(result, lang, file)
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.error(`❌ 파일을 찾을 수 없어요: ${file}`)
      } else {
        console.error(`❌ 오류: ${err.message}`)
      }
      process.exit(1)
    }
  })

// 코드를 직접 붙여넣는 방식 (stdin)
// 예: echo "def greet(): pass" | code-narrator stdin --lang python
program
  .command('stdin')
  .description('표준 입력으로 코드를 받아 설명해줍니다')
  .option('-l, --lang <language>', '언어 지정', 'javascript')
  .option('-f, --focus <part>', '특정 부분만 설명')
  .action(async (options) => {
    const chunks = []
    for await (const chunk of process.stdin) chunks.push(chunk)
    const code = Buffer.concat(chunks).toString('utf-8').trim()

    if (!code) {
      console.error('❌ 코드가 없어요. 파이프로 코드를 전달해주세요.')
      process.exit(1)
    }

    const result = await explain({ code, lang: options.lang, focus: options.focus })
    printResult(result, options.lang, 'stdin')
  })

program.parse()
```

### src/detector.js

```javascript
import { extname } from 'path'

const EXT_MAP = {
  '.js':  'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts':  'typescript',
  '.tsx': 'typescript',
  '.py':  'python',
  '.go':  'go',
  '.java':'java',
  '.cpp': 'cpp',
  '.cc':  'cpp',
  '.cxx': 'cpp',
  '.c':   'c',
  '.h':   'c',
  '.php': 'php',
  '.rs':  'rust',
  '.rb':  'ruby',
}

// 확장자로 1차 감지, 내용으로 2차 감지
export function detectLanguage(filename, code = '') {
  const ext = extname(filename).toLowerCase()
  if (EXT_MAP[ext]) return EXT_MAP[ext]

  // 확장자 없을 때 코드 내용으로 추측
  if (code.includes('def ') && code.includes(':')) return 'python'
  if (code.includes('func ') && code.includes('package ')) return 'go'
  if (code.includes('public class') || code.includes('import java')) return 'java'
  if (code.startsWith('<?php') || code.includes('<?php')) return 'php'
  if (code.includes('#include') && code.includes('std::')) return 'cpp'
  if (code.includes('#include') && code.includes('int main')) return 'c'
  if (code.includes('const ') || code.includes('let ') || code.includes('=>')) return 'javascript'

  return 'unknown'
}
```

### src/prompts/system.js

```javascript
// Claude에게 주는 시스템 프롬프트
// 비전공자를 위한 단계별 스토리텔링 형식으로 설명하도록 지시
export const SYSTEM_PROMPT = `
당신은 코드를 처음 보는 비전공자에게 설명해주는 친절한 선생님이에요.

## 설명 규칙

1. **단계별 스토리텔링** 형식으로 설명해요.
   - 각 단계는 "1️⃣", "2️⃣", "3️⃣" 이모지 번호로 시작해요.
   - 전체 코드의 목적을 먼저 한 문장으로 설명해요 (## 이 코드가 하는 일).
   - 그 다음 중요한 부분을 순서대로 단계별로 설명해요.

2. **비유와 일상 언어** 를 적극 활용해요.
   - 함수/메서드 → "기능 상자" 또는 "레시피"
   - 변수 → "이름표 붙은 통"
   - 배열/리스트 → "순서가 있는 목록" 또는 "줄 세운 것"
   - 객체/딕셔너리 → "라벨이 붙은 서랍장"
   - 반복문 → "같은 작업을 여러 번 반복하는 기계"
   - 조건문 → "갈림길 표지판"
   - return → "결과물을 밖으로 내보내기"
   - import/require → "다른 도구 상자 빌려오기"
   - 클래스 → "같은 종류를 만드는 틀"
   - async/await → "결과를 기다렸다가 다음 작업 진행"
   - PHP의 $변수 → "달러 표시가 붙은 이름표 (PHP만의 규칙이에요)"
   - PHP의 echo → "화면에 글자를 출력하는 명령"
   - PHP의 -> → "클래스 안의 기능을 꺼내 쓸 때 쓰는 화살표"
   - PHP의 :: → "클래스 자체에서 바로 꺼내 쓸 때 (인스턴스 없이)"
   - Go의 := → "새 변수를 만들면서 값을 동시에 넣는 단축 방식"
   - Go의 goroutine → "동시에 여러 일을 처리하는 독립 일꾼"
   - C/C++의 포인터 * → "값이 저장된 메모리 주소를 가리키는 화살표"
   - C/C++의 & → "변수의 메모리 주소 자체를 넘길 때"
   - Java의 interface → "반드시 구현해야 할 기능 목록을 정해놓은 계약서"
   - Java의 throws → "이 기능은 문제가 생길 수 있으니 호출한 곳에서 처리해달라는 신호"

3. **문법 기호 설명** 을 자연스럽게 포함해요.
   - 괄호 (), 대괄호 [], 중괄호 {} 가 나오면 왜 쓰는지 짧게 설명해요.
   - 콜론 :, 화살표 =>, 점 ., 세미콜론 ; 의 의미를 풀어써요.
   - PHP의 ->와 :: 는 처음 보면 낯설 수 있으니 꼭 설명해요.

4. **어려운 전문 용어는 피해요**.
   - 꼭 써야 한다면 괄호 안에 비전공자 언어로 부연 설명을 달아요.
   - 예: "재귀 함수 (자기 자신을 다시 부르는 함수)"

5. **칭찬과 격려** 를 자연스럽게 섞어요.
   - "이 부분이 이 코드의 핵심이에요!", "여기서 영리한 방법을 쓰고 있어요" 같은 표현

## 출력 형식

\`\`\`
## 이 코드가 하는 일
(한 문장 요약)

## 단계별 설명

1️⃣ (첫 번째 중요 부분 제목)
(설명 2~3줄. 비유 포함.)

2️⃣ (두 번째 중요 부분 제목)
(설명 2~3줄.)

...

## 💡 핵심 포인트
(이 코드에서 가장 중요한 개념 1~2가지를 한 줄씩)
\`\`\`

언어: {lang}
${'{focus}' ? '특히 이 부분에 집중해서 설명해줘: {focus}' : ''}
`.trim()

export function buildSystemPrompt(lang, focus = '') {
  return SYSTEM_PROMPT
    .replace('{lang}', lang)
    .replace(/\$\{'\{focus\}'.*?\}/s, focus ? `특히 이 부분에 집중해서 설명해줘: ${focus}` : '')
}
```

### src/narrator.js

```javascript
import Anthropic from '@anthropic-ai/sdk'
import { buildSystemPrompt } from './prompts/system.js'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function explain({ code, lang, focus }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY가 설정되지 않았어요.\n' +
      '.env 파일에 ANTHROPIC_API_KEY=your-key 를 추가해주세요.'
    )
  }

  const systemPrompt = buildSystemPrompt(lang, focus)

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `다음 ${lang} 코드를 설명해줘:\n\n\`\`\`${lang}\n${code}\n\`\`\``,
      },
    ],
  })

  return message.content[0].text
}
```

### src/formatter.js

```javascript
import chalk from 'chalk'

export function printResult(text, lang, source) {
  // 상단 헤더
  console.log('\n' + chalk.bgBlue.white.bold(` 📖 CodeNarrator `))
  console.log(chalk.dim(`  파일: ${source}  언어: ${lang}\n`))

  // 마크다운 스타일 파싱해서 컬러 출력
  const lines = text.split('\n')

  for (const line of lines) {
    if (line.startsWith('## ')) {
      // 섹션 제목
      console.log('\n' + chalk.cyan.bold(line.replace('## ', '📌 ')))
    } else if (/^[1-9]️⃣/.test(line)) {
      // 단계 제목 (이모지 번호로 시작)
      console.log('\n' + chalk.yellow.bold(line))
    } else if (line.startsWith('- ') || line.startsWith('• ')) {
      // 불릿 항목
      console.log(chalk.dim('  · ') + line.slice(2))
    } else if (line.trim() === '') {
      console.log()
    } else {
      console.log('  ' + line)
    }
  }

  console.log('\n' + chalk.dim('─'.repeat(50)) + '\n')
}
```

---

## 실행 예시

```bash
# 1. 환경 변수 설정
cp .env.example .env
# ANTHROPIC_API_KEY 입력

# 2. 로컬 실행 (파일 설명)
node bin/code-narrator.js explain ./src/narrator.js

# 3. 특정 부분만 설명
node bin/code-narrator.js explain ./src/narrator.js --focus "explain 함수"

# 4. stdin으로 코드 붙여넣기 (Python)
echo "
def greet(name):
    return f'Hello, {name}!'
" | node bin/code-narrator.js stdin --lang python

# 5. PHP 파일 설명
node bin/code-narrator.js explain ./index.php

# 6. C++ 파일 설명
node bin/code-narrator.js explain ./main.cpp --focus "main 함수"

# 5. 다른 프로젝트 파일 설명
node bin/code-narrator.js explain ../trip-planner/backend/src/routes/auth.js
```

### 출력 예시

```
 📖 CodeNarrator 
  파일: ./example.py  언어: python

📌 이 코드가 하는 일
이름을 받아서 인사말을 만들어 돌려주는 간단한 기능이에요.

📌 단계별 설명

1️⃣ 기능 상자 만들기 — def greet(name)
  "greet"라는 이름의 기능 상자를 만들어요.
  소괄호 () 안의 "name"은 이 상자가 받을 재료예요.
  마치 "이름을 주면 인사말을 만들어드립니다"라는 서비스 창구 같아요.

2️⃣ 빈칸 채우기 문자열 — f"Hello, {name}!"
  f 로 시작하는 문자열은 특별해요.
  중괄호 {} 안에 변수를 넣으면 자동으로 값이 채워져요.
  예: name이 "루까"라면 → "Hello, 루까!" 가 완성돼요.

3️⃣ 결과물 내보내기 — return
  return은 "이 결과물을 밖으로 돌려준다"는 뜻이에요.
  상자가 완성된 인사말을 요청한 곳으로 전달하는 거예요.

📌 💡 핵심 포인트
  · f-string: 파이썬에서 문자열에 변수를 끼워넣는 가장 현대적인 방법
  · return: 함수의 결과를 외부로 전달하는 필수 키워드

──────────────────────────────────────────────────
```

---

## 개발 로드맵

### Phase 1 — CLI (현재)
- [x] 파일 설명 (`explain <file>`)
- [x] stdin 입력 지원
- [x] 언어 자동 감지
- [x] `--focus` 옵션으로 특정 부분만 설명
- [x] 지원 언어: Python, JavaScript, TypeScript, Go, Java, C, C++, PHP

### Phase 2 — CLI 확장
- [ ] `--output json` 옵션 (JSON으로 저장)
- [ ] 여러 파일 한 번에 설명 (`explain src/*.js`)
- [ ] 설명 히스토리 저장 (`~/.code-narrator/history`)
- [ ] 스트리밍 출력 (답변이 타이핑되듯 실시간 출력)

### Phase 3 — VS Code 확장
- [ ] 드래그한 코드 블록 우클릭 → "Explain this code"
- [ ] 사이드 패널에 설명 표시
- [ ] 코드 위에 인라인 설명 토글
- [ ] 언어 자동 감지 (VS Code API 활용)

---

## npm 배포 준비 (Phase 2 완료 후)

```json
{
  "files": ["bin/", "src/", "README.md", "LICENSE"],
  "keywords": ["code", "explain", "beginner", "education", "ai", "claude"]
}
```

```bash
# 배포
npm publish --access public

# 설치 후 사용
npx code-narrator explain ./my-file.js
```

---

## Claude Code에서 실행 순서

```
1. mkdir code-narrator && cd code-narrator
2. 위 package.json 생성
3. npm install
4. src/, bin/ 구조대로 파일 생성
5. cp .env.example .env → API 키 입력
6. node bin/code-narrator.js explain <테스트 파일 경로>
7. 정상 동작 확인 후 GitHub 업로드
```
