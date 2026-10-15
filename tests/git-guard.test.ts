import type { On } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const VALID_COMMIT = 'git commit -m "feat(portal): add product filters"'
const SPANISH = { options: { language: 'es', englishMessages: true } }
const SPANISH_MESSAGE_COMMIT = 'git commit -m "feat: agrega filtros"'
const LOOSE_COMMIT = 'git commit -m "added filters"'
const CO_AUTHORED_COMMIT = `git commit -m "$(cat <<'EOF'\nfeat: add filters\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nEOF\n)"`
const BAND_PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

const COMMAND_CONTEXT = { origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 100 } }

const runCommand = ($: Engine, command: string, args = '') =>
  $.command.run({ command, args, ...COMMAND_CONTEXT })

const answerBash = (on: On) =>
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } }))

const failBash = (on: On) =>
  on('tool.call', { tool: 'Bash' }, () => ({ isError: true as const, result: 'exit 128', text: 'Exit code 128' }))

describe('git-guard in Spanish', () => {
  test('lets non-git commands through', SPANISH, async ($, on) => {
    answerBash(on)
    const ran = await $.tool.call({ tool: 'Bash', command: 'git status && ls' })

    expect(ran.deny).toBeUndefined()
  })

  test('blocks a valid commit without permission', SPANISH, async ($, on) => {
    answerBash(on)
    const ran = await $.tool.call({ tool: 'Bash', command: VALID_COMMIT })

    expect(ran.deny).toContain('/permitir commit')
  })

  test('always blocks gh pr create', SPANISH, async ($, on) => {
    answerBash(on)
    await runCommand($, 'permitir', 'ambos')
    const ran = await $.tool.call({ tool: 'Bash', command: 'gh pr create --title x' })

    expect(ran.deny).toContain('PRs')
  })

  test('rejects Spanish, non-conventional and co-authored messages', SPANISH, async ($, on) => {
    answerBash(on)
    await runCommand($, 'permitir', 'commit')

    const spanish = await $.tool.call({ tool: 'Bash', command: SPANISH_MESSAGE_COMMIT })
    const loose = await $.tool.call({ tool: 'Bash', command: LOOSE_COMMIT })
    const coAuthored = await $.tool.call({ tool: 'Bash', command: CO_AUTHORED_COMMIT })

    expect(spanish.deny).toContain('inglés')
    expect(loose.deny).toContain('Conventional Commits')
    expect(coAuthored.deny).toContain('Co-Authored-By')
  })

  test('a commit grant is spent by one commit', SPANISH, async ($, on) => {
    answerBash(on)
    await runCommand($, 'permitir', 'commit')

    const first = await $.tool.call({ tool: 'Bash', command: VALID_COMMIT })
    const second = await $.tool.call({ tool: 'Bash', command: VALID_COMMIT })

    expect(first.deny).toBeUndefined()
    expect(second.deny).toBeDefined()
  })

  test('a counted commit grant allows that many commits', SPANISH, async ($, on) => {
    answerBash(on)
    await runCommand($, 'permitir', 'commit 3')

    const allowed = [
      await $.tool.call({ tool: 'Bash', command: VALID_COMMIT }),
      await $.tool.call({ tool: 'Bash', command: VALID_COMMIT }),
      await $.tool.call({ tool: 'Bash', command: VALID_COMMIT }),
    ]
    const fourth = await $.tool.call({ tool: 'Bash', command: VALID_COMMIT })

    expect(allowed.map(ran => ran.deny)).toEqual([undefined, undefined, undefined])
    expect(fourth.deny).toContain('/permitir commit')
  })

  test('a counted ambos grant covers commit and push pairs', SPANISH, async ($, on) => {
    answerBash(on)
    await runCommand($, 'permitir', 'ambos 2')

    const first = await $.tool.call({ tool: 'Bash', command: `${VALID_COMMIT} && git push` })
    const second = await $.tool.call({ tool: 'Bash', command: `${VALID_COMMIT} && git push` })
    const third = await $.tool.call({ tool: 'Bash', command: 'git push' })

    expect(first.deny).toBeUndefined()
    expect(second.deny).toBeUndefined()
    expect(third.deny).toContain('/permitir push')
  })

  test('both is accepted as ambos', SPANISH, async ($, on) => {
    answerBash(on)
    await runCommand($, 'permitir', 'both')
    const ran = await $.tool.call({ tool: 'Bash', command: `${VALID_COMMIT} && git push` })

    expect(ran.deny).toBeUndefined()
  })

  test('names /permitir ambos when both are missing', SPANISH, async ($, on) => {
    answerBash(on)
    const ran = await $.tool.call({ tool: 'Bash', command: `${VALID_COMMIT} && git push` })

    expect(ran.deny).toContain('/permitir ambos')
  })

  test('repeated grants add up', SPANISH, async ($, on) => {
    answerBash(on)
    await runCommand($, 'permitir', 'push')
    await runCommand($, 'permitir', 'push 1')

    const first = await $.tool.call({ tool: 'Bash', command: 'git push' })
    const second = await $.tool.call({ tool: 'Bash', command: 'git push' })
    const third = await $.tool.call({ tool: 'Bash', command: 'git push' })

    expect(first.deny).toBeUndefined()
    expect(second.deny).toBeUndefined()
    expect(third.deny).toBeDefined()
  })

  test('rejects an invalid count without granting anything', SPANISH, async ($, on) => {
    answerBash(on)
    const zero = await runCommand($, 'permitir', 'commit 0')
    const word = await runCommand($, 'permitir', 'commit diez')
    const huge = await runCommand($, 'permitir', 'commit 51')
    const ran = await $.tool.call({ tool: 'Bash', command: VALID_COMMIT })

    expect(zero.text).toContain('Uso:')
    expect(word.text).toContain('Uso:')
    expect(huge.text).toContain('Uso:')
    expect(ran.deny).toContain('/permitir commit')
  })

  test('a commit grant does not cover a push in the same command', SPANISH, async ($, on) => {
    answerBash(on)
    await runCommand($, 'permitir', 'commit')
    const ran = await $.tool.call({ tool: 'Bash', command: `${VALID_COMMIT} && git push` })

    expect(ran.deny).toContain('/permitir push')
  })

  test('an unused grant expires when the next turn completes', SPANISH, async ($, on) => {
    answerBash(on)
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
    await runCommand($, 'permitir', 'commit')
    await $.turn.start({ text: 'El usuario autorizó commit', turnId: 'turn-1' })
    await $.turn.complete({
      answer: '',
      durationMs: 1,
      isAborted: false,
      turnId: 'turn-1',
      reason: 'answer',
    })
    const ran = await $.tool.call({ tool: 'Bash', command: VALID_COMMIT })

    expect(ran.deny).toContain('/permitir commit')
  })

  test('/revocar drops pending grants', SPANISH, async ($, on) => {
    answerBash(on)
    await runCommand($, 'permitir', 'push')
    await runCommand($, 'revocar')
    const ran = await $.tool.call({ tool: 'Bash', command: 'git -C ../api push origin main' })

    expect(ran.deny).toBeDefined()
  })

  test('registers the Spanish commands', SPANISH, async ($, on) => {
    const names: string[] = []
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => {
      names.push(e.name)

      return { value: { command: e.name } }
    })
    await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })

    expect(names).toEqual(['permitir', 'revocar'])
  })

  test('the band shows the remaining grants', SPANISH, async $ => {
    await runCommand($, 'permitir', 'push')
    const ui = await $.ui.mount({
      plugin: 'git-guard',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: BAND_PROPS,
    })

    expect(await ui.find({ text: /git-guard: quedan 1 push/ })).toBeDefined()
  })
})

