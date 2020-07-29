# Wikipeer

Decentralized P2P proxy to access Wikipedia using WebTorrent.

can be also called :
* Access Wikipedia over WebRTC
* Proxy over WebRTC

## Architecture

Terms used :

* Client -> A user that can't access Wikipedia by HTTP because it's blocked.
* Proxy -> A user that can access Wikipedia by HTTP.
* Compile (verb) -> Collect the text, images, media of a Wikipedia page and make a torrent.
* Seed (verb) -> Same as the seeding in bittorrent.
* Info Hash -> Info Hash of torrent made by compiling a page.

### P2PT

Read about [P2PT here](https://github.com/subins2000/p2pt).

The app identifier is "p2wiki". Since both clients and proxies will be in the same swarm, a proxy is identified in the intial message. Client will send "c" and proxies will send "p".

TODO: Maintain a balanced list of clients and proxies.

#### Consensus

Since we can't really trust a proxy, a consensus need to be reached to make a trust. A info hash from a proxy is trusted when different proxies return the same info hash.

* Consensus value -> How many proxies should return the same info hash (info hash) for it to be trusted and start downloading ?

### Homepage

The Wikipedia homepage (feed) is identified by the language & the present date. Every proxy will by default seed the homepage. Once a client has the homepage, they will also seed it.

When Wikipeer is visited, the client will request proxies for the "feed". The proxies will respond back the info hash. If all the proxies return the same info hash (see [consensus](#consensus)), the torrent of homepage is downloaded and displayed. The clients will store this homepage torrent and start seeding it.
