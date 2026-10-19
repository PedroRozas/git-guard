const SHELL_WORD = String.raw`(?:"[^"]*"|'[^']*'|[^\s;&|"'])+`
const GIT_VALUE_OPTION_NAMES = String.raw`(?:-[cC]|--(?:git-dir|work-tree|namespace|config-env))`
const GIT_GLOBAL_OPTIONS = String.raw`(?:\s+(?:${GIT_VALUE_OPTION_NAMES}\s+${SHELL_WORD}|(?!${GIT_VALUE_OPTION_NAMES}\s)(?:--[\w-]+(?:=${SHELL_WORD})?|-[a-zA-Z])))*`
const GIT_ACTION_PATTERN = new RegExp(
  String.raw`\bgit(${GIT_GLOBAL_OPTIONS})\s+["']?(commit|push)["']?(?![\w-])`,
  'g',
)
const DIRECTORY_OPTION_PATTERN = new RegExp(String.raw`-C\s+(${SHELL_WORD})`, 'g')
const CHANGE_DIRECTORY_PATTERN = new RegExp(
  String.raw`(?:^|&&|\|\||[;\n({'"])\s*(?:cd|pushd)\s+(${SHELL_WORD})`,
  'g',
)
const UNEXPANDED_PATH_PATTERN = /[~$`]/
const COMMAND_SEPARATOR_PATTERN = /&&|\|\||[;|\n]/
const LINE_CONTINUATION_PATTERN = /\\\r?\n/g
const FORCE_PUSH_PATTERN =
  /(?:^|\s)(?:--force(?:-with-lease)?(?:=\S*)?|--mirror|--delete|--prune|-[a-zA-Z]*[fd][a-zA-Z]*|["']?[+:]\S)/
const REPEATING_PATTERN = /\b(?:for|while|until)\b[\s\S]*?\bdo\b|\bxargs\b|\bforeach\b|\s-exec(?:dir)?\s/
const PR_CREATE_PATTERN = /\bgh\s+pr\s+(?:create|new)\b/
const CO_AUTHOR_PATTERN = /co-authored-by|generated with \[?claude/i
const HEREDOCS_PATTERN = /<<-?\s*['"]?(\w+)['"]?([^\n]*)\n([\s\S]*?)\n\s*\1\b/g
const SHELL_BEFORE_HEREDOC_PATTERN = /(?:^|[\s;&|(/])(?:ba|z|da|k|s)?sh(?:[ \t]+[^\s;&|<]+)*[ \t]*$/
const SHELL_AFTER_HEREDOC_PATTERN = /\|\s*(?:\S*\/)?(?:ba|z|da|k|s)?sh\b/
const COMMIT_BEFORE_HEREDOC_PATTERN = /\bgit\b.*\bcommit\b/
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
  forcePushCount: number
  isRepeated: boolean
  repoDirectory: string | null
  isPrCreate: boolean
  hasCoAuthorTrailer: boolean
  commitMessage: string | null
  isMessageFromFile: boolean
  isNoEdit: boolean
}

type Heredoc = { opener: string; openerTail: string; body: string; isFedToShell: boolean }

const unquote = (quoted: string): string =>
  quoted.startsWith("'")
    ? quoted.slice(1, -1)
    : quoted.slice(1, -1).replace(/\\(["\\$`])/g, '$1')

const lineBefore = (text: string, index: number): string => text.slice(text.lastIndexOf('\n', index - 1) + 1, index)

const readHeredoc = (command: string, openerTail: string, body: string, offset: number): Heredoc => {
  const opener = lineBefore(command, offset)

  return {
    opener,
    openerTail,
    body,
    isFedToShell: SHELL_BEFORE_HEREDOC_PATTERN.test(opener) || SHELL_AFTER_HEREDOC_PATTERN.test(openerTail),
  }
}

