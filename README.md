# CodeNarrator

비전공자를 위한 코드 설명 CLI 도구. 코드 파일을 넘기면 단계별 스토리텔링 형식으로 설명해준다.

## 설치

```bash
npm install
cp .env.example .env
# .env 파일에 API 키 입력
```

## 사용법

```bash
# 파일 설명
node bin/code-narrator.js explain ./src/index.js

# 특정 부분만 설명
node bin/code-narrator.js explain ./src/index.js --focus "explain 함수"

# 언어 직접 지정
node bin/code-narrator.js explain ./script --lang python

# stdin으로 코드 붙여넣기
echo "def greet(name): return f'Hello, {name}!'" | node bin/code-narrator.js stdin --lang python
```

## AI 교체 방법

기본값은 **Google Gemini** (무료 티어 제공).
다른 AI로 교체하려면 `src/narrator.js`를 수정하면 된다.

---

### 1. Google Gemini (기본, 무료)

**API 키 발급:** https://aistudio.google.com/apikey

```env
# .env
GEMINI_API_KEY=your-key
```

```js
// src/narrator.js
import { GoogleGenerativeAI } from '@google/generative-ai'
import { buildSystemPrompt } from './prompts/system.js'

export async function explain({ code, lang, focus }) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: buildSystemPrompt(lang, focus),
  })
  const result = await model.generateContent(
    `다음 ${lang} 코드를 설명해줘:\n\n\`\`\`${lang}\n${code}\n\`\`\``
  )
  return result.response.text()
}
```

```bash
npm install @google/generative-ai
```

---

### 2. Anthropic Claude (유료)

**API 키 발급:** https://console.anthropic.com

```env
# .env
ANTHROPIC_API_KEY=your-key
```

```js
// src/narrator.js
import Anthropic from '@anthropic-ai/sdk'
import { buildSystemPrompt } from './prompts/system.js'

export async function explain({ code, lang, focus }) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: buildSystemPrompt(lang, focus),
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

```bash
npm install @anthropic-ai/sdk
```

---

### 3. OpenAI GPT (유료, 일부 무료 크레딧)

**API 키 발급:** https://platform.openai.com/api-keys

```env
# .env
OPENAI_API_KEY=your-key
```

```js
// src/narrator.js
import OpenAI from 'openai'
import { buildSystemPrompt } from './prompts/system.js'

export async function explain({ code, lang, focus }) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: buildSystemPrompt(lang, focus) },
      {
        role: 'user',
        content: `다음 ${lang} 코드를 설명해줘:\n\n\`\`\`${lang}\n${code}\n\`\`\``,
      },
    ],
  })
  return response.choices[0].message.content
}
```

```bash
npm install openai
```

---

### 4. Groq (무료 티어, 빠름)

**API 키 발급:** https://console.groq.com

```env
# .env
GROQ_API_KEY=your-key
```

```js
// src/narrator.js
import Groq from 'groq-sdk'
import { buildSystemPrompt } from './prompts/system.js'

export async function explain({ code, lang, focus }) {
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY })
  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: buildSystemPrompt(lang, focus) },
      {
        role: 'user',
        content: `다음 ${lang} 코드를 설명해줘:\n\n\`\`\`${lang}\n${code}\n\`\`\``,
      },
    ],
  })
  return response.choices[0].message.content
}
```

```bash
npm install groq-sdk
```

---

## 지원 언어

JavaScript, TypeScript, Python, Go, Java, C, C++, PHP, Rust, Ruby

## 개발 로드맵

### Phase 1 — CLI
- [x] 파일 설명 (`explain <file>`)
- [x] stdin 입력 지원
- [x] 언어 자동 감지
- [x] `--focus` 옵션으로 특정 부분만 설명

### Phase 2 — CLI 확장
- [x] `--output json` 옵션
- [x] 여러 파일 한 번에 설명
- [x] 스트리밍 출력 (`--stream`)

### Phase 3 — VS Code 확장
- [x] 코드 블록 우클릭 → "CodeNarrator: 이 코드 설명해줘"
- [x] 선택 코드 우클릭 → "CodeNarrator: 선택한 코드 설명해줘"
- [x] 사이드 패널에 설명 표시
- [x] 스트리밍 출력 (응답 오는 대로 실시간 표시)
