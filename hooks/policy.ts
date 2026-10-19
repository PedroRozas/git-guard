import type { PluginOptions } from 'claude-code'

import type { GitAction, Grants } from '../types'
import { analyzeGitCommand, findCommitMessageProblems } from './git-command'
import type { GitCommandAnalysis } from './git-command'
import type { Messages } from './i18n'

export type Rules = {
  conventionalCommits: boolean
  englishMessages: boolean
  blockPullRequests: boolean
  blockAiAttribution: boolean
}

export type Verdict =
  | { kind: 'pass' }
  | { kind: 'deny'; reason: string }
  | { kind: 'consume'; actions: GitAction[]; repoDirectory: string | null }

const DEFAULT_RULES: Rules = {
  conventionalCommits: true,
  englishMessages: false,
  blockPullRequests: true,
  blockAiAttribution: true,
}

const booleanOption = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback)

export const resolveRules = (options: PluginOptions): Rules => ({
  conventionalCommits: booleanOption(options.conventionalCommits, DEFAULT_RULES.conventionalCommits),
  englishMessages: booleanOption(options.englishMessages, DEFAULT_RULES.englishMessages),
  blockPullRequests: booleanOption(options.blockPullRequests, DEFAULT_RULES.blockPullRequests),
  blockAiAttribution: booleanOption(options.blockAiAttribution, DEFAULT_RULES.blockAiAttribution),
})

const deny = (reason: string): Verdict => ({ kind: 'deny', reason: `git-guard: ${reason}` })

const requestedActions = (analysis: GitCommandAnalysis): GitAction[] => [
  ...(analysis.commitCount > 0 ? (['commit'] as const) : []),
  ...(analysis.pushCount > 0 ? (['push'] as const) : []),
  ...(analysis.forcePushCount > 0 ? (['force'] as const) : []),
]

const checksMessage = (rules: Rules): boolean =>
  rules.conventionalCommits || rules.englishMessages || rules.blockAiAttribution

const findCommitProblem = (analysis: GitCommandAnalysis, rules: Rules, messages: Messages): string | null => {
  if (analysis.commitCount === 0 || analysis.isNoEdit || !checksMessage(rules)) {
    return null
  }

  if (analysis.isMessageFromFile || analysis.commitMessage === null) {
    return messages.messageNotValidatable
  }

  const problems = findCommitMessageProblems(analysis.commitMessage, rules)

  return problems.length === 0
    ? null
    : messages.invalidMessage(problems.map(problem => messages.messageProblems[problem]).join('; '))
}

const isCommitAndPush = (actions: readonly GitAction[]): boolean =>
  actions.length === 2 && actions.includes('commit') && actions.includes('push')

const grantArguments = (missing: readonly GitAction[], messages: Messages): string[] =>
  isCommitAndPush(missing) ? [messages.both] : [...missing]

const describeMissingPermission = (missing: readonly GitAction[], messages: Messages): string => {
  const grantLines = grantArguments(missing, messages).map(argument => `/${messages.grantCommand} ${argument}`)

  return messages.missingPermission(
    missing.map(action => messages.actionNames[action]).join(` ${messages.and} `),
    grantLines.join(` ${messages.and} `),
  )
}

export const judgeCommand = (command: string, grants: Grants, rules: Rules, messages: Messages): Verdict => {
  const analysis = analyzeGitCommand(command)

  if (rules.blockPullRequests && analysis.isPrCreate) {
    return deny(messages.pullRequestBlocked)
  }

  const actions = requestedActions(analysis)

  if (actions.length === 0) {
    return { kind: 'pass' }
  }

  if (rules.blockAiAttribution && analysis.hasCoAuthorTrailer) {
    return deny(messages.aiAttributionBlocked)
  }

  if (analysis.commitCount > 1 || analysis.pushCount + analysis.forcePushCount > 1) {
    return deny(messages.oneCommitOnePush)
  }

  if (analysis.isRepeated) {
    return deny(messages.repeatedAction)
  }

  const commitProblem = findCommitProblem(analysis, rules, messages)

  if (commitProblem !== null) {
    return deny(commitProblem)
  }

  const missing = actions.filter(action => grants[action] === 0)

  if (missing.length > 0) {
    return deny(describeMissingPermission(missing, messages))
  }

  return { kind: 'consume', actions, repoDirectory: analysis.repoDirectory }
}
