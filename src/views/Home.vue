<template>
  <v-container fluid grid-list-xl>
    <article>
      <v-layout justify-center row>
        <v-flex xs12 sm12 md10 lg10 v-if="tfa">
          <h2>Featured article</h2>
          <v-card
            :to="`/page/${contentLanguage}/${tfa.normalizedtitle}`"
            class="overflow-hidden"
            color="transparent"
            flat
          >
            <v-row class="overflow-hidden">
              <v-col class="pa-0 ma-0" cols="12" lg="6" md="6" sm="12">
                <v-img
                  :src="
                    tfa.originalimage
                      ? media[getFilename(tfa.originalimage.source)]
                      : require('@/assets/Wikipedia-logo-version-2.svg?lazy')
                  "
                  :lazy-src="
                    require('@/assets/Wikipedia-logo-version-2.svg?lazy')
                  "
                  height="250"
                  contain
                ></v-img>
              </v-col>
              <v-col class="pa-0 ma-0" cols="12" lg="6" md="6" sm="12">
                <v-card-title>
                  <h3 class="headline" v-html="tfa.displaytitle" />
                </v-card-title>
                <v-card-text>
                  <p class="text-body-1" v-html="tfa.extract_html"></p>
                </v-card-text>
              </v-col>
            </v-row>
          </v-card>
        </v-flex>
      </v-layout>
      <v-layout justify-center row>
        <v-flex xs12 sm12 md10 lg10>
          <h2>Trending</h2>
          <v-row justify="center">
            <v-col
              md="6"
              lg="4"
              sm="12"
              xs="12"
              v-for="article in [...mostreadArticles]"
              :key="article.pageid"
            >
              <v-card
                :to="`/page/${contentLanguage}/${article.normalizedtitle}`"
                min-width="300px"
                color="transparent"
                flat
              >
                <v-img
                  :src="
                    article.originalimage
                      ? media[getFilename(article.originalimage.source)]
                      : require('@/assets/Wikipedia-logo-version-2.svg?lazy')
                  "
                  contain
                  :lazy-src="
                    require('@/assets/Wikipedia-logo-version-2.svg?lazy')
                  "
                  :height="$vuetify.breakpoint.mdAndUp ? '250px' : 'auto'"
                ></v-img>

                <v-card-title class="pa-1">
                  <h4 class="headline" v-html="article.displaytitle" />
                </v-card-title>
                <v-card-text class="extract text-xs-left pa-1">
                  <h4 class="text-body-1">{{ article.description }}</h4>
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
        </v-flex>
      </v-layout>
    </article>
  </v-container>
</template>

<script>
import { mapState } from "vuex";
import generalApi from "../wiki/api/general";

export default {
  name: "Home",
  data: () => ({
    mostreadArticles: [],
    tfa: null,
    media: {}
  }),
  computed: {
    ...mapState({
      contentLanguage: state => state.app.contentLanguage
    })
  },
  watch: {
    contentLanguage: function() {
      this.feed();
    }
  },
  mounted: function() {
    this.feed();
  },
  methods: {
    feed() {
      generalApi.fetchFeed(this.contentLanguage).then(feed => {
        for (const filename in feed.p2wikiMedia) {
          const file = feed.p2wikiMedia[filename];

          // TODO: Cache this blob URL

          this.$set(this.media, filename, "");
          file.getBlobURL((err, url) => {
            this.$set(this.media, filename, url);
          });
        }

        this.mostreadArticles = feed.mostread.articles;
        this.tfa = feed.tfa;
      });
    },
    getFilename(url) {
      return url.match(/[^/\\&?]+\.\w{3,4}(?=([?&].*$|$))/gm)[0];
    }
  }
};
</script>
