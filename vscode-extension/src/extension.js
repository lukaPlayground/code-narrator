const vscode = require('vscode')
const https = require('https')

// 언어 감지
function detectLanguage(langId) {
  const map = {
    javascript: 'javascript', typescript: 'typescript',
    python: 'python', go: 'go', java: 'java',
    cpp: 'cpp', c: 'c', php: 'php', rust: 'rust', ruby: 'ruby',
  }
  return map[langId] || langId || 'unknown'
}

// 시스템 프롬프트
function buildSystemPrompt(lang, focus) {
  let prompt = `당신은 코드를 처음 보는 비전공자에게 설명해주는 선생님입니다.

[필수 규칙]
- 인사말, 도입부 없이 바로 설명 시작
- 이모지, 이모티콘 사용 금지
- 아래 형식을 반드시 따를 것

[출력 형식]
## 이 코드가 하는 일
(한 문장 요약)

## 단계별 설명

Step 1. (제목)
(설명 2~3줄)

Step 2. (제목)
(설명 2~3줄)

## 핵심 포인트
- (핵심 개념 1)
- (핵심 개념 2)

[설명 스타일]
- 함수 -> 기능 상자, 변수 -> 이름표 붙은 통, 배열 -> 순서 있는 목록
- 전문 용어는 괄호로 풀어서 설명
- 언어: ${lang}`

  if (focus) prompt += `\n- 특히 이 부분에 집중: ${focus}`
  return prompt
}

// 일반 API 호출
function callGroq(apiKey, messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: 'llama-3.3-70b-versatile', messages })

    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          if (json.error) reject(new Error(json.error.message))
          else resolve(json.choices[0].message.content)
        } catch (e) {
          reject(new Error('응답 파싱 실패'))
        }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// 스트리밍 API 호출 (SSE 파싱)
function callGroqStream(apiKey, messages, onChunk) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, stream: true })

    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let buffer = ''

      res.on('data', (chunk) => {
        buffer += chunk.toString('utf8')
        const lines = buffer.split('\n')
        buffer = lines.pop() // 마지막 불완전 라인은 버퍼에 보관

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const json = JSON.parse(data)
            const text = json.choices[0]?.delta?.content || ''
            if (text) onChunk(text)
          } catch (_) {}
        }
      })

      res.on('end', resolve)
    })

    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// 마크다운 -> HTML (라인 단위)
function markdownToHtml(text) {
  return text.split('\n').map(line => {
    const safe = line
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

    if (safe.startsWith('## ')) return `<h2>${safe.slice(3)}</h2>`
    if (/^Step\s+\d+\./.test(safe)) return `<div class="step">${safe}</div>`
    if (safe.startsWith('- ') || safe.startsWith('* ')) return `<li>${safe.slice(2)}</li>`
    if (safe.trim() === '') return '<br>'
    return `<p>${safe}</p>`
  }).join('\n')
}

