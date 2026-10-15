const GIT_GLOBAL_OPTIONS = String.raw`(?:\s+(?:-[cC]\s+\S+|--[\w-]+(?:=\S+)?))*`
const COMMIT_PATTERN = new RegExp(String.raw`\bgit${GIT_GLOBAL_OPTIONS}\s+commit(?![\w-])`, 'g')
const PUSH_PATTERN = new RegExp(String.raw`\bgit${GIT_GLOBAL_OPTIONS}\s+push(?![\w-])`, 'g')
const PR_CREATE_PATTERN = /\bgh\s+pr\s+create\b/
const CO_AUTHOR_PATTERN = /co-authored-by|generated with \[?claude/i
const HEREDOC_PATTERN = /<<-?\s*['"]?(\w+)['"]?\n([\s\S]*?)\n\s*\1\b/
const MESSAGE_FLAG_PATTERN = /(?:^|\s)(?:-[a-zA-Z]*m|--message)(?:=|\s+)("(?:[^"\\]|\\.)*"|'[^']*')/g
const MESSAGE_FILE_PATTERN = /(?:^|\s)(?:-F|--file)(?:=|\s)/
const NO_EDIT_PATTERN = /--no-edit\b/
const CONVENTIONAL_HEADER_PATTERN =
  /^(feat|fix|refactor|chore|docs|test|perf|style|build|ci|revert)(\([\w./-]+\))?!?: \S/
const SPANISH_CHARACTERS_PATTERN = /[áéíóúñ¿¡]/i
const SPANISH_WORDS_PATTERN =
  /\b(agrega|agregar|corrige|corregir|actualiza|actualizar|elimina|eliminar|quita|ajusta|mueve|cambia|para|con|los|las|del|una|que|por|sin|cuando|nuevo|nueva|datos|pantalla|usuarios?)\b/i

export type GitCommandAnalysis = {
  commitCount: number
  pushCount: number
  isPrCreate: boolean
  hasCoAuthorTrailer: boolean
  commitMessage: string | null
  isMessageFromFile: boolean
  isNoEdit: boolean
}

const unquote = (quoted: string): string =>
  quoted.startsWith("'")
    ? quoted.slice(1, -1)
    : quoted.slice(1, -1).replace(/\\(["\\$`])/g, '$1')

const extractCommitMessage = (command: string): string | null => {
  const heredoc = HEREDOC_PATTERN.exec(command)

  if (heredoc !== null) {
    return heredoc[2] ?? ''
  }

  const messages = [...command.matchAll(MESSAGE_FLAG_PATTERN)].map(match => unquote(match[1] ?? ''))

  return messages.length === 0 ? null : messages.join('\n\n')
}

const stripMessages = (command: string): string =>
  command.replace(HEREDOC_PATTERN, '').replace(MESSAGE_FLAG_PATTERN, ' ')

const countMatches = (text: string, pattern: RegExp): number => [...text.matchAll(pattern)].length

export const analyzeGitCommand = (command: string): GitCommandAnalysis => {
  const skeleton = stripMessages(command)
  const commitCount = countMatches(skeleton, COMMIT_PATTERN)

  return {
    commitCount,
    pushCount: countMatches(skeleton, PUSH_PATTERN),
    isPrCreate: PR_CREATE_PATTERN.test(skeleton),
    hasCoAuthorTrailer: CO_AUTHOR_PATTERN.test(command),
    commitMessage: commitCount > 0 ? extractCommitMessage(command) : null,
    isMessageFromFile: MESSAGE_FILE_PATTERN.test(skeleton),
    isNoEdit: NO_EDIT_PATTERN.test(skeleton),
  }
}

export type CommitMessageProblem = 'notConventional' | 'notEnglish'

export type CommitMessageRules = { conventionalCommits: boolean; englishMessages: boolean }

const isSpanish = (message: string): boolean =>
  SPANISH_CHARACTERS_PATTERN.test(message) || SPANISH_WORDS_PATTERN.test(message)

export const findCommitMessageProblems = (
  message: string,
  rules: CommitMessageRules,
): CommitMessageProblem[] => {
  const header = message.trim().split('\n')[0] ?? ''
  const problems: CommitMessageProblem[] = []

  if (rules.conventionalCommits && !CONVENTIONAL_HEADER_PATTERN.test(header)) {
    problems.push('notConventional')
  }

  if (rules.englishMessages && isSpanish(message)) {
    problems.push('notEnglish')
  }

  return problems
}
