import p2wiki from "../p2wiki";

// fetch feed from p2wiki
function fetchFeed(language) {
  return p2wiki.fetchFeed(language);
}

function wikiSearch(language, query) {
  return p2wiki.wikiSearch(language, query);
}

function html2wikitext(language, html) {
  return p2wiki.html2wikitext(language, html);
}

export default {
  fetchFeed,
  wikiSearch,
  html2wikitext
};
