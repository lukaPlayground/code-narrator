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
