# Changelog

## 0.4.0

### Added

- Force pushes need their own permission, `/git-allow force` (`/permitir force` in Spanish). A `push` permission no longer covers `--force`, `-f`, `--force-with-lease`, `--mirror`, `--delete`, `--prune`, `+refspec` or `:refspec`.
- `gh pr new`, the alias of `gh pr create`, is blocked with it.
- Commits and pushes inside a loop, `xargs`, `foreach` or `find -exec` are rejected, since one permission would cover many.
- `git commit -F - <<'EOF'` is accepted when a message rule is on: the heredoc is the message.
- A "Why not a native ask rule?" section in the README, and how `blockAiAttribution` relates to Claude Code's `attribution` setting.
- CI that runs `claude plugin validate` and `claude plugin test` on every push and pull request.

### Fixed

- A failed command is settled against the repository's refs instead of its exit code. `git commit -m "..." && git push` that commits and then fails to push spends the commit and returns only the push. Before, both were returned and the agent could commit once more.
- The matcher now sees quoted and partly quoted option values (`git -C "/a dir" commit`, `git -c user.name="Claude Bot" commit`), short global flags (`git -p push`), quoted subcommands (`git "commit"`), line continuations, and commands fed to a shell through a heredoc (`bash <<EOF`, `/bin/sh -s <<EOF`, `cat <<EOF | bash`, `ssh host <<EOF`).
- Text in any heredoc that is not fed to a shell is no longer read as a command, and a command on the heredoc's opening line is no longer hidden with it.
- The commit message is read from the commit's own heredoc or `-m`, not from an earlier heredoc in the same command.
- A commit is detected when `HEAD` or any local branch moves, so a commit made in a linked worktree is not given back.

### Changed

- When a command fails and the repository's refs cannot be read, the permissions it reserved are spent instead of returned.

## 0.3.0

- First public release: counted, expiring permissions for `git commit` and `git push`; `/git-allow` and `/git-revoke` (or `/permitir` and `/revocar`); a band above the prompt with a Revoke button; options `language`, `conventionalCommits`, `englishMessages`, `blockPullRequests` and `blockAiAttribution`.
