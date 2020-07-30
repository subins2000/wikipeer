/**
 * Decentralized P2P proxy to access Wikipedia
 * Copyright 2020 Subin Siby <mail@subinsb.com>
 * License - MIT
 */

const axios = require("axios");
const P2PT = require("p2pt");
const generalApi = require("./api/http-general");

let WebTorrent;
if (typeof window === "undefined") {
  WebTorrent = require("webtorrent-hybrid");
} else {
  WebTorrent = require("webtorrent");
}

const parallel = require("run-parallel");
const debug = require("debug")("p2wiki");

/**
 * For client peers
 * How many peers should return the same infoHash to start downloading the torrent ?
 */
const PROXY_TRUST_CONSENSUS_COUNT = 1;

/**
 * For both client & proxy peers
 * How many minutes should an article torrent be kept seeding if nobody is downloading it
 */
const TORRENT_REMOVE_TIMEOUT = 2;

class P2Wiki {
  constructor(announceURLs) {
    this.announceURLs = announceURLs;

    this.proxyPeers = {};
    this.proxyPeersID = [];
    this.curProxyPeerIndex = 0;

    // For proxy
    this.seedingTorrents = {
      feed: {}, // {date: {lang: torrent}}
      articles: {}
    };

    // For client
    this.fetchedContent = {
      feed: {}, // {date: {lang: torrent}}
      articles: {}
    };

    this.wt = new WebTorrent();
    this.p2pt = new P2PT(announceURLs, "p2wiki");
  }

  startProxy() {
    const $this = this;

    this.p2pt.on("msg", (peer, msg) => {
      if (msg === "c") {
        // Yes, I'm a proxy
        peer.respond("p").catch(err => {
          console.error(
            "Connection to client failed before handsahake. " + err
          );
        });
      } else {
        try {
          msg = JSON.parse(msg);
          const type = msg.get;

          if (type === "feed") {
            this.makeFeedTorrent(msg.lang).then(torrent => {
              peer.respond(
                JSON.stringify({
                  infoHash: torrent.infoHash
                })
              );
            });
          } else if (type === "article") {
            var articleName = encodeURIComponent(msg.articleName);

            console.log("Got request for article " + articleName);

            $this
              .makeArticleTorrent(msg.articleName)
              .then(torrent => {
                peer.respond(torrent.infoHash);
              })
              .catch(error => {
                console.log("Torrent creation failed : " + error);

                // Torrent creation failed
                delete $this.seedingTorrents[articleName];
              });
          }
        } catch (e) {
          console.log(e);
        }
      }
    });
    this.p2pt.start();

    parallel([
      () => {
        setInterval(() => {
          var minutes = TORRENT_REMOVE_TIMEOUT * 60 * 1000;
          var timeNow = new Date();
          var torrentInfo;
          for (var key in $this.seedingTorrents) {
            torrentInfo = $this.seedingTorrents[key];
            if (
              torrentInfo.lastActive &&
              timeNow - torrentInfo.lastActive > minutes
            ) {
              torrentInfo.torrent.destroy();
            }
          }

          // Stop feed torrents after UTC day is over
          const feedIDs = Object.keys(this.seedingTorrents.feed).sort();
          if (feedIDs.length > 1) {
            for (const lang in this.seedingTorrents.feed[feedIDs[0]]) {
              this.seedingTorrents.feed[feedIDs[0]][lang].destroy();
            }
            debug("Deleted previous day feed");
          }
        }, 10000);
      }
    ]);
  }

  startClient() {
    const $this = this;
    this.p2pt.on("peerconnect", peer => {
      $this.p2pt.send(peer, "c").then(([peer, response]) => {
        if (response === "p") {
          if ($this.proxyPeers[peer.id]) {
            peer.destroy();
          } else {
            $this.proxyPeers[peer.id] = peer;
            $this.proxyPeersID.push(peer.id);
          }

          debug(
            "client: got a proxy. Total proxies now : " +
              this.proxyPeersID.length
          );
        }
      });
    });

    this.p2pt.on("peerclose", peerID => {
      delete $this.proxyPeers[peerID];
      delete $this.proxyPeersID[this.proxyPeersID.indexOf(peerID)];
    });
    this.p2pt.start();
  }

  getAProxyPeer() {
    if (this.proxyPeersID.length === 0) {
      return false;
    }

    if (this.curProxyPeerIndex > this.proxyPeersID.length - 1) {
      this.curProxyPeerIndex = 0;
    }

    return this.proxyPeers[this.proxyPeersID[this.curProxyPeerIndex]];
  }

