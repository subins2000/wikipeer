<template>
  <v-layout justify-center align-center row fill-height>
    <v-card class="my-5" :elevation="0">
      <v-card-title>
        <h1 align="center">
          <span class="cap">W</span><span class="smallcap">ikipee</span
          ><span class="cap">R</span>&nbsp;&nbsp;
          <v-icon x-large>{{ mdiAccountMultiplePlus }}</v-icon>
        </h1>
      </v-card-title>
    </v-card>
    <v-row class="ma-5">
      <p>
        Wikipeer is a decentralized P2P proxy to access Wikipedia. Wikipedia
        requests are proxied through other Wikipeer users or dedicated proxy
        users and content is fetched through torrents. Source code:
        <a target="_blank" href="https://github.com/subins2000/wikipeer"
          >GitHub</a
        >. Author: <a href="https://subinsb.com/projects">Subin Siby</a>
      </p>
      <p>
        Wikipedia interface implemented with
        <a target="_blank" href="https://gitlab.com/santhoshtr/wikivue"
          >Wikivue</a
        >
        made by <a href="https://thottingal.in">Santhosh Thottingal</a>.
      </p>
      <p>
        This is NOT an official Wikimedia Foundation project. Wikipedia,
        Wikimedia are all trademark of
        <a
          href="https://www.wikimediafoundation.org/"
          rel="nofollow noreferrer noopener"
          target="_blank"
          >Wikimedia Foundation</a
        >. Wikipedia content is licensed under the
        <a
          href="https://en.wikipedia.org/wiki/Wikipedia:Text_of_Creative_Commons_Attribution-ShareAlike_3.0_Unported_License"
          rel="nofollow noreferrer noopener"
          target="_blank"
          >Creative Commons Attribution-ShareAlike License</a
        >.
      </p>
    </v-row>
  </v-layout>
</template>
<script>
import { mdiAccountMultiplePlus } from "@mdi/js";
export default {
  name: "Home",
  data: () => ({
    mdiAccountMultiplePlus
  })
};
</script>
<style scoped lang="less">
h1 {
  font-size: 2.5em;
  font-family: "Libertinus serif" !important;
  font-feature-settings: "salt";
  .smallcap {
    font-variant: common-ligatures small-caps;
    margin-left: -5px;
  }
}
</style>
