# git-guard

[![CI](https://github.com/PedroRozas/git-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/PedroRozas/git-guard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Scope:** `git commit`, `git push`, force pushes and `gh pr create`. Nothing else: `git reset --hard`, `git rebase`, `git merge`, `git tag`, `git branch -D` and `gh pr merge` are not checked.

A Claude Code plugin that keeps the agent from committing, pushing or opening pull requests on its own. It can only do those things after you grant a permission that is counted and expires by itself.

## The problem

Left alone, an agent can commit half-finished work, push to a shared branch, rewrite remote history or open a PR you were not ready to publish. Reviewing each Bash call by hand does not scale, and a blanket "always allow git" rule is too broad.

git-guard sits in front of every Bash command the agent runs and applies one rule: **no commit, push, force push or `gh pr create` unless you said so, explicitly and for a specific number of uses**.

- The agent proposes the command and asks. You answer with `/git-allow`.
- The permission is spent as the agent uses it, one per commit or push. If the command fails before git did its part, the permission is given back.
- If the agent does not use it, it expires when the turn after your grant ends.
- On top of that, it checks the commit message before the commit runs.

## Why not a native `ask` rule?

Claude Code can already ask before git commands with `"permissions": { "ask": ["Bash(git commit *)", "Bash(git push *)"] }`. That is a good start, and if a dialog per command is all you want, you do not need this plugin. git-guard adds:

| | Native `ask` rule | git-guard |
| --- | --- | --- |
| Approve several commits at once | No, one dialog per command | `/git-allow commit 3` |
| Approval that expires by itself | No. "Don't ask again" is permanent for the repository | Expires when the next turn ends |
| Gives the approval back when the command fails | No | Yes, checked against the repository's refs |
| `git -C ../api commit`, `git -c user.name=x push`, `/usr/bin/git commit`, `bash -c "git commit ..."` | Not matched: Bash rules compare the command's prefix | Matched |
| Force push as a separate, stronger permission | No | `/git-allow force` |
| Checks the commit message (Conventional Commits, English, no AI attribution) | No | Yes, each rule optional |

The Claude Code docs say it themselves: a Bash `ask` or `deny` rule "covers the invocation Claude usually produces and isn't a security boundary around the program". git-guard is not one either (see [Limitations](#limitations)), but it reads the whole command instead of its first words.

## Install

At the prompt of a Claude Code terminal session:

```text
/plugin install git-guard --marketplace PedroRozas/claude-plugins
```

From a shell:

```text
claude plugin install git-guard --marketplace PedroRozas/claude-plugins
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `PedroRozas/claude-plugins`, then **Add plugin**.

Answer `y` to add the marketplace, then choose a scope. Install it at the **user** scope so it protects every project.

## Usage

| Command | What it does |
| --- | --- |
| `/git-allow commit` | Allows one commit |
| `/git-allow push` | Allows one push |
| `/git-allow force` | Allows one force push |
| `/git-allow both` | Allows one commit and one push |
| `/git-allow commit 3` | Allows three commits (the count goes from 1 to 50) |
| `/git-revoke` | Revokes every pending permission |

Arguments are `commit`, `push`, `force` and `both`. `ambos` is accepted too, in either language.

With the language set to Spanish, the commands are `/permitir` and `/revocar`.

A typical exchange:

```text
Claude: I would run  git commit -m "feat(cart): add coupon field"
        git-guard: missing permission for commit. Show the command and ask for
        authorization; the user grants it with /git-allow commit

You:    /git-allow commit

Claude: (runs the commit; the permission is now spent)
```

Permissions add up: `/git-allow push` twice gives two pushes. A grant that was not used expires when the next turn finishes, so a forgotten permission never stays open.

While you hold permissions, a line appears above the prompt with what is left and a **Revoke** button:

```text
git-guard: 2 commit left  [Revoke]
```

## Rules

| Rule | Always on | Option |
| --- | --- | --- |
| `git commit` and `git push` need a granted permission | yes | |
| A force push needs a `force` permission; a `push` permission does not cover it | yes | |
| One commit and one push per command (no `git commit ... && git commit ...`) | yes | |
| No commit or push inside a loop, `xargs`, `foreach` or `find -exec`, where one permission would cover many | yes | |
| Commit messages follow Conventional Commits (`type(scope): description`) | no | `conventionalCommits` |
| Commit messages are written in English | no | `englishMessages` |
| `gh pr create` (and its alias `gh pr new`) is blocked | no | `blockPullRequests` |
| `Co-Authored-By` trailers and "Generated with Claude" signatures are blocked | no | `blockAiAttribution` |

A force push is any push with `--force`, `-f`, `--force-with-lease`, `--mirror`, `--delete`, `--prune`, a `+` refspec (`git push origin +main`) or a `:` refspec (`git push origin :old-branch`).

When a message rule is active, the commit message must be passed with `-m` or a heredoc so it can be read (`git commit -F - <<'EOF'` counts as a heredoc). `git commit -F file` is rejected in that case. `git commit --no-edit` is not checked.

A rule you turn off is simply not applied.

### `blockAiAttribution` and the native `attribution` setting

Claude Code's own `attribution` setting (it replaced the deprecated `includeCoAuthoredBy`) decides what Claude Code adds to commits and PRs: `"attribution": { "commit": "", "pr": "" }` stops it from adding the trailer and the signature. Set that first.

`blockAiAttribution` is the check that runs after: it rejects a commit command that carries a `Co-Authored-By` trailer or a "Generated with Claude" line however it got there, for example because a project's instructions or the agent's habits put it back. If the native setting is enough for you, turn this rule off.

## Configuration

Open `/config` and look for **git-guard**:

| Option | Default | Description |
| --- | --- | --- |
| `language` | `en` | `en` or `es`. Sets the language of every message and of the commands (`/git-allow` and `/git-revoke`, or `/permitir` and `/revocar`) |
| `conventionalCommits` | `true` | Require Conventional Commits |
| `englishMessages` | `false` | Reject commit messages that look like Spanish |
| `blockPullRequests` | `true` | Block `gh pr create` |
| `blockAiAttribution` | `true` | Block `Co-Authored-By` trailers and "Generated with Claude" signatures |

`englishMessages` is a heuristic. It looks for Spanish accents and a list of common Spanish words, so it can miss a message and, rarely, flag an English one.

## How a failed command is settled

Before a command that spends a permission runs, git-guard reads the repository's refs (`git show-ref --head`) in the directory the command works in: the session's, or the one it moves to with `cd`, `pushd` or `git -C <dir>`. If the command succeeds, the permission is spent. If it fails, git-guard reads the refs again:

- the commit permission is spent only if `HEAD` or a local branch moved (a local branch covers a commit made in a linked worktree);
- the push or force permission is spent only if a remote-tracking ref (`refs/remotes/...`) changed.

So `git commit -m "..." && git push` that commits and then fails to push spends the commit and gives the push back. When the refs cannot be read (not a repository, or a directory written with `~` or a variable), a failed command spends everything it reserved: git-guard errs on the side of asking you again.

## Limitations

- **It is a net for the agent, not a barrier against you.** It reads the commands the agent runs through the Bash tool and matches them with regular expressions. It does not stop you from committing in your own terminal, and it is not meant as a security boundary.
- **It only sees Bash.** A commit made by another tool, a script, a Makefile target or a git alias (`git ci`) is invisible to it. Anything the agent runs inside such a script is not checked.
- **Pattern matching has edges.** It sees through `git -C`, `git -c` (quoted values included), other global options, quoted subcommands, line continuations, `command`, `env`, absolute paths to git, `bash -c` or `sh -c`, and heredocs fed to a shell or `ssh` (`bash <<EOF`, `/bin/sh -s <<EOF`, `cat <<EOF | bash`). Shell variables, `eval` of a built string or a command assembled at run time can still hide a `git commit`. Mentions of `git commit` inside other text (an `echo`, a `--grep` pattern) are treated as commits, so they ask for a permission they do not need.
- **Settling a failed push needs a remote-tracking ref.** A push to a URL or a remote with no tracking refs leaves nothing to compare, so if such a command fails the push permission is given back even if part of it ran. A `git fetch` or `git pull` in the same failing command moves the remote-tracking refs too, so the push permission is spent even if the push itself never ran.
- **Message checks need a readable message.** They work on `-m` arguments and heredocs, not on messages read from files, editors or commit templates.

## Development

```text
claude plugin validate .
claude plugin test .
```

To try a local copy, start Claude Code with `claude --plugin-dir <path-to-git-guard>`.

## License

MIT. See [LICENSE](LICENSE).
