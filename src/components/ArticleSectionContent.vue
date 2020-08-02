<template>
  <div></div>
</template>

<script>
// This is a Wikipeer addition to allow appending DOM object instead of using innerHTML
// because media rendered by WebTorrent dynamically will not work if innerHTML is used
// This new file which allows altering the source of media content is a good addition and should be merged to Wikivue

export default {
  name: "ArticleSectionContent",
  props: ["value"],
  mounted: function() {
    this.$el.appendChild(this.value);
  }
};
</script>
