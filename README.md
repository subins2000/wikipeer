# Wikipeer

Decentralized P2P proxy to access Wikipedia using WebTorrent.

## Architecture

Terms used :

* Client -> A user that can't access Wikipedia by HTTP because it's blocked.
* Proxy -> A user that can access Wikipedia by HTTP.
* Compile (verb) -> Collect the text, images, media of a Wikipedia page and make a torrent.
* Seed (verb) -> Same as the seeding in bittorrent.
* Seed Hash -> Info Hash of torrent made by compiling the homepage.
* Share (verb) -> Listens for connection & communicate via P2PT by a special ID.

### P2PT

Read about [P2PT here](https://github.com/subins2000/p2pt).

The app identifier is "p2wiki". Since both clients and proxies will be in the same swarm, a proxy is identified in the intial message. Client will send "c" and proxies will send "p".

TODO: Maintain a balanced list of clients and proxies.

#### Consensus

Since we can't really trust a proxy, a consensus need to be reached to make a trust. A seed hash from a proxy is trusted when different proxies return the same info hash (seed hash) for a particular Share ID.

* Consensus value -> How many proxies should return the same info hash (seed hash) for it to be trusted and start downloading ?

### Homepage

The Wikipedia homepage (feed) is identified by the present date to share. Every proxy will by default share & seed the homepage. Once a client has the homepage, they will also seed it.

* Share ID -> `p2wiki-{year}-{month}-{date}`

A client will communicate with multiple proxies using share ID (because it can be calculated by every client). The proxy will respond back the seed hash. If all the proxies return the same share ID (see [consensus](#consensus)), the torrent of homepage is downloaded and displayed. The clients will store this homepage torrent and start seeding it.