describe('git-guard in English', () => {
  test('registers the English commands by default', async ($, on) => {
    const names: string[] = []
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => {
      names.push(e.name)

      return { value: { command: e.name } }
    })
    await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })

    expect(names).toEqual(['git-allow', 'git-revoke'])
  })

  test('denies name /git-allow and both is accepted', async ($, on) => {
    answerBash(on)
    const commitOnly = await $.tool.call({ tool: 'Bash', command: VALID_COMMIT })
    const commitAndPush = await $.tool.call({ tool: 'Bash', command: `${VALID_COMMIT} && git push` })
    await runCommand($, 'git-allow', 'both')
    const allowed = await $.tool.call({ tool: 'Bash', command: `${VALID_COMMIT} && git push` })

    expect(commitOnly.deny).toContain('/git-allow commit')
    expect(commitAndPush.deny).toContain('/git-allow both')
    expect(allowed.deny).toBeUndefined()
  })

  test('the Spanish ambos argument is accepted too', async ($, on) => {
    answerBash(on)
    await runCommand($, 'git-allow', 'ambos')
    const ran = await $.tool.call({ tool: 'Bash', command: `${VALID_COMMIT} && git push` })

    expect(ran.deny).toBeUndefined()
  })

  test('replies and usage are in English', async $ => {
    const usage = await runCommand($, 'git-allow', 'commit 0')
    const allowed = await runCommand($, 'git-allow', 'commit 2')
    const revoked = await runCommand($, 'git-revoke')

    expect(usage.text).toContain('Usage: /git-allow commit | push | both')
    expect(allowed.text).toContain('Allowed: commit (2 uses)')
    expect(revoked.text).toBe('Commit and push permissions revoked.')
  })

  test('message and pull request denies are in English', async ($, on) => {
    answerBash(on)
    await runCommand($, 'git-allow', 'commit')

    const loose = await $.tool.call({ tool: 'Bash', command: LOOSE_COMMIT })
    const coAuthored = await $.tool.call({ tool: 'Bash', command: CO_AUTHORED_COMMIT })
    const pullRequest = await $.tool.call({ tool: 'Bash', command: 'gh pr create --title x' })

    expect(loose.deny).toContain('Conventional Commits')
    expect(coAuthored.deny).toContain('Co-Authored-By')
    expect(pullRequest.deny).toContain('pull requests')
  })

  test('the band shows the remaining grants', async $ => {
    await runCommand($, 'git-allow', 'commit 2')
    const ui = await $.ui.mount({
      plugin: 'git-guard',
      surface: 'terminal',
      component: 'AbovePrompt',
      props: BAND_PROPS,
    })

    expect(await ui.find({ text: /git-guard: 2 commit left/ })).toBeDefined()
    expect(await ui.find({ key: 'revoke' })).toBeDefined()
  })
})

