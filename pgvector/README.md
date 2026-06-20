Runtime base image source for ndx2.

This directory owns the slow prebuilt image build that includes `pgvector`,
mecab-ko, mecab-ko-dic, textsearch_ko, Node, Docker CLI, Chromium, Playwright,
and shell/network runtime tools.

Run the update script to publish a multi-platform GHCR runtime-base image:

```sh
bash pgvector/publish-ghcr.sh
```

The script prompts for GHCR owner, tag, username, and token. It does not store
the token. The agent runtime image uses the published base image with:

```dockerfile
FROM ghcr.io/hikamaeng/ndx2-runtime-base:0.2.3
```
