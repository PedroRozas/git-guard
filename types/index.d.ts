export type GitAction = 'commit' | 'push'

export type ActionCounts = { commit: number; push: number }

export type Grants = ActionCounts & { reserved: ActionCounts; armedTurnId: string | null }

declare module 'claude-code' {
  interface PluginState {
    'git-guard': { grants: Grants }
  }
}