describe('git-guard rules', () => {
  test('Spanish messages pass by default', async ($, on) => {
    answerBash(on)
    await runCommand($, 'git-allow', 'commit')
    const ran = await $.tool.call({ tool: 'Bash', command: SPANISH_MESSAGE_COMMIT })

    expect(ran.deny).toBeUndefined()
  })

  test('englishMessages on rejects Spanish messages', { options: { englishMessages: true } }, async ($, on) => {
    answerBash(on)
    await runCommand($, 'git-allow', 'commit')
    const ran = await $.tool.call({ tool: 'Bash', command: SPANISH_MESSAGE_COMMIT })

    expect(ran.deny).toContain('English')
  })

  test('conventionalCommits off accepts loose messages', { options: { conventionalCommits: false } }, async ($, on) => {
    answerBash(on)
    await runCommand($, 'git-allow', 'commit')
    const ran = await $.tool.call({ tool: 'Bash', command: LOOSE_COMMIT })

    expect(ran.deny).toBeUndefined()
  })

  test('blockPullRequests off lets gh pr create through', { options: { blockPullRequests: false } }, async ($, on) => {
    answerBash(on)
    const ran = await $.tool.call({ tool: 'Bash', command: 'gh pr create --title x' })

    expect(ran.deny).toBeUndefined()
  })

  test('blockAiAttribution off accepts a co-author trailer', { options: { blockAiAttribution: false } }, async ($, on) => {
    answerBash(on)
    await runCommand($, 'git-allow', 'commit')
    const ran = await $.tool.call({ tool: 'Bash', command: CO_AUTHORED_COMMIT })

    expect(ran.deny).toBeUndefined()
  })

  test(
    'with every message rule off a commit still needs a grant and one commit per command',
    { options: { conventionalCommits: false, blockAiAttribution: false, blockPullRequests: false } },
    async ($, on) => {
      answerBash(on)
      const withoutGrant = await $.tool.call({ tool: 'Bash', command: LOOSE_COMMIT })
      await runCommand($, 'git-allow', 'commit 2')
      const twoCommits = await $.tool.call({ tool: 'Bash', command: `${LOOSE_COMMIT} && ${LOOSE_COMMIT}` })
      const fromFile = await $.tool.call({ tool: 'Bash', command: 'git commit -F message.txt' })

      expect(withoutGrant.deny).toContain('/git-allow commit')
      expect(twoCommits.deny).toContain('one commit and one push')
      expect(fromFile.deny).toBeUndefined()
    },
  )
})

describe('git-guard settles a grant only when the command runs', () => {
  test('a command that fails gives the permission back', SPANISH, async ($, on) => {
    failBash(on)
    await runCommand($, 'permitir', 'ambos')

    const failed = await $.tool.call({ tool: 'Bash', command: `git pull --rebase && ${VALID_COMMIT} && git push` })
    const status = await runCommand($, 'permitir')

    expect(failed.isError).toBe(true)
    expect(status.text).toContain('1 commit')
    expect(status.text).toContain('1 push')
  })

  test('a command that succeeds spends the permission', SPANISH, async ($, on) => {
    answerBash(on)
    await runCommand($, 'permitir', 'ambos')

    await $.tool.call({ tool: 'Bash', command: `${VALID_COMMIT} && git push` })
    const status = await runCommand($, 'permitir')

    expect(status.text).toContain('nada')
  })

  test('a permission revoked while the command runs is not given back', SPANISH, async ($, on) => {
    on('tool.call', { tool: 'Bash' }, async () => {
      await runCommand($, 'revocar')

      return { isError: true as const, result: 'exit 1', text: 'Exit code 1' }
    })
    await runCommand($, 'permitir', 'commit')

    await $.tool.call({ tool: 'Bash', command: VALID_COMMIT })
    const status = await runCommand($, 'permitir')

    expect(status.text).toContain('nada')
  })
})
