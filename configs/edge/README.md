# Edge routing ownership

Karda L2 routing is configured in Opera product registration. The production
origin is `https://karda.ruyin.work`, upstream `100.76.219.48:3240`.
Do not install nginx snippets, edit platform server variables or add a redirect
from the historical origin. Platform configuration must reconcile the edge.

`karda.vxture.com.conf` is a historical bootstrap artifact only, retained for
provenance. It is not the current routing source and must not be installed.
Product deployment does not install any file from this directory on the edge.

The operator secret file remains outside the release tree. Product-owned public
origin settings ship in deploy/config/integration-production.env. No beta route
or server exists yet (TD-001).
