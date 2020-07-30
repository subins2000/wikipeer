const P2Wiki = require("./src/wiki/P2WikiClass.js");

let announceURLs = [
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.sloppyta.co:443/announce",
  "wss://tracker.novage.com.ua:443/announce",
  "wss://tracker.btorrent.xyz:443/announce"
];

if (process.env["TRACKER"]) {
  announceURLs = [process.env["TRACKER"]];
}

const p2wiki = new P2Wiki(announceURLs);
p2wiki.startProxy();
