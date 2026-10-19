export type GitAction = 'commit' | 'push' | 'force'

export type ActionCounts = { commit: number; push: number; force: number }

export type Grants = ActionCounts & { reserved: ActionCounts; armedTurnId: string | null }

declare module 'claude-code' {
  interface PluginState {
    'git-guard': { grants: Grants }
  }
}
