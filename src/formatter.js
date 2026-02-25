import chalk from 'chalk'

export function printHeader(source, lang) {
  console.log('\n' + chalk.bgBlue.white.bold(' CodeNarrator '))
  console.log(chalk.dim(`  파일: ${source}  언어: ${lang}\n`))
}

export function printFooter() {
  console.log('\n' + chalk.dim('─'.repeat(50)) + '\n')
}

export function printResult(text, lang, source) {
  printHeader(source, lang)

  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) {
      console.log('\n' + chalk.cyan.bold(line.slice(3)))
    } else if (/^Step\s+\d+\./.test(line)) {
      console.log('\n' + chalk.yellow.bold(line))
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      console.log(chalk.dim('  · ') + line.slice(2))
    } else if (line.trim() === '') {
      console.log()
    } else {
      console.log('  ' + line)
    }
  }

  printFooter()
}

// 스트리밍: 청크 단위로 그대로 출력
export function printStreamChunk(chunk) {
  process.stdout.write(chunk)
}

// JSON 출력
export function printJSON(results) {
  console.log(JSON.stringify(results, null, 2))
}
