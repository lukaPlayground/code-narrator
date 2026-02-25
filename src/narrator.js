import Groq from 'groq-sdk'
import { buildSystemPrompt } from './prompts/system.js'

function getClient() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error(
      'GROQ_API_KEY가 설정되지 않았어요.\n' +
      '.env 파일에 GROQ_API_KEY=your-key 를 추가해주세요.\n' +
      'API 키 발급: https://console.groq.com/keys'
    )
  }
  return new Groq({ apiKey: process.env.GROQ_API_KEY })
}

const MESSAGES = (code, lang, focus) => [
  { role: 'system', content: buildSystemPrompt(lang, focus) },
  { role: 'user', content: `다음 ${lang} 코드를 설명해줘:\n\n\`\`\`${lang}\n${code}\n\`\`\`` },
]

// 일반 호출 (전체 응답 반환)
export async function explain({ code, lang, focus }) {
  const client = getClient()
  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: MESSAGES(code, lang, focus),
  })
  return response.choices[0].message.content
}

// 스트리밍 호출 (청크 단위로 콜백 호출)
export async function explainStream({ code, lang, focus, onChunk }) {
  const client = getClient()
  const stream = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    stream: true,
    messages: MESSAGES(code, lang, focus),
  })

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content || ''
    if (text) onChunk(text)
  }
}
