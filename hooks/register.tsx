import type { EngineInterface, Register } from 'claude-code'

import type { ActionCounts, GitAction, Grants } from '../types'
import { messagesFor, resolveLanguage } from './i18n'
import type { Messages } from './i18n'
import { judgeCommand, resolveRules } from './policy'
import type { Rules, Verdict } from './policy'

const NO_ACTIONS: ActionCounts = { commit: 0, push: 0 }
const NO_GRANTS: Grants = { ...NO_ACTIONS, reserved: NO_ACTIONS, armedTurnId: null }
const MAX_GRANT_COUNT = 50
const GRANTS_REF = { plugin: 'git-guard', key: 'grants' } as const

const GRANT_ARGUMENTS: Readonly<Record<string, readonly GitAction[]>> = {
  commit: ['commit'],
  push: ['push'],
  ambos: ['commit', 'push'],
  both: ['commit', 'push'],
}

type GrantRequest = { actions: readonly GitAction[]; count: number }

const parseGrantRequest = (args: string): GrantRequest | null => {
  const [argument = '', countText = '1', ...rest] = args.trim().toLowerCase().split(/\s+/)
  const actions = GRANT_ARGUMENTS[argument]
  const count = /^\d+$/.test(countText) ? Number(countText) : 0

  if (actions === undefined || rest.length > 0 || count < 1 || count > MAX_GRANT_COUNT) {
    return null
  }

  return { actions, count }
}

const activeActions = (current: Grants): GitAction[] =>
  (['commit', 'push'] as const).filter(action => current[action] > 0)

const describeActions = (actions: readonly GitAction[], messages: Messages): string =>
  actions.length === 0 ? messages.nothing : actions.join(` ${messages.and} `)

const describeGrants = (current: Grants, messages: Messages): string => {
  const active = activeActions(current)

  return active.length === 0
    ? messages.nothing
    : active.map(action => `${current[action]} ${action}`).join(` ${messages.and} `)
}

const describeRequest = ({ actions, count }: GrantRequest, messages: Messages): string =>
  `${describeActions(actions, messages)} ${count === 1 ? messages.singleUse : messages.multipleUses(count)}`

const normalizeGrants = (stored: Grants): Grants =>
  stored.reserved === undefined ? { ...stored, reserved: NO_ACTIONS } : stored

async function readGrants($: EngineInterface): Promise<Grants> {
  const { value = NO_GRANTS } = await $.state.get(GRANTS_REF)

  return normalizeGrants(value)
}

async function updateGrants($: EngineInterface, change: (current: Grants) => Grants): Promise<void> {
  for (;;) {
    const { value = NO_GRANTS, version } = await $.state.get(GRANTS_REF)
    const current = normalizeGrants(value)
    const changed = change(current)

    if (changed === current) {
      return
    }

    const { isSet } = await $.state.set(GRANTS_REF, changed, { ifVersion: version })

    if (isSet) {
      return
    }
  }
}

const shiftCount = (counts: ActionCounts, actions: readonly GitAction[], delta: number): ActionCounts => ({
  commit: actions.includes('commit') ? counts.commit + delta : counts.commit,
  push: actions.includes('push') ? counts.push + delta : counts.push,
})

const pickCounts = ({ commit, push }: ActionCounts): ActionCounts => ({ commit, push })

const reserve = (current: Grants, actions: readonly GitAction[]): Grants => ({
  ...shiftCount(pickCounts(current), actions, -1),
  reserved: shiftCount(current.reserved, actions, 1),
  armedTurnId: current.armedTurnId,
})

const heldActions = (current: Grants, actions: readonly GitAction[]): GitAction[] =>
  actions.filter(action => current.reserved[action] > 0)

const settle = (current: Grants, actions: readonly GitAction[], didRun: boolean): Grants => {
  const held = heldActions(current, actions)

  if (held.length === 0) {
    return current
  }

  const available = pickCounts(current)

  return {
    ...(didRun ? available : shiftCount(available, held, 1)),
    reserved: shiftCount(current.reserved, held, -1),
    armedTurnId: current.armedTurnId,
  }
}

const grant = (current: Grants, { actions, count }: GrantRequest): Grants => ({
  ...shiftCount(pickCounts(current), actions, count),
  reserved: current.reserved,
  armedTurnId: null,
})

async function runGrant($: EngineInterface, args: string, messages: Messages): Promise<{ text: string }> {
  const request = parseGrantRequest(args)

  if (request === null) {
    const granted = describeGrants(await readGrants($), messages)

    return { text: messages.usageReply(messages.usage(MAX_GRANT_COUNT), granted) }
  }

  await updateGrants($, current => grant(current, request))
  $.clock.after(0, () => {
    void $.prompt.submit({ text: messages.authorizedPrompt(describeRequest(request, messages)) })
  })

  return {
    text: messages.authorizedReply(
      describeRequest(request, messages),
      describeGrants(await readGrants($), messages),
    ),
  }
}

async function runRevoke($: EngineInterface, messages: Messages): Promise<{ text: string }> {
  await updateGrants($, () => NO_GRANTS)

  return { text: messages.revokedReply }
}

export const register: Register = (on, options) => {
  const language = resolveLanguage(options.language)
  const messages = messagesFor(language)
  const rules: Rules = resolveRules(options)

  on('session.start', async ($, e, next) => {
    if (language === 'es') {
      await $.command.register({
        name: 'permitir',
        description: messages.grantDescription,
        argumentHint: messages.grantArgumentHint,
      })
      await $.command.register({ name: 'revocar', description: messages.revokeDescription })
    } else {
      await $.command.register({
        name: 'git-allow',
        description: messages.grantDescription,
        argumentHint: messages.grantArgumentHint,
      })
      await $.command.register({ name: 'git-revoke', description: messages.revokeDescription })
    }

    return next(e)
  })

  on('command.run', { command: 'permitir' }, ($, e) => runGrant($, e.args, messages))

  on('command.run', { command: 'git-allow' }, ($, e) => runGrant($, e.args, messages))

  on('command.run', { command: 'revocar' }, $ => runRevoke($, messages))

  on('command.run', { command: 'git-revoke' }, $ => runRevoke($, messages))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const decision: { verdict: Verdict } = { verdict: { kind: 'pass' } }

    await updateGrants($, current => {
      const verdict = judgeCommand(e.command, current, rules, messages)
      decision.verdict = verdict

      return verdict.kind === 'consume' ? reserve(current, verdict.actions) : current
    })

    const { verdict } = decision

    if (verdict.kind === 'deny') {
      return { deny: verdict.reason }
    }

    const ran = await next(e)

    if (verdict.kind === 'consume') {
      const didRun = ran.deny === undefined && ran.isError !== true
      await updateGrants($, current => settle(current, verdict.actions, didRun))
    }

    return ran
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `git-guard: ${messages.guardFailed}` }))

  on('turn.start', async ($, e, next) => {
    if (e.text !== '') {
      await updateGrants($, current =>
        activeActions(current).length > 0 && current.armedTurnId === null
          ? { ...current, armedTurnId: e.turnId }
          : current,
      )
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const current = await readGrants($)

    if (e.agentId === undefined && current.armedTurnId === e.turnId) {
      await updateGrants($, () => NO_GRANTS)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await readGrants($)

    if (e.props.hasSurvey || activeActions(current).length === 0) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text bold>{messages.bandStatus(describeGrants(current, messages))}</Text>
        <Button key="revoke" label={messages.revokeButton} onPress={() => updateGrants($, () => NO_GRANTS)} />
      </Box>
    )
  })
}
