# Create PR

Split the current working tree changes into well-organized commits, push to a branch, and open a pull request.

## Steps

1. **Identify the related issue.** Ask me which GitHub issue this work addresses. If I provide an issue number, fetch its title and body with:

   ```
   gh issue view <number> --json number,title,body
   ```

   Use the issue number throughout: in the branch name, commit messages, and PR title. If I say there's no issue, proceed without one.

2. **Assess the current state.** Run these in parallel:
   - `git status` to see all staged, unstaged, and untracked changes
   - `git diff` and `git diff --cached` to understand what changed
   - `git branch --show-current` to check if we're on `main`
   - `git log --oneline -5` to see recent commit style

3. **Create a feature branch (if on main).** Pick a short, descriptive branch name that includes the issue number if one exists (e.g. `feat/42-prad-and-target-helper`, `fix/17-build-config`). Run:

   ```
   git checkout -b <branch-name>
   ```

   If already on a non-main branch, stay on it.

4. **Group changes into logical commits.** Analyze all modified, deleted, and untracked files. Group them by concern — for example:
   - **Build / config changes**: `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `module.json`, `eslint.config.js`
   - **Shared utilities**: `src/shared/**`, `src/constants.ts`, `src/types/**`
   - **Feature: prad**: `src/prad/**` and its style/template/lang assets
   - **Feature: target-helper**: `src/target-helper/**` and its style/template/lang assets
   - **Hook wiring / module entry**: `src/hooks/**`, `src/module.ts`
   - **Top-level styles**: `styles/module.scss`
   - **Deleted files**: group file deletions with a clear "remove" commit message
   - **Cursor config**: `.cursor/**` (rules, commands, skills)

   Not every group needs its own commit — merge small related groups together. Aim for 2-6 commits that each tell a coherent story. Each commit message should follow conventional-commit style (`feat:`, `chore:`, `refactor:`, `fix:`, `docs:`) and briefly explain *why*, not just *what*. If there is a linked issue, include `#<number>` in each commit message (e.g. `feat: add prad attack interception #42`).

5. **Stage and commit each group sequentially.** For each logical group:

   ```
   git add <files...>
   git commit -m "<type>: <description> #<issue>"
   ```

   After all commits, run `git status` to confirm a clean working tree.

6. **Push the branch.**

   ```
   git push -u origin HEAD
   ```

7. **Create the pull request.** Use `gh pr create` with:
   - A clear title summarizing the overall change — if there is a linked issue, prefix with the issue number (e.g. `#42: Add PRAD and target helper features`)
   - A body with a `## Summary` section containing 2-5 bullet points describing what was done and why
   - If there is a linked issue, include `Closes #<number>` at the top of the body so GitHub auto-closes it on merge
   - A `## Commits` section listing each commit with its message so the PR description serves as a changelog

   Use a HEREDOC for the body to preserve formatting:

   ```
   gh pr create --title "<title>" --body "$(cat <<'EOF'
   Closes #<number>

   ## Summary
   - ...

   ## Commits
   - ...
   EOF
   )"
   ```

8. **Return the PR URL** so I can review it.

## Important

- NEVER force push or amend commits that have been pushed
- NEVER commit `.env`, credentials, or secrets
- Do NOT commit `node_modules/` or `dist/`
- If `npm run lint` or `npm run build` is available, consider running it before committing to catch issues early
- Keep commit messages concise (under 72 chars for the subject line)
- If there are only a handful of related changes, a single commit is fine — don't over-split
