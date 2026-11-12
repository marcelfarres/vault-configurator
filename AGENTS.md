# Agent notes

## GitHub: this fork is the working repo

`vcolombo/vault-configurator` is a fork of `marcelfarres/vault-configurator`, but all issues, PRs and
releases live here — never open issues or PRs against upstream.

`gh` caches a per-clone "base repo" (`gh-resolved` in `.git/config`) and, in a fork clone, resolves it
to the parent. Before any `gh` work in a fresh clone, pin it once:

```sh
gh repo set-default vcolombo/vault-configurator
```

Even with the pin, pass `--repo vcolombo/vault-configurator` explicitly when creating issues/PRs, and
verify afterwards (`gh pr view <n> --repo vcolombo/vault-configurator`) that the result landed here.
A PR accidentally opened upstream must be closed there and reopened here.