// WebView HTML (스트리밍 지원 - enableScripts: true 필요)
function getWebviewHtml(lang, source) {
  // script-src 'unsafe-inline' 필요 (postMessage 수신 JS)
  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';`

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodeNarrator</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px; line-height: 1.75;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 20px; max-width: 760px;
    }
    .header {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-radius: 6px; padding: 10px 14px;
      margin-bottom: 14px; font-weight: 700; font-size: 14px;
    }
    .meta { font-size: 12px; opacity: 0.5; margin-bottom: 18px; }
    h2 {
      font-size: 13px; font-weight: 700;
      color: var(--vscode-textLink-foreground);
      border-bottom: 1px solid var(--vscode-widget-border, #444);
      padding-bottom: 4px; margin: 20px 0 8px;
    }
    p { margin: 4px 0; }
    li { margin-left: 18px; margin-bottom: 3px; }
    br { display: block; margin: 4px 0; content: ''; }
    .step {
      background: var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.05));
      border-left: 3px solid var(--vscode-textLink-foreground);
      padding: 8px 12px; border-radius: 0 5px 5px 0;
      margin: 10px 0 4px; font-weight: 600;
    }
    /* 스트리밍 중: 날것의 텍스트 */
    #stream-raw {
      white-space: pre-wrap;
      font-family: inherit;
      opacity: 0.85;
    }
    /* 커서 깜빡임 */
    .cursor {
      display: inline-block;
      width: 2px; height: 1em;
      background: var(--vscode-foreground);
      margin-left: 2px;
      vertical-align: text-bottom;
      animation: blink 0.8s step-end infinite;
    }
    @keyframes blink { 50% { opacity: 0; } }
    .loading { display: flex; align-items: center; gap: 10px; padding: 40px 0; opacity: 0.6; }
    .spinner {
      width: 16px; height: 16px;
      border: 2px solid var(--vscode-foreground);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.7s linear infinite; flex-shrink: 0;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="header">비전공코드</div>
  <div class="meta">${source} | ${lang}</div>
  <div id="content">
    <div class="loading"><div class="spinner"></div><span>코드 분석 중...</span></div>
  </div>

  <script>
    const contentEl = document.getElementById('content')
    let rawEl = null
    let fullText = ''

    window.addEventListener('message', (event) => {
      const msg = event.data

      if (msg.type === 'start') {
        // 스트리밍 시작: raw 텍스트 영역 준비
        fullText = ''
        contentEl.innerHTML = ''
        rawEl = document.createElement('div')
        rawEl.id = 'stream-raw'
        contentEl.appendChild(rawEl)
      }

      else if (msg.type === 'chunk') {
        // 청크 수신: 텍스트 추가 + 커서
        fullText += msg.text
        rawEl.textContent = fullText
        // 커서 추가
        const existing = contentEl.querySelector('.cursor')
        if (existing) existing.remove()
        const cursor = document.createElement('span')
        cursor.className = 'cursor'
        contentEl.appendChild(cursor)
      }

      else if (msg.type === 'done') {
        // 완료: 마크다운으로 최종 렌더링
        contentEl.innerHTML = formatMarkdown(fullText)
      }

      else if (msg.type === 'error') {
        contentEl.innerHTML = '<h2>오류</h2><p>' + msg.text + '</p>'
      }
    })

    function formatMarkdown(text) {
      return text.split('\\n').map(line => {
        const safe = line
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')

        if (safe.startsWith('## ')) return '<h2>' + safe.slice(3) + '</h2>'
        if (/^Step\\s+\\d+\\./.test(safe)) return '<div class="step">' + safe + '</div>'
        if (safe.startsWith('- ') || safe.startsWith('* ')) return '<li>' + safe.slice(2) + '</li>'
        if (safe.trim() === '') return '<br>'
        return '<p>' + safe + '</p>'
      }).join('\\n')
    }
  </script>
</body>
</html>`
}

function activate(context) {
  function getApiKey() {
    const cfg = vscode.workspace.getConfiguration('nondevCode')
    return cfg.get('groqApiKey') || process.env.GROQ_API_KEY || ''
  }

  // API 키 없을 때 입력창 팝업 → 설정에 자동 저장
  async function promptAndSaveApiKey() {
    const key = await vscode.window.showInputBox({
      title: '비전공코드 — Groq API 키 입력',
      prompt: 'console.groq.com/keys 에서 무료로 발급받을 수 있어요',
      placeHolder: 'gsk_...',
      password: true,
      ignoreFocusOut: true,
      validateInput: (v) => v.trim() ? null : 'API 키를 입력해주세요',
    })
    if (!key) return null
    await vscode.workspace
      .getConfiguration('nondevCode')
      .update('groqApiKey', key.trim(), vscode.ConfigurationTarget.Global)
    vscode.window.showInformationMessage('비전공코드: API 키가 저장됐어요!')
    return key.trim()
  }

  async function runExplain(code, lang, source) {
    let apiKey = getApiKey()
    if (!apiKey) {
      apiKey = await promptAndSaveApiKey()
      if (!apiKey) return
    }

    const panel = vscode.window.createWebviewPanel(
      'codeNarrator',
      `비전공코드: ${source}`,
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: false }
    )

    panel.webview.html = getWebviewHtml(lang, source)

    const messages = [
      { role: 'system', content: buildSystemPrompt(lang) },
      { role: 'user', content: `다음 ${lang} 코드를 설명해줘:\n\n\`\`\`${lang}\n${code}\n\`\`\`` },
    ]

    try {
      // 스트리밍 시작 신호
      panel.webview.postMessage({ type: 'start' })

      await callGroqStream(apiKey, messages, (chunk) => {
        panel.webview.postMessage({ type: 'chunk', text: chunk })
      })

      // 완료 신호 → WebView에서 마크다운 최종 렌더링
      panel.webview.postMessage({ type: 'done' })
    } catch (err) {
      panel.webview.postMessage({ type: 'error', text: err.message })
    }
  }

  // 파일 전체 설명
  context.subscriptions.push(
    vscode.commands.registerCommand('nondevCode.explain', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) return
      const code = editor.document.getText()
      const lang = detectLanguage(editor.document.languageId)
      const source = editor.document.fileName.split('/').pop()
      await runExplain(code, lang, source)
    })
  )

  // 선택 코드 설명
  context.subscriptions.push(
    vscode.commands.registerCommand('nondevCode.explainSelection', async () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) return
      const code = editor.document.getText(editor.selection)
      if (!code.trim()) {
        vscode.window.showWarningMessage('설명할 코드를 선택해주세요.')
        return
      }
      const lang = detectLanguage(editor.document.languageId)
      const source = editor.document.fileName.split('/').pop()
      await runExplain(code, lang, source)
    })
  )
}

function deactivate() {}

module.exports = { activate, deactivate }
