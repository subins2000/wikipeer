# Wikipeer

Decentralized P2P proxy in browser to access Wikipedia. Works entirely on [WebTorrent](https://webtorrent.io/) ecosystem with [P2PT](https://github.com/subins2000/p2pt). No installation needed, direct use from browser!

Wikipeer is available on the following domains, all static sites :

* [wikipeer.subinsb.com](https://wikipeer.subinsb.com)
* [wikipeer.herokuapp.com](https://wikipeer.herokuapp.com/)
* [dazzling-nightingale-9995ef.netlify.app](https://dazzling-nightingale-9995ef.netlify.app/)

This project can be also called (aka) :

* Access Wikipedia over WebRTC & Torrents
* Website proxy over WebRTC

## Architecture

Terms used :

* Client -> A user that can't access Wikipedia by HTTP because it's blocked.
* Proxy -> A user that can access Wikipedia by HTTP.
* Compile (verb) -> Collect the text, images, media of a Wikipedia page and make a torrent.
* Seed (verb) -> Same as the seeding in bittorrent.
* Info Hash -> Info Hash of torrent made by compiling a page.
* Feed -> Wikipedia homepage
* Article -> A Wikipedia article

Wikipeer uses [Wikivue](https://github.com/santhoshtr/wikivue) for the user interface. Wikipeer will continue to pull changes from Wikivue. Because of this, only the really necessary changes are made in the source code to avoid future merge conflicts. If you'd like to make improvements to the user interface, please send a patch to [Wikivue](https://github.com/santhoshtr/wikivue).

The Wikipeer implementation to Wikivue is mostly made by these files (ordered according to importance HIGH to LOW). Take a peek at them for understanding this document better.

* src/wiki/P2WikiClass.js
* src/wiki/api/*
* `src/components/ArticleContent.vue` & `src/components/ArticleSectionContent.vue` - These should hopefully be merged into Wikivue
* src/views/Home.vue

### Development

Wikipeer has two components :

* Browser: Any user opening  Wikipeer via browser can either be a client or proxy, but not both at the same time
* Node: Dedicated proxy service that runs in the terminal

`npm serve` - Runs Vue development server (browser part).

`npm proxy` - Runs the dedicated proxy.

`npm start` - Runs both proxy & Vue dev server.

Both browser & node can communicate with each other through WebRTC. The Node component is basically [WebTorrent-hybrid](https://github.com/webtorrent/webtorrent-hybrid).

### P2PT

Read about [P2PT here](https://github.com/subins2000/p2pt).

The app identifier is "p2wiki". Since both clients and proxies will be in the same swarm, a proxy is identified in the intial message. Client will send `c` and proxies will send `p`. All other communication between client & proxy is in JSON format.

TODO: Maintain a balanced list of clients and proxies.

#### Consensus

Since we can't really trust a proxy, a consensus need to be reached to make a trust. A response from a proxy is trusted when different proxies return the same response. This is done by equating checksum of response of each proxy.

* Consensus value (`const PROXY_TRUST_CONSENSUS_COUNT`) -> How many proxies should return the same response for it to be trusted and start downloading ?

Since Wikipeer is at its beginning, the consensus value is set to **1** that is all proxies are trusted and considered honest. This should be increased as Wikipeer grows with more proxies.

### Content

#### Feed

The Wikipedia feed (or homepage) is identified by the language & the present date. Every proxy will by default seed the feed. Once a client has the feed, they will also seed it (See [#torrent](#torrent))

When Wikipeer is visited, the client will request proxies for the "feed" :

```javascript
{
  get: "feed",
  lang: "en" // English
}
```

The proxies will respond back the info hash :

```javascript
{
  hash: "dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c"
}
```

If all the proxies return the same info hash (see [#consensus](#consensus)), the torrent of feed is downloaded and displayed. The clients will store this homepage torrent and start seeding it.

#### Article

A Wikipedia article is identified by language and title. Title may vary according to language.

Like the [#feed](#feed), proxies are requested for an article :

```javascript
{
  get: "article",
  lang: "ml" // Malayalam
  title: "കേരളം"
}
```

Response from proxy :

```javascript
{
  hash: "209c8226b299b308beaf2b9cd3fb49212dbd13ec"
}
```

This info hash reflects the latest revision of the article at the time of torrent creation.

* Torrent remove timeout -> A torrent is kept seeded by proxy for a particular `timePeriod`. If an article torrent is inactive (no downloads) for `timePeriod`, it's destroyed. This ensures proxies are not keeping less visited articles forever and save resources. This `timePeriod` is stored as minutes in `TORRENT_REMOVE_TIMEOUT`.

* Problem: If a frequently visited article is kept seeding, proxies may not give the latest revision, because proxies need to wait for `timePeriod` to complete for the torrent to get destroyed. Only after this will the latest revision be fetched, and a new torrent of the latest revision. This also cause honest (trusted) proxies to return different info hashes. <br/>
  Solution: The old revision torrent will be destroyed even though it might take time. This problem is not that big of a concern. Still it's a problem

#### Search

Result of search queries are not communicated by torrent, but instead directly sent by proxies. This is to speed up auto suggestion on entering search query.

```javascript
{
  get: "search",
  q: "query"
}
```

The proxies would respond with :

```javascript
{
  pages: {}, // results
  hash: "168fc8ca6cdb8c98502428dd0f9e5113" // MD5 hash of the previous pages object
}
```

The [#consensus](#consensus) rule applies here too using the `hash` value.

### Torrent

Any torrent client that supports WebTorrent (Seeding to web peers over WebRTC) can help in sharing articles to Wikipeer clients. The torrent needs to be made in a specific way so that the info hash made by different seeders/proxies will be the same.

When a client downloads a torrent, they will also seed it increasing the availability of that feed/article. There is no time limit like in proxy for destroying the torrent.