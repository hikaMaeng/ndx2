# Architecture

The server owns admin HTTP serving. The front end is built with Vite and served as static assets by Express in production.

`apps/admin` depends on `ndx/common` and `ndx/admin/*`. Product rules stay in `packages/ndx`; this app owns process wiring, HTTP serving, and UI composition.
