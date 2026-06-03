pgvector base image source for ndx2.

This directory owns the slow PostgreSQL image build that includes `pgvector`,
mecab-ko, mecab-ko-dic, and textsearch_ko.

Run the update script to publish a multi-platform GHCR base image:

```sh
bash pgvector/publish-ghcr.sh
```

The script prompts for GHCR owner, tag, username, and token. It does not store
the token. The agent runtime image uses the published base image with:

```dockerfile
FROM ghcr.io/hikamaeng/ndx2-pgvector:0.2.0
```
