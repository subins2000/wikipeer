export default {
  replaceImages(media, elem) {
    const images = elem.querySelectorAll("a[class='image']");
    for (let i = 0; i < images.length; i++) {
      images[i].addEventListener("click", event =>
        this.imageClickHandler(images[i], event)
      );

      // Pathname example: /page/en/File:Parashurama_with_axe.jpg
      let filename = decodeURIComponent(new URL(images[i].href).pathname).match(
        /[^/\\&?]+\.\w{3,4}(?=([?&].*$|$))/gm
      );

      if (filename && filename[0]) {
        filename = filename[0];
      } else {
        continue;
      }

      images[i].firstChild.src = "";
      images[i].firstChild.srcset = "";

      if (media[filename]) {
        /**
         * Wikimedia Commons convert SVG to PNG in articles
         * renderTo function uses extension for detecting file type : https://github.com/feross/render-media/issues/33
         */
        if (filename.substr(-4, 4) === ".svg") {
          media[filename].name += ".png";
        }

        media[filename].renderTo(images[i].firstChild);
      }
    }

    return elem;
  },

  parse(section, contentLanguage, media, expanded) {
    const parser = new window.DOMParser();

    let wrapper = parser.parseFromString(
      "<div>" + section + "</div>",
      "text/html"
    );

    const content = this.replaceImages(media, wrapper.body.firstChild);

    const links = content.querySelectorAll("a[href]");
    for (let l = 0; l < links.length; l++) {
      let link = links[l];
      for (let i = 0; i < link.attributes.length; i++) {
        let attribute = link.attributes[i];
        if (attribute.name === "href") {
          link.setAttribute(
            attribute.name,
            attribute.value.replace("/wiki/", `/page/${contentLanguage}/`)
          );
          continue;
        }
        link.setAttribute(attribute.name, attribute.value);
      }
    }

    let aside = parser.parseFromString("<aside></aside>", "text/html");
    aside = aside.body.firstChild;

    let infoboxHTML;
    if (!expanded) {
      const hatnotes = wrapper.querySelectorAll("div.hatnote");
      const amboxes = wrapper.querySelectorAll(".ambox");
      const infobox = wrapper.querySelectorAll(".infobox");
      const rightSideImages = wrapper.querySelectorAll(
        "figure.mw-halign-right"
      );
      const leftSideImages = wrapper.querySelectorAll("figure.mw-halign-left");
      const smallFigures = wrapper.querySelectorAll("figure.mw-default-size");
      const rightTables = wrapper.querySelectorAll("table[align='right']");
      const navboxes = [
        ...wrapper.querySelectorAll("table.vertical-navbox"),
        ...wrapper.querySelectorAll("div.navbox")
      ];

      const sideItems = [
        ...hatnotes,
        // ...infobox,
        ...amboxes,
        ...rightSideImages,
        ...leftSideImages,
        ...smallFigures,
        ...rightTables
      ];

      // Remove navboxes - They are looong tables.
      for (let i = 0; i < navboxes.length; i++) {
        navboxes[i].remove();
      }

      // Prepare for quickfacts
      if (infobox && infobox.length) {
        infobox[0].removeAttribute("style");
        const tableWrapper = document.createElement("div");
        tableWrapper.appendChild(infobox[0].cloneNode(true));
        tableWrapper.className += "table-wrapper v-data-table theme--light";
        infoboxHTML = tableWrapper.outerHTML;
        infobox[0].remove();
      }

      for (let i = 0; i < sideItems.length; i++) {
        if (sideItems[i].matches("table")) {
          const tableWrapper = document.createElement("div");
          tableWrapper.className += "table-wrapper v-data-table";
          tableWrapper.appendChild(sideItems[i].cloneNode(true));
          aside.appendChild(tableWrapper);
        } else {
          aside.appendChild(sideItems[i].cloneNode(true));
        }
        sideItems[i].className += " hidden-md-and-up";
        if (i === 5) break; // Don't add too many items to sidebar
      }
    }

    aside = this.replaceImages(media, aside);

    return {
      content, // This is a DOM Element object, not html string
      aside, // This is a DOM Element object, not html string
      infobox: infoboxHTML
    };
  },

  // Thanks to https://dennisreimann.de/articles/delegating-html-links-to-vue-router.html
  isIgnorableLinkClick(event) {
    // ensure we use the link, in case the click has been received by a subelement
    let { target } = event;
    // handle only links that occur inside the component and do not reference external resources
    if (!target) {
      return true;
    }
    // some sanity checks taken from vue-router:
    // https://github.com/vuejs/vue-router/blob/dev/src/components/link.js#L106
    const {
      altKey,
      ctrlKey,
      metaKey,
      shiftKey,
      button,
      defaultPrevented
    } = event;
    // don't handle with control keys
    if (metaKey || altKey || ctrlKey || shiftKey) return true;
    // don't handle when preventDefault called
    if (defaultPrevented) return true;
    // don't handle right clicks
    if (button !== undefined && button !== 0) return true;
    // don't handle if `target="_blank"`
    if (target && target.getAttribute) {
      const linkTarget = target.getAttribute("target");
      if (/\b_blank\b/i.test(linkTarget)) return true;
    }
    if (!target.href) return true;
    return false;
  }
};
