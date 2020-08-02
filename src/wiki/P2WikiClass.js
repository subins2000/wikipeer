/**
 * Decentralized P2P proxy to access Wikipedia
 * Copyright 2020 Subin Siby <mail@subinsb.com>
 * License - MIT
 */

const axios = require("axios");
const P2PT = require("p2pt");

const articleApi = require("./api/http-article");
const generalApi = require("./api/http-general");

let WebTorrent;
if (typeof window === "undefined") {
  WebTorrent = require("webtorrent-hybrid");
} else {
  WebTorrent = require("webtorrent");
}

const MD5 = require("md5.js");
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
    this.proxyProcessQueue = [];

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
        peer.respond("p").catch(error => {
          console.error(
            "Connection to client failed before handsahake. " + error
          );
        });
      } else {
        try {
          const type = msg.get;

          if (type === "feed") {
            this.makeFeedTorrent(msg.lang).then(torrent => {
              peer.respond({
                hash: torrent.infoHash
              });
            });
          } else if (type === "article") {
            console.log("Got request for article " + msg.title);

            this.makeArticleTorrent(msg.lang, msg.title).then(torrent => {
              peer.respond({
                hash: torrent.infoHash
              });
            });
          } else if (type === "search") {
            // Search
            generalApi.wikiSearch(msg.lang, msg.query).then(pages => {
              peer.respond({
                pages,
                hash: new MD5().update(JSON.stringify(pages)).digest("hex")
              });
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

          this.proxyProcessQueueDo();
        }
      });
    });

    this.p2pt.on("peerclose", peerID => {
      delete $this.proxyPeers[peerID];
      delete $this.proxyPeersID[this.proxyPeersID.indexOf(peerID)];
    });
    this.p2pt.start();
  }

  // Do process in proxy queue if atleast one proxy is available
  proxyProcessQueueDo() {
    return new Promise(resolve => {
      let process;
      while (
        this.proxyPeersID.length > 0 &&
        (process = this.proxyProcessQueue.shift()) !== undefined
      ) {
        const data = process[0];
        const callback = process[1];

        const responses = {};
        const responsesFrequency = {};

        for (const key in this.proxyPeers) {
          const peer = this.proxyPeers[key];

          this.p2pt.send(peer, data).then(([, response]) => {
            try {
              const hash = response.hash;

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

      resolve();
    });
  }

  // Send a message to all proxy peers.
  // callback will be only called if output
  // from all proxy is the same (consensus)
  proxySend(data, callback) {
    this.proxyProcessQueue.push([data, callback]);
    this.proxyProcessQueueDo();
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
            this.downloadTorrent(response.hash, torrent => {
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

  // Promise: get article
  fetchArticle(lang, title) {
    return new Promise(resolve => {
      if (
        this.fetchedContent.articles[lang] &&
        this.fetchedContent.articles[lang][title]
      ) {
        resolve(this.fetchedContent.articles[lang][title]);
      } else {
        this.proxySend(
          {
            get: "article",
            lang,
            title
          },
          response => {
            this.downloadTorrent(response.hash, torrent => {
              // [articleData, revisions, media, languages]
              const article = [];

              const getFile = filename => {
                return new Promise(resolve => {
                  for (const file of torrent.files) {
                    if (file.name === filename) {
                      file.getBuffer((error, buffer) => {
                        resolve(JSON.parse(buffer.toString()));
                      });
                      return;
                    }
                  }
                  // If no file resolve empty
                  // eg: might be no article in other langs
                  resolve([]);
                });
              };

              Promise.all([
                getFile("article.txt"),
                getFile("revisions.txt"),
                getFile("languages.txt")
              ]).then(([articleData, revisions, languages]) => {
                article[0] = articleData;
                article[1] = revisions;

                // media
                article[2] = {};
                torrent.files.forEach(file => {
                  if (!file.name.endsWith(".txt")) {
                    article[2][file.name] = file;
                  }
                });

                article[3] = languages;

                if (!this.fetchedContent.articles[lang]) {
                  this.fetchedContent.articles[lang] = {};
                }
                this.fetchedContent.articles[lang][title] = article;

                resolve(article);
              });
            });
          }
        );
      }
    });
  }

  // Promise: get search query results
  wikiSearch(lang, query) {
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
            get: "search",
            lang,
            query
          },
          response => {
            resolve(response.pages);
          }
        );
      }
    });
  }

  // Promise: get a File object from a URL
  getFileFromURL(filename, url) {
    return new Promise((resolve, reject) => {
      if (url.substr(0, 2) === "//") url = "https:" + url;

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
                `proxy: Making feed-${lang}: Fetched image ${files.length -
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

  makeArticleTorrent(lang, articleTitle) {
    return new Promise((resolve, reject) => {
      if (
        this.seedingTorrents.articles[lang] &&
        this.seedingTorrents.articles[lang][articleTitle]
      ) {
        resolve(this.seedingTorrents.articles[lang][articleTitle].torrent);
        return;
      }

      // Torrent files
      const files = [];

      const fetchMedia = () => {
        return new Promise((resolve, reject) => {
          // Media stats
          const media = {
            fetched: 0,
            total: 0
          };

          articleApi
            .fetchMedia(lang, articleTitle)
            .then(response => {
              for (const item of response.items) {
                // Skip non-images
                if (!item.srcset) {
                  continue;
                }

                this.getFileFromURL(item.title, item.srcset[0].src).then(
                  file => {
                    files.push(file);
                    media.fetched++;

                    debug(
                      `proxy: Article-${lang} '${articleTitle}': Fetched media ${media.fetched}/${media.total}`
                    );

                    if (media.fetched === media.total) resolve();
                  }
                );

                media.total++;
              }

              debug(
                `proxy: Article-${lang} '${articleTitle}': Fetched medialist. Has ${media.total} media files`
              );
            })
            .catch(error => {
              reject(error);
            });
        });
      };

      const fetchArticle = () => {
        const api = `https://${lang}.wikipedia.org/api/rest_v1/page/mobile-sections/${encodeURIComponent(
          articleTitle
        )}`;
        return axios.get(api).then(response => response.data);
      };

      const fetchRevisions = articleApi.fetchRevisions;
      const fetchLanguages = articleApi.fetchLanguages;

      Promise.all([
        fetchArticle(lang, articleTitle),
        fetchRevisions(lang, articleTitle),
        fetchLanguages(lang, articleTitle),
        fetchMedia(lang, articleTitle)
      ])
        .then(([articleData, revisions, languages]) => {
          files.push(this.makeFile("article.txt", JSON.stringify(articleData)));
          files.push(this.makeFile("revisions.txt", JSON.stringify(revisions)));

          if (languages) {
            files.push(
              this.makeFile("languages.txt", JSON.stringify(languages))
            );
          }

          this.wt.seed(
            files,
            {
              announceList: [this.announceURLs],
              name: articleData.lead.normalizedtitle
            },
            torrent => {
              if (!this.seedingTorrents.articles[lang]) {
                this.seedingTorrents.articles[lang] = {};
              }

              this.seedingTorrents.articles[lang][articleTitle] = {
                lastActive: new Date(),
                torrent
              };

              torrent.on("upload", () => {
                this.seedingTorrents.articles[lang][
                  articleTitle
                ].lastActive = new Date();
              });

              debug(
                `proxy: Article-${lang} '${articleTitle}': Seeding at ${torrent.infoHash}`
              );

              resolve(torrent);
            }
          );
        })
        .catch(error => {
          reject(error);
        });
    });
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
