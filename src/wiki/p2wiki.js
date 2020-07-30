import P2Wiki from "./P2WikiClass";

let announceURLs = [
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.sloppyta.co:443/announce",
  "wss://tracker.novage.com.ua:443/announce",
  "wss://tracker.btorrent.xyz:443/announce"
];

if (window.location.hostname === "localhost") {
  announceURLs = ["ws://localhost:5000"];
}

const p2wiki = new P2Wiki(announceURLs);

if (localStorage["proxy"]) {
  p2wiki.startProxy();
} else {
  p2wiki.startClient();
}

export default p2wiki;
