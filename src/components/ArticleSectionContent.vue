<template>
  <div></div>
</template>

<script>
export default {
  name: "ArticleSectionContent",
  props: ["value"],
  mounted: function() {
    this.$el.appendChild(this.value);
  }
};
</script>
