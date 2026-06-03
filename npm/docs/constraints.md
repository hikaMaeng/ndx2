# Constraints

The CLI must not build repository code. It only starts already-published public
GHCR images.

The package must not include npm tokens, GitHub tokens, generated compose state,
or user volume data.

The compose template must keep PostgreSQL internal to the compose network and
must not expose a host PostgreSQL port.
