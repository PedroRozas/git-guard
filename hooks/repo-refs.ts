import type { GitAction } from '../types'

export type RefSnapshot = ReadonlyMap<string, string>

const REMOTE_REF_PREFIX = 'refs/remotes/'
const BRANCH_REF_PREFIX = 'refs/heads/'

export const parseShowRef = (output: string): RefSnapshot =>
  new Map(
    output
      .split('\n')
      .filter(line => line !== '')
      .map(line => {
        const [objectId = '', refName = ''] = line.split(' ')

        return [refName, objectId] as const
      }),
  )

const refsChanged = (before: RefSnapshot, after: RefSnapshot, isWatched: (name: string) => boolean): boolean => {
  const watchedNames = [...new Set([...before.keys(), ...after.keys()])].filter(isWatched)

  return watchedNames.some(name => before.get(name) !== after.get(name))
}

const isCommitRef = (name: string): boolean => name === 'HEAD' || name.startsWith(BRANCH_REF_PREFIX)

const isRemoteRef = (name: string): boolean => name.startsWith(REMOTE_REF_PREFIX)

export const actionsThatRan = (
  before: RefSnapshot,
  after: RefSnapshot,
  actions: readonly GitAction[],
): GitAction[] =>
  actions.filter(action =>
    refsChanged(before, after, action === 'commit' ? isCommitRef : isRemoteRef),
  )
