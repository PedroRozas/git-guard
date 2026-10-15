# git-guard

A Claude Code plugin that keeps the agent from committing, pushing or opening pull requests on its own. It can only do those things after you grant a permission that is counted and expires by itself.

## The problem

Left alone, an agent can commit half-finished work, push to a shared branch or open a PR you were not ready to publish. Reviewing each Bash call by hand does not scale, and a blanket "always allow git" rule is too broad.

git-guard sits in front of every Bash command the agent runs and applies one rule: **no `git commit`, `git push` or `gh pr create` unless you said so, explicitly and for a specific number of uses**.

- The agent proposes the command and asks. You answer with `/git-allow`.
- The permission is spent as the agent uses it, one per commit or push. If the command fails (a non-zero exit, an interruption or a denial), the permission is given back.
- If the agent does not use it, it expires when the turn after your grant ends.
- On top of that, it checks the commit message before the commit runs.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install git-guard --marketplace PedroRozas/git-guard
```

From a shell:

```
claude plugin install git-guard --marketplace PedroRozas/git-guard
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `PedroRozas/git-guard`, then **Add plugin**.

Answer `y` to add the marketplace, then choose a scope. Install it at the **user** scope so it protects every project.

## Usage

| Command | What it does |
| --- | --- |
| `/git-allow commit` | Allows one commit |
| `/git-allow push` | Allows one push |
| `/git-allow both` | Allows one commit and one push |
| `/git-allow commit 3` | Allows three commits (the count goes from 1 to 50) |
| `/git-revoke` | Revokes every pending permission |

Arguments are `commit`, `push` and `both`. `ambos` is accepted too, in either language.

With the language set to Spanish, the commands are `/permitir` and `/revocar`.

A typical exchange:

```
Claude: I would run  git commit -m "feat(cart): add coupon field"
        git-guard: missing permission for commit. Show the command and ask for
        authorization; the user grants it with /git-allow commit

You:    /git-allow commit

Claude: (runs the commit; the permission is now spent)
```

Permissions add up: `/git-allow push` twice gives two pushes. A grant that was not used expires when the next turn finishes, so a forgotten permission never stays open.

While you hold permissions, a line appears above the prompt with what is left and a **Revoke** button:

```
git-guard: 2 commit left  [Revoke]
```

## Rules

| Rule | Always on | Option |
| --- | --- | --- |
| `git commit` and `git push` need a granted permission | yes | |
| One commit and one push per command (no `git commit ... && git commit ...`) | yes | |
| Commit messages follow Conventional Commits (`type(scope): description`) | no | `conventionalCommits` |
| Commit messages are written in English | no | `englishMessages` |
| `gh pr create` is blocked | no | `blockPullRequests` |
| `Co-Authored-By` trailers and "Generated with Claude" signatures are blocked | no | `blockAiAttribution` |

When a message rule is active, the commit message must be passed with `-m` or a heredoc so it can be read. `git commit -F file` is rejected in that case. `git commit --no-edit` is not checked.

A rule you turn off is simply not applied.

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

## Limitations

- **It is a net for the agent, not a barrier against you.** It reads the commands the agent runs through the Bash tool and matches them with regular expressions. It does not stop you from committing in your own terminal, and it is not meant as a security boundary.
- **It only sees Bash.** A commit made by another tool, a script, a Makefile target or a git alias is invisible to it. Anything the agent runs inside such a script is not checked.
- **Pattern matching has edges.** Unusual quoting, shell variables or a command assembled at run time can hide a `git commit` from the matcher.
- **A failed command gives back everything it reserved.** git-guard only knows whether the whole Bash command succeeded. If `git commit -m "..." && git push` commits and then the push fails, both permissions are returned, so the agent could make one more commit before the grant expires.
- **Message checks need a readable message.** They work on `-m` arguments and heredocs, not on messages read from files, editors or commit templates.

## Development

```
claude plugin validate .
claude plugin test .
```

To try a local copy, start Claude Code with `claude --plugin-dir <path-to-git-guard>`.

## License

MIT. See [LICENSE](LICENSE).