  // Send a message to all proxy peers
  // callback will be only called if output
  // from all proxt is the same (consensus)
  proxySend(data, callback) {
    const responses = {};
    const responsesFrequency = {};

    for (const key in this.proxyPeers) {
      const peer = this.proxyPeers[key];

      this.p2pt.send(peer, JSON.stringify(data)).then(([, response]) => {
        try {
          response = JSON.parse(response);
          const hash = response.infoHash;

          if (!responsesFrequency[hash]) {
            responses[hash] = response;
            responsesFrequency[hash] = 0;
          }
          responsesFrequency[hash]++;

          if (responsesFrequency[hash] >= PROXY_TRUST_CONSENSUS_COUNT) {
            callback(responses[hash]);
          }
        } catch (e) {
          debug("client: invalid response from proxy. " + e);
        }
      });
    }
  }

  // Promise: get feed/homepage
  fetchFeed(lang) {
    return new Promise(resolve => {
      const feedID = this.getTodayDate();

      if (
        this.fetchedContent.feed[feedID] &&
        this.fetchedContent.feed[feedID][lang]
      ) {
        resolve(this.fetchedContent.feed[feedID][lang]);
      } else {
        this.proxySend(
          {
            get: "feed",
            lang
          },
          response => {
            this.downloadTorrent(response.infoHash, torrent => {
              // The response emulates the original HTTP API response
              // "p2wiki" is prepended to new elements
              const feed = {
                tfa: {},
                mostread: {},
                p2wikiMedia: {}
              };

              const completed = () => {
                if (!this.fetchedContent.feed[feedID]) {
                  this.fetchedContent.feed[feedID] = {};
                }
                this.fetchedContent.feed[feedID][lang] = feed;
                resolve(feed);
              };

              // file is WebTorrent's File object
              torrent.files.forEach(file => {
                if (file.name === "tfa.txt") {
                  file.getBuffer((error, buffer) => {
                    feed.tfa = JSON.parse(buffer.toString());
                    if (feed.mostread.articles) completed();
                  });
                } else if (file.name === "mostread.txt") {
                  file.getBuffer((error, buffer) => {
                    feed.mostread = JSON.parse(buffer.toString());
                    if (feed.tfa.title) completed();
                  });
                } else {
                  // rest is media
                  feed.p2wikiMedia[file.name] = file;
                }
              });
            });
          }
        );
      }
    });
  }

  // Promise: get a File object from a URL
  getFileFromURL(filename, url) {
    return new Promise((resolve, reject) => {
      axios({
        method: "get",
        url: url,
        responseType: typeof window === "undefined" ? "arraybuffer" : "blob"
      })
        .then(response => {
          const file = this.makeFile(
            filename,
            response.data,
            response.headers["content-type"]
          );

          resolve(file);
        })
        .catch(error => {
          reject(error);
        });
    });
  }

  // make a File object for WebTorrent
  makeFile(filename, content, type = "text/plain") {
    if (typeof File !== "undefined") {
      return new File([content], filename, { type });
    } else {
      const file = Buffer.from(content);
      file.name = filename;
      file.type = type;
      return file;
    }
  }

  // Get today's UTC date split by '-'
  getTodayDate() {
    const today = new Date();
    const year = today.getUTCFullYear();
    const month = ("0" + (today.getUTCMonth() + 1)).slice(-2);
    const date = ("0" + today.getUTCDate()).slice(-2);
    return `${year}-${month}-${date}`;
  }

  // Make torrent of feed, resolves wih torrent object
  makeFeedTorrent(lang) {
    return new Promise(resolve => {
      // feed date
      const feedID = this.getTodayDate();

      if (
        this.seedingTorrents.feed[feedID] &&
        this.seedingTorrents.feed[feedID][lang]
      ) {
        resolve(this.seedingTorrents.feed[feedID][lang]);
      } else {
        debug(`proxy: Making feed-${lang}`);

        generalApi.fetchFeed(lang).then(feed => {
          /**
           * The files in torrent. Will have :
           * tfa.txt: feed.tfa JSON stringified
           * tfaImage: Featured Article image file
           */
          const files = [];

          // All media files
          const media = [];

          // The Featured Article
          const tfa = feed.tfa;
          files.push(this.makeFile("tfa.txt", JSON.stringify(tfa)));
          media.push(tfa.originalimage.source);

          // Most Read Articles
          const mostread = feed.mostread;
          files.push(this.makeFile("mostread.txt", JSON.stringify(mostread)));

          for (const article of mostread.articles) {
            if (article.originalimage) media.push(article.originalimage.source);
          }

          // NOTE: Featured image, news & On This Day is not implemented in Wikivue

          // Download all media
          for (const m of media) {
            const filename = m.match(/[^/\\&?]+\.\w{3,4}(?=([?&].*$|$))/gm)[0];
            this.getFileFromURL(filename, m).then(file => {
              files.push(file);

              debug(
                `proxy: Making feed-${lang} : Fetched image ${files.length -
                  2}/${media.length}`
              );

              ifCompletedMakeTorrent();
            });
          }

          const ifCompletedMakeTorrent = () => {
            const neededFileCount = 2 + media.length;

            if (files.length === neededFileCount) {
              // All files downloaded, make torrent
              this.wt.seed(
                files,
                {
                  announceList: [this.announceURLs],
                  name: "feed"
                },
                torrent => {
                  if (!this.seedingTorrents.feed[feedID]) {
                    this.seedingTorrents.feed[feedID] = {};
                  }
                  this.seedingTorrents.feed[feedID][lang] = torrent;

                  debug(
                    `proxy: Started seeding feed-${lang} : ${torrent.infoHash}`
                  );

                  resolve(torrent);
                }
              );
            }
          };
        });
      }
    });
  }

