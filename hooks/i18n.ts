import type { CommitMessageProblem } from './git-command'

export type Language = 'es' | 'en'

export type Messages = {
  grantCommand: string
  revokeCommand: string
  grantDescription: string
  grantArgumentHint: string
  revokeDescription: string
  and: string
  both: string
  nothing: string
  singleUse: string
  multipleUses: (count: number) => string
  usage: (maxCount: number) => string
  usageReply: (usage: string, granted: string) => string
  authorizedPrompt: (request: string) => string
  authorizedReply: (request: string, available: string) => string
  revokedReply: string
  bandStatus: (granted: string) => string
  revokeButton: string
  guardFailed: string
  pullRequestBlocked: string
  aiAttributionBlocked: string
  oneCommitOnePush: string
  messageNotValidatable: string
  invalidMessage: (problems: string) => string
  messageProblems: Readonly<Record<CommitMessageProblem, string>>
  missingPermission: (actions: string, grantLine: string) => string
}

const SPANISH: Messages = {
  grantCommand: 'permitir',
  revokeCommand: 'revocar',
  grantDescription: 'Autoriza N commits, pushes o ambos (1 por defecto); vence al terminar el próximo turno',
  grantArgumentHint: 'commit | push | ambos [cantidad]',
  revokeDescription: 'Revoca los permisos de commit y push pendientes',
  and: 'y',
  both: 'ambos',
  nothing: 'nada',
  singleUse: '(un solo uso)',
  multipleUses: count => `(${count} usos)`,
  usage: maxCount => `Uso: /permitir commit | push | ambos [cantidad 1-${maxCount}]`,
  usageReply: (usage, granted) => `${usage}. Autorizado ahora: ${granted}.`,
  authorizedPrompt: request => `El usuario autorizó ${request}. Procede con lo que propusiste.`,
  authorizedReply: (request, available) =>
    `Autorizado: ${request}. Disponible ahora: ${available}. Vence al terminar el próximo turno.`,
  revokedReply: 'Permisos de commit y push revocados.',
  bandStatus: granted => `git-guard: quedan ${granted} `,
  revokeButton: 'Revocar',
  guardFailed: 'el guardia falló; no se ejecuta el comando',
  pullRequestBlocked: 'los PRs los crea el usuario; no ejecutes gh pr create',
  aiAttributionBlocked: 'quita el trailer Co-Authored-By y cualquier firma de Claude',
  oneCommitOnePush: 'un solo commit y un solo push por comando',
  messageNotValidatable: 'el mensaje del commit debe ir con -m o heredoc para poder validarlo',
  invalidMessage: problems => `mensaje inválido: ${problems}`,
  messageProblems: {
    notConventional: 'la primera línea no sigue Conventional Commits (tipo(scope): descripción)',
    notEnglish: 'el mensaje debe estar en inglés',
  },
  missingPermission: (actions, grantLine) =>
    `falta permiso para ${actions}. Muestra el comando y pide autorización; el usuario la concede con ${grantLine}`,
}

const ENGLISH: Messages = {
  grantCommand: 'git-allow',
  revokeCommand: 'git-revoke',
  grantDescription: 'Allow N commits, pushes or both (1 by default); expires when the next turn ends',
  grantArgumentHint: 'commit | push | both [count]',
  revokeDescription: 'Revoke the pending commit and push permissions',
  and: 'and',
  both: 'both',
  nothing: 'nothing',
  singleUse: '(single use)',
  multipleUses: count => `(${count} uses)`,
  usage: maxCount => `Usage: /git-allow commit | push | both [count 1-${maxCount}]`,
  usageReply: (usage, granted) => `${usage}. Currently allowed: ${granted}.`,
  authorizedPrompt: request => `The user allowed ${request}. Go ahead with what you proposed.`,
  authorizedReply: (request, available) =>
    `Allowed: ${request}. Available now: ${available}. Expires when the next turn ends.`,
  revokedReply: 'Commit and push permissions revoked.',
  bandStatus: granted => `git-guard: ${granted} left `,
  revokeButton: 'Revoke',
  guardFailed: 'the guard failed; the command was not run',
  pullRequestBlocked: 'pull requests are opened by the user; do not run gh pr create',
  aiAttributionBlocked: 'remove the Co-Authored-By trailer and any Claude signature',
  oneCommitOnePush: 'one commit and one push per command',
  messageNotValidatable: 'the commit message must be passed with -m or a heredoc so it can be checked',
  invalidMessage: problems => `invalid message: ${problems}`,
  messageProblems: {
    notConventional: 'the first line does not follow Conventional Commits (type(scope): description)',
    notEnglish: 'the message must be in English',
  },
  missingPermission: (actions, grantLine) =>
    `missing permission for ${actions}. Show the command and ask for authorization; the user grants it with ${grantLine}`,
}

const MESSAGES: Readonly<Record<Language, Messages>> = { es: SPANISH, en: ENGLISH }

export const resolveLanguage = (value: unknown): Language => (value === 'es' ? 'es' : 'en')

export const messagesFor = (language: Language): Messages => MESSAGES[language]
