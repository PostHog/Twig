> [!IMPORTANT] > `arr` is still in development and not production-ready. Interested? Email jonathan@posthog.com

# arr

arr is CLI for stacked PR management using Jujutsu (`jj`).

Split your work into small changes, push them as a PR stack, and keep everything in sync.

## Install

Requires [Bun](https://bun.sh).

```
git clone https://github.com/posthog/array
cd array
pnpm install
pnpm --filter @array/core build
```

Then install the `arr` command (symlinked to `~/bin/arr`):

```
./apps/cli/arr.sh install
```

## Usage

```
arr init                # set up arr in a git repo
arr create "message"    # new change on stack
arr submit              # push stack, create PRs
arr merge               # merge stack of PRs
arr sync                # fetch, rebase, cleanup merged
arr up / arr down       # navigate stack
arr log                 # show stack
arr exit                # back to git
arr help --all          # show all commands
```

## Example

```
$ echo "user model" >> user_model.ts
$ arr create "Add user model"
✓ Created add-user-model-qtrsqm

$ echo "user api" >> user_api.ts
$ arr create "Add user API"
✓ Created add-user-api-nnmzrt

$ arr log
◉ (working copy)
│ Empty
○ 12-23-add-user-api nnmzrtzz (+1, 1 file)
│ Not submitted
○ 12-23-add-user-model qtrsqmmy (+1, 1 file)
│ Not submitted
○ main

$ arr submit
Created PR #8: 12-23-add-user-model
  https://github.com/username/your-repo/pull/8
Created PR #9: 12-23-add-user-api
  https://github.com/username/your-repo/pull/9

$ arr merge
...

$ arr sync
```

Each change becomes a PR. 
Stacked PRs are explained through a generated comments so reviewers see the dependency.

## FAQ

**Can I use this with an existing `git` repo?**

Yes, do so by using `arr init` in any `git` repo. `jj` works alongside `git`.

**Do my teammates need to use `arr` or `jj`?**

No, your PRs are normal GitHub PRs. Teammates review and merge them as usual. `jj` has full support for `git`.

**What if I want to stop using `arr`?**

Run `arr exit` to switch back to `git`. Your repo, branches, and PRs stay exactly as they are.

## Learn more

- [`jj` documentation](https://jj-vcs.github.io/jj/latest/) - full `jj` reference
- [`jj` tutorial](https://jj-vcs.github.io/jj/latest/tutorial/) - getting started with `jj`
- `arr help`