  makeArticleTorrent(articleName) {
    const $this = this;

    return new Promise((resolve, reject) => {
      articleName = encodeURIComponent(articleName);

      if ($this.seedingTorrents[articleName]) {
        if ($this.seedingTorrents[articleName].torrent) {
          resolve($this.seedingTorrents[articleName].torrent);
        }
        return;
      }

      // Started making torrent
      $this.seedingTorrents[articleName] = {};

      var files = [];
      var fetched = {
        title: "",
        article: false,
        media: [],
        mediaCount: 0
      };

      var ifCompletedMakeTorrent = () => {
        if (fetched.article && fetched.media.length === fetched.mediaCount) {
          $this.wt.seed(
            files,
            {
              announceList: [$this.announceURLs],
              name: fetched.title
            },
            torrent => {
              $this.seedingTorrents[articleName] = {
                lastActive: new Date(),
                torrent: torrent
              };

              torrent.on("upload", () => {
                $this.seedingTorrents[articleName].lastActive = new Date();
              });

              debug(
                `Started seeding article '${articleName}' : ${torrent.infoHash}`
              );

              resolve(torrent);
            }
          );
        }
      };

      axios
        .get(
          `//en.wikipedia.org/w/api.php?action=parse&format=json&page=${articleName}&prop=text&formatversion=2&origin=*`
        )
        .then(response => {
          const file = this.makeFile(
            "article.html",
            response.data.parse.text,
            "text/html"
          );
          files.push(file);

          fetched.title = response.data.parse.title;
          fetched.article = true;

          debug(`Article ${articleName} : Fetched text`);

          ifCompletedMakeTorrent();
        })
        .catch(error => {
          reject(error);
        });

      axios
        .get(`//en.wikipedia.org/api/rest_v1/page/media-list/${articleName}`)
        .then(response => {
          var item;
          for (var key in response.data.items) {
            item = response.data.items[key];

            // Skip non-images
            if (!item.srcset) {
              continue;
            }

            this.getFileFromURL(item.title, item.srcset[0].src).then(file => {
              files.push(file);
              fetched.media.push(item.title);

              debug(
                `Article ${articleName} : Fetched image ${fetched.media.length}/${fetched.mediaCount}`
              );
            });
            fetched.mediaCount++;
          }

          debug(
            `Article ${articleName} : Fetched medialist. Has ${fetched.mediaCount} images`
          );
        })
        .catch(error => {
          reject(error);
        });
    });
  }

  requestArticle(articleName, callback) {
    this.p2pt.requestMorePeers();

    if (this.proxyPeers.length === 0) {
      return false;
    }

    const $this = this;

    var peer;
    var responseInfoHashes = [];

    for (var key in this.proxyPeers) {
      peer = this.proxyPeers[key];

      this.p2pt
        .send(
          peer,
          JSON.stringify({
            articleName: articleName
          })
        )
        .then(([, response]) => {
          // response will be torrent infohash
          responseInfoHashes.push(response);
          var infoHash = $this.checkConsensus(responseInfoHashes);

          if (infoHash) {
            console.log("1");
            $this.downloadTorrent(infoHash, torrent => {
              var article = {
                title: "",
                text: null,
                media: {}
              };

              torrent.files.forEach(file => {
                if (file.name === "article.html") {
                  article.title = torrent.name;
                  article.text = file;
                } else {
                  article.media[file.name] = file;
                }
              });

              callback(article);
            });
          }
        });
    }
  }

  checkConsensus(infoHashes) {
    var infoHashesFrequency = {};
    var infoHash;

    for (var key in infoHashes) {
      infoHash = infoHashes[key];
      if (!infoHashesFrequency[infoHash]) {
        infoHashesFrequency[infoHash] = 0;
      }
      infoHashesFrequency[infoHash]++;

      if (infoHashesFrequency[infoHash] >= PROXY_TRUST_CONSENSUS_COUNT) {
        return infoHash;
      }
    }
    return false;
  }

  downloadTorrent(infoHash, onTorrent) {
    if (this.wt.get(infoHash)) {
      onTorrent(this.wt.get(infoHash));
    } else {
      this.wt.add(
        infoHash,
        {
          announce: this.announceURLs
        },
        onTorrent
      );
    }
  }
}

module.exports = P2Wiki;
