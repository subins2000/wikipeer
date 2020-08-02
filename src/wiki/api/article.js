/* eslint-disable no-console */
import p2wiki from "../p2wiki";
import Article from "../models/article";

async function fetchArticle(language, title) {
  const [articleData, revisions, media, languages] = await p2wiki.fetchArticle(
    language,
    title
  );

  return new Article({
    pageid: articleData.lead.id,
    namespace: articleData.lead.ns,
    title: articleData.lead.normalizedtitle,
    description: articleData.lead.description,
    image: articleData.lead.image,
    issues: articleData.lead.issues,
    geo: articleData.lead.geo,
    pronunciation: articleData.lead.pronunciation,
    languagecount: articleData.lead.languagecount,
    wikidataId: articleData.lead.wikibase_item,
    lastmodifier: articleData.lead.lastmodifier,
    lastmodified: articleData.lead.lastmodified,
    revision: articleData.lead.revision,
    language,
    revisions,
    languages,
    media,
    _sections: [...articleData.lead.sections, ...articleData.remaining.sections]
  });
}

export default { fetchArticle };
