import { program } from 'commander'
import { readFileSync } from 'fs'
import { explain, explainStream } from './narrator.js'
import { detectLanguage } from './detector.js'
import { printResult, printHeader, printFooter, printStreamChunk, printJSON } from './formatter.js'
import { config } from 'dotenv'
config({ override: true })

program
  .name('code-narrator')
  .description('비전공자를 위한 코드 설명 도구')
  .version('0.1.0')

// 파일 설명 (단일 또는 다중)
// 예: code-narrator explain ./src/index.js
// 예: code-narrator explain ./src/*.js
// 예: code-narrator explain a.js b.js --output json
program
  .command('explain <files...>')
  .description('파일을 읽어서 코드를 설명해줍니다 (여러 파일 가능)')
  .option('-l, --lang <language>', '언어 직접 지정 (자동 감지 가능)')
  .option('-f, --focus <part>', '특정 함수나 섹션만 설명 (예: "login function")')
  .option('-o, --output <format>', '출력 형식: text | json', 'text')
  .option('-s, --stream', '스트리밍 출력 (단일 파일만)')
  .action(async (files, options) => {
    // 스트리밍은 단일 파일만 지원
    if (options.stream && files.length > 1) {
      console.error('❌ 스트리밍은 파일 1개만 지원해요.')
      process.exit(1)
    }

    // 스트리밍 모드
    if (options.stream) {
      const file = files[0]
      try {
        const code = readFileSync(file, 'utf-8')
        const lang = options.lang || detectLanguage(file, code)
        printHeader(file, lang)
        await explainStream({ code, lang, focus: options.focus, onChunk: printStreamChunk })
        printFooter()
      } catch (err) {
        console.error(`❌ ${err.code === 'ENOENT' ? `파일을 찾을 수 없어요: ${file}` : err.message}`)
        process.exit(1)
      }
      return
    }

    // JSON 출력 모드 (다중 파일 지원)
    if (options.output === 'json') {
      const results = []
      for (const file of files) {
        try {
          const code = readFileSync(file, 'utf-8')
          const lang = options.lang || detectLanguage(file, code)
          const explanation = await explain({ code, lang, focus: options.focus })
          results.push({ file, lang, explanation })
        } catch (err) {
          results.push({ file, error: err.message })
        }
      }
      printJSON(results)
      return
    }

    // 기본 텍스트 출력 (다중 파일 순차 처리)
    for (const file of files) {
      try {
        const code = readFileSync(file, 'utf-8')
        const lang = options.lang || detectLanguage(file, code)
        const result = await explain({ code, lang, focus: options.focus })
        printResult(result, lang, file)
      } catch (err) {
        console.error(`❌ ${err.code === 'ENOENT' ? `파일을 찾을 수 없어요: ${file}` : err.message}`)
      }
    }
  })

// stdin 입력
// 예: echo "def greet(): pass" | code-narrator stdin --lang python
program
  .command('stdin')
  .description('표준 입력으로 코드를 받아 설명해줍니다')
  .option('-l, --lang <language>', '언어 지정', 'javascript')
  .option('-f, --focus <part>', '특정 부분만 설명')
  .option('-o, --output <format>', '출력 형식: text | json', 'text')
  .option('-s, --stream', '스트리밍 출력')
  .action(async (options) => {
    const chunks = []
    for await (const chunk of process.stdin) chunks.push(chunk)
    const code = Buffer.concat(chunks).toString('utf-8').trim()

    if (!code) {
      console.error('❌ 코드가 없어요. 파이프로 코드를 전달해주세요.')
      process.exit(1)
    }

    if (options.stream) {
      printHeader('stdin', options.lang)
      await explainStream({ code, lang: options.lang, focus: options.focus, onChunk: printStreamChunk })
      printFooter()
      return
    }

    const result = await explain({ code, lang: options.lang, focus: options.focus })

    if (options.output === 'json') {
      printJSON([{ file: 'stdin', lang: options.lang, explanation: result }])
    } else {
      printResult(result, options.lang, 'stdin')
    }
  })

program.parse()