const findCommitHeredoc = (command: string): string | null => {
  const heredoc = [...command.matchAll(HEREDOCS_PATTERN)]
    .map(match => readHeredoc(command, match[2] ?? '', match[3] ?? '', match.index))
    .find(candidate => !candidate.isFedToShell && COMMIT_BEFORE_HEREDOC_PATTERN.test(candidate.opener))

  return heredoc === undefined ? null : heredoc.body
}

const unfoldHeredocs = (command: string): string =>
  command.replace(HEREDOCS_PATTERN, (_whole: string, _delimiter: string, openerTail: string, body: string, offset: number) =>
    readHeredoc(command, openerTail, body, offset).isFedToShell ? `${openerTail}\n${body}` : ` ${openerTail}`,
  )

const extractCommitMessage = (heredoc: string | null, unfolded: string): string | null => {
  if (heredoc !== null) {
    return heredoc
  }

  const messages = [...unfolded.matchAll(MESSAGE_FLAG_PATTERN)].map(match => unquote(match[1] ?? ''))

  return messages.length === 0 ? null : messages.join('\n\n')
}

const unquoteWord = (word: string): string => word.replace(/["']/g, '')

const capturedWords = (text: string, pattern: RegExp): string[] =>
  [...text.matchAll(pattern)].map(match => unquoteWord(match[1] ?? ''))

const isForcePush = (skeleton: string, invocation: RegExpExecArray): boolean => {
  const pushArguments = skeleton.slice(invocation.index + invocation[0].length)
  const [ownArguments = ''] = pushArguments.split(COMMAND_SEPARATOR_PATTERN)

  return FORCE_PUSH_PATTERN.test(ownArguments)
}

const joinDirectories = (directories: readonly string[]): string | null => {
  if (directories.some(directory => UNEXPANDED_PATH_PATTERN.test(directory))) {
    return null
  }

  return directories.reduce(
    (joined, directory) => (directory.startsWith('/') ? directory : `${joined}/${directory}`),
    '.',
  )
}

const findRepoDirectory = (skeleton: string, invocation: RegExpExecArray | undefined): string | null => {
  if (invocation === undefined) {
    return '.'
  }

  const changedDirectories = capturedWords(skeleton.slice(0, invocation.index), CHANGE_DIRECTORY_PATTERN)
  const optionDirectories = capturedWords(invocation[1] ?? '', DIRECTORY_OPTION_PATTERN)

  return joinDirectories([...changedDirectories, ...optionDirectories])
}

export const analyzeGitCommand = (rawCommand: string): GitCommandAnalysis => {
  const command = rawCommand.replace(LINE_CONTINUATION_PATTERN, ' ')
  const unfolded = unfoldHeredocs(command)
  const skeleton = unfolded.replace(MESSAGE_FLAG_PATTERN, ' ')
  const invocations = [...skeleton.matchAll(GIT_ACTION_PATTERN)]
  const pushes = invocations.filter(invocation => invocation[2] === 'push')
  const forcePushCount = pushes.filter(push => isForcePush(skeleton, push)).length
  const commitCount = invocations.length - pushes.length
  const commitHeredoc = commitCount > 0 ? findCommitHeredoc(command) : null
  const commitMessage = commitCount > 0 ? extractCommitMessage(commitHeredoc, unfolded) : null

  return {
    commitCount,
    pushCount: pushes.length - forcePushCount,
    forcePushCount,
    isRepeated: invocations.length > 0 && REPEATING_PATTERN.test(skeleton),
    repoDirectory: findRepoDirectory(skeleton, invocations[0]),
    isPrCreate: PR_CREATE_PATTERN.test(skeleton),
    hasCoAuthorTrailer: CO_AUTHOR_PATTERN.test(unfolded) || CO_AUTHOR_PATTERN.test(commitMessage ?? ''),
    commitMessage,
    isMessageFromFile: commitHeredoc === null && MESSAGE_FILE_PATTERN.test(skeleton),
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
