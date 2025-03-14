import Adapt from "core/js/adapt";
import offlineStorage from "core/js/offlineStorage";
import a11y from "core/js/a11y";
import logging from "core/js/logging";
import ComponentView from "core/js/views/componentView";
import "libraries/mediaelement-and-player";
import "libraries/mediaelement-fullscreen-hook";

/*
 * Default shortcut keys trap a screen reader user inside the player once in focus. These keys are unnecessary
 * as one may traverse the player in a linear fashion without needing to know or use shortcut keys. Below is
 * the removal of the default shortcut keys.
 *
 * The default seek interval functions are passed two different data types from mejs which they handle incorrectly. One
 * is a duration integer the other is the player object. The default functions error on slider key press and so break
 * accessibility. Below is a correction.
 */

Object.assign(window.mejs.MepDefaults, {
  keyActions: [],
  defaultSeekForwardInterval: (duration) => {
    if (typeof duration === "object") return duration.duration * 0.05;
    return duration * 0.05;
  },
  defaultSeekBackwardInterval: (duration) => {
    if (typeof duration === "object") return duration.duration * 0.05;
    return duration * 0.05;
  },
});

// The following function is used to to prevent a memory leak in Internet Explorer
// See: http://javascript.crockford.com/memory/leak.html
const purge = function (d) {
  let a = d.attributes;
  if (a) {
    for (let i = a.length - 1; i >= 0; i -= 1) {
      const n = a[i].name;
      if (typeof d[n] === "function") {
        d[n] = null;
      }
    }
  }
  a = d.childNodes;
  if (a) {
    for (let i = 0, count = a.length; i < count; i += 1) {
      purge(d.childNodes[i]);
    }
  }
};

/**
 * Overwrite mediaelement-and-player setTrack to allow use of aria-pressed on closed captions button.
 */

window.mejs.MediaElementPlayer.prototype.setTrack = function (lang) {
  const t = this;
  let i;

  if (lang === "none") {
    t.selectedTrack = null;
    t.captionsButton.removeClass("mejs-captions-enabled");
    t.captionsButton[0].firstChild.setAttribute("aria-pressed", false);
  } else {
    for (i = 0; i < t.tracks.length; i++) {
      if (t.tracks[i].srclang === lang) {
        if (t.selectedTrack === null) {
          t.captionsButton.addClass("mejs-captions-enabled");
          t.captionsButton[0].firstChild.setAttribute("aria-pressed", true);
        }
        t.selectedTrack = t.tracks[i];
        t.captions.attr("lang", t.selectedTrack.srclang);
        t.displayCaptions();
        break;
      }
    }
  }
};

/**
 * Overwrite mediaelement-and-player enterFullScreen to remove Chrome <17 bug fix (Media issue #255)
 */

window.mejs.MediaElementPlayer.prototype.enterFullScreen = function () {
  const t = this;

  if (window.mejs.MediaFeatures.hasiOSFullScreen) {
    t.media.webkitEnterFullscreen();
    return;
  }

  // set it to not show scroll bars so 100% will work
  $(document.documentElement).addClass("mejs-fullscreen");

  // store sizing
  t.normalHeight = t.container.height();
  t.normalWidth = t.container.width();

  // attempt to do true fullscreen
  if (
    t.fullscreenMode === "native-native" ||
    t.fullscreenMode === "plugin-native"
  ) {
    window.mejs.MediaFeatures.requestFullScreen(t.container[0]);
  }

  // make full size
  t.container
    .addClass("mejs-container-fullscreen")
    .width("100%")
    .height("100%");

  // Only needed for safari 5.1 native full screen, can cause display issues elsewhere
  // Actually, it seems to be needed for IE8, too
  t.containerSizeTimeout = setTimeout(function () {
    t.container.css({ width: "100%", height: "100%" });
    t.setControlsSize();
  }, 500);

  if (t.media.pluginType === "native") {
    t.$media.width("100%").height("100%");
  } else {
    t.container.find(".mejs-shim").width("100%").height("100%");

    setTimeout(function () {
      const win = $(window);
      const winW = win.width();
      const winH = win.height();

      t.media.setVideoSize(winW, winH);
    }, 500);
  }

  t.layers.children("div").width("100%").height("100%");

  if (t.fullscreenBtn) {
    t.fullscreenBtn
      .removeClass("mejs-fullscreen")
      .addClass("mejs-unfullscreen");
  }

  t.setControlsSize();
  t.isFullScreen = true;

  t.container
    .find(".mejs-captions-text")
    .css("font-size", (screen.width / t.width) * 1.0 * 100 + "%");
  t.container.find(".mejs-captions-position").css("bottom", "45px");

  t.container.trigger("enteredfullscreen");
  $(".mejs-inner").find($(".mejs-margin-left")).css({
    "margin-left": 0,
  });

  t.$media.css({ top: 0 });
};

/**
 * Overwrite mediaelement-and-player hideControls
 */
window.mejs.MediaElementPlayer.prototype.hideControls = function (doAnimation) {
  var t = this;

  doAnimation = typeof doAnimation == "undefined" || doAnimation;

  if (!t.controlsAreVisible || t.options.alwaysShowControls || t.keyboardAction)
    return;

  if (doAnimation) {
    // fade out main controls
    t.controls.stop(true, true).fadeOut(200, function () {
      $(this).addClass("mejs-offscreen").css("display", "flex");

      t.controlsAreVisible = false;
      t.container.trigger("controlshidden");
    });

    // any additional controls people might add and want to hide
    t.container
      .find(".mejs-control")
      .stop(true, true)
      .fadeOut(200, function () {
        $(this).addClass("mejs-offscreen").css("display", "flex");
      });
  } else {
    // hide main controls
    t.controls.addClass("mejs-offscreen").css("display", "flex");

    // hide others
    t.container
      .find(".mejs-control")
      .addClass("mejs-offscreen")
      .css("display", "flex");

    t.controlsAreVisible = false;
    t.container.trigger("controlshidden");
  }
};

/**
 * Overwrite mediaelement-and-player showControls
 */
window.mejs.MediaElementPlayer.prototype.showControls = function (doAnimation) {
  var t = this;

  doAnimation = typeof doAnimation == "undefined" || doAnimation;

  if (t.controlsAreVisible) return;

  if (doAnimation) {
    t.controls
      .removeClass("mejs-offscreen")
      .stop(true, true)
      .fadeIn(200, function () {
        t.controlsAreVisible = true;
        t.container.trigger("controlsshown");
      });

    // any additional controls people might add and want to hide
    t.container
      .find(".mejs-control")
      .removeClass("mejs-offscreen")
      .stop(true, true)
      .fadeIn(200, function () {
        t.controlsAreVisible = true;
      });
  } else {
    t.controls.removeClass("mejs-offscreen").css("display", "flex");

    // any additional controls people might add and want to hide
    t.container
      .find(".mejs-control")
      .removeClass("mejs-offscreen")
      .css("display", "flex");

    t.controlsAreVisible = true;
    t.container.trigger("controlsshown");
  }

  t.setControlsSize();
};

/**
 * Overwrite mediaelement-and-player setPlayerSize
 */
window.mejs.MediaElementPlayer.prototype.setPlayerSize = function (
  width,
  height
) {
  var t = this;

  if (!t.options.setDimensions) {
    return false;
  }

  if (typeof width != "undefined") {
    t.width = width;
  }

  if (typeof height != "undefined") {
    t.height = height;
  }

  // detect 100% mode - use currentStyle for IE since css() doesn't return percentages
  if (
    t.height.toString().indexOf("%") > 0 ||
    (t.$node.css("max-width") !== "none" &&
      t.$node.css("max-width") !== "t.width") ||
    (t.$node[0].currentStyle && t.$node[0].currentStyle.maxWidth === "100%")
  ) {
    // do we have the native dimensions yet?
    var nativeWidth = (function () {
      if (t.isVideo) {
        if (t.media.videoWidth && t.media.videoWidth > 0) {
          return t.media.videoWidth;
        } else if (t.media.getAttribute("width") !== null) {
          return t.media.getAttribute("width");
        } else {
          return t.options.defaultVideoWidth;
        }
      } else {
        return t.options.defaultAudioWidth;
      }
    })();

    var nativeHeight = (function () {
      if (t.isVideo) {
        if (t.media.videoHeight && t.media.videoHeight > 0) {
          return t.media.videoHeight;
        } else if (t.media.getAttribute("height") !== null) {
          return t.media.getAttribute("height");
        } else {
          return t.options.defaultVideoHeight;
        }
      } else {
        return t.options.defaultAudioHeight;
      }
    })();

    var viewportHeight = getComputedStyle(t.$node[0]).getPropertyValue(
      "--adapt-viewport-height"
    );

    //total height of other elements on the screen
    var usedVerticalSpace = this.options.usedVerticalSpace;
    var allowedHeight =
      parseInt(viewportHeight.trimEnd("px")) - usedVerticalSpace;

    var newHeight = allowedHeight;

    var newWidth = parseInt(newHeight * (nativeWidth / nativeHeight));
    var parentWidth = t.container.parent().closest(":visible").width();
    var viewWidth = document.documentElement.clientWidth;
    if (parentWidth == viewWidth) {
      parentWidth = parentWidth - 50;
    }
    var parentHeight = t.container.parent().closest(":visible").height();

    if (parentHeight == 0) {
      parentHeight = allowedHeight - 1;
    }

    if (nativeHeight == allowedHeight) {
      return;
    }

    // When we use percent, the newHeight can't be calculated so we get the container height
    if (isNaN(newWidth) || newWidth > parentWidth) {
      newWidth = parentWidth;
    }

    if (
      t.container.parent().length > 0 &&
      t.container.parent()[0].tagName.toLowerCase() === "body"
    ) {
      // && t.container.siblings().count == 0) {
      newWidth = $(window).width();
      parentHeight = $(window).height();
    }

    if (newWidth && newHeight) {
      if (newWidth <= newHeight) {
        // set outer container size
        t.container.height(newHeight).width(newWidth);

        // set native <video> or <audio> and shims

        var widthDiff = parentWidth - newWidth;

        t.$media
          .add(t.container.find(".mejs-shim"))
          .width(`calc(100% - ${widthDiff}px)`)
          .height("100%");

        // if shim is ready, send the size to the embeded plugin
        if (t.isVideo) {
          if (t.media.setVideoSize) {
            t.media.setVideoSize(parentWidth, newHeight);
          }
        }

        // set the layers
        t.layers
          .children(".mejs-layer")
          .width(`calc(100% - ${widthDiff}px)`)
          .height("100%");

        t.layers.children(".mejs-margin-left").css({
          "margin-left": `${widthDiff / 2}px`,
          "margin-top": 0,
          "border-radius": "10px",
        });
        t.$media.css({
          "margin-left": `${widthDiff / 2}px`,
          "margin-top": 0,
          "border-radius": "10px",
        });
        t.controls.width(`calc(100% - ${widthDiff}px)`).css({
          "margin-left": `${widthDiff / 2}px`,
        });

        var buttonWidth = 0;
        var buttons = t.controls.children(".mejs-button");
        if (buttons.length > 0) {
          for (let index = 0; index < buttons.length; index++) {
            buttonWidth = buttonWidth + 27;
          }
        }
        t.controls
          .children(".mejs-time-rail")
          .children(".mejs-time-total")
          .width(`calc(100% - ${buttonWidth + 32}px)`);
      } else {
        // set outer container size
        t.container.height(parentHeight).width(parentWidth);

        newHeight = parseInt(parentWidth * (nativeHeight / nativeWidth));

        var heightDiff = parentHeight - newHeight;

        t.$media
          .add(t.container.find(".mejs-shim"))
          .width("100%")
          .height(newHeight)
          .css({
            "margin-left": 0,
            "margin-top": heightDiff / 2,
          });

        // if shim is ready, send the size to the embeded plugin
        if (t.isVideo) {
          if (t.media.setVideoSize) {
            t.media.setVideoSize(parentWidth, newHeight);
          }
        }
        t.layers
          .children(".mejs-layer")
          .height(`calc(100% - ${heightDiff}px`)
          .width("100%");

        t.layers.children(".mejs-margin-left").css({
          "margin-top": `${heightDiff / 2}px`,
          "border-radius": "10px",
        });
        t.$media.css({
          "margin-top": `${heightDiff / 2}px`,
          "border-radius": "10px",
        });
      }
    }
  } else {
    t.container.width(t.width).height(t.height);

    t.layers.children(".mejs-layer").width(t.width).height(t.height);
  }
};

/**
 * Overwrite mediaelement-and-player setControlsSize
 */
window.mejs.MediaElementPlayer.prototype.setControlsSize = function () {
  //just pause for 5ms to allow display to render otherwise button hasn't moved so below code does nothing
  new Promise((resolve) => setTimeout(resolve, 5)).then(() => {
    var t = this,
      usedWidth = 0,
      railWidth = 0,
      rail = t.controls.find(".mejs-time-rail"),
      total = t.controls.find(".mejs-time-total"),
      others = rail.siblings(),
      lastControl = others.last(),
      lastControlPosition = null;

    // skip calculation if hidden
    if (!t.container.is(":visible") || !rail.length || !rail.is(":visible")) {
      return;
    }

    // allow the size to come from custom CSS
    if (t.options && !t.options.autosizeProgress) {
      // Also, frontends devs can be more flexible
      // due the opportunity of absolute positioning.
      railWidth = parseInt(rail.css("width"), 10);
    }

    // attempt to autosize
    if (railWidth === 0 || !railWidth) {
      // find the size of all the other controls besides the rail
      others.each(function () {
        var $this = $(this);
        if ($this.css("position") != "absolute" && $this.is(":visible")) {
          usedWidth += $(this).outerWidth(true);
        }
      });

      // fit the rail into the remaining space
      railWidth =
        t.$media.width() - usedWidth - (rail.outerWidth(true) - rail.width());
    }
    // resize the rail,
    // but then check if the last control (say, the fullscreen button) got pushed down
    // this often happens when zoomed

    do {
      // outer area
      rail.width(railWidth);
      // dark space
      total.width(railWidth - (total.outerWidth(true) - total.width()));

      if (lastControl.css("position") != "absolute") {
        lastControlPosition = lastControl.length
          ? lastControl.position()
          : null;
        railWidth--;
      }
    } while (
      lastControlPosition !== null &&
      lastControlPosition.top.toFixed(2) > 0 &&
      railWidth > 0
    );
    t.container.trigger("controlsresize");
  });
};

/**
 * Overwrite mediaelement-and-player buildposter
 */
window.mejs.MediaElementPlayer.prototype.buildposter = function (
  player,
  controls,
  layers,
  media
) {
  var t = this,
    poster = $(
      '<div class="mejs-poster mejs-layer mejs-margin-left">' + "</div>"
    ).appendTo(layers),
    posterUrl = player.$media.attr("poster");

  // prioriy goes to option (this is useful if you need to support iOS 3.x (iOS completely fails with poster)
  if (player.options.poster !== "") {
    posterUrl = player.options.poster;
  }

  // second, try the real poster
  if (posterUrl) {
    t.setPoster(posterUrl);
  } else {
    poster.hide();
  }

  media.addEventListener(
    "play",
    function () {
      poster.hide();
    },
    false
  );

  if (player.options.showPosterWhenEnded && player.options.autoRewind) {
    media.addEventListener(
      "ended",
      function () {
        poster.show();
      },
      false
    );
  }
};

/**
 * Overwrite mediaelement-and-player buildoverlays
 */
window.mejs.MediaElementPlayer.prototype.buildoverlays = function (
  player,
  controls,
  layers,
  media
) {
  var t = this;
  if (!player.isVideo) return;

  var loading = $(
      '<div class="mejs-overlay mejs-layer mejs-margin-left">' +
        '<div class="mejs-overlay-loading"><span></span></div>' +
        "</div>"
    )
      .hide() // start out hidden
      .appendTo(layers),
    error = $(
      '<div class="mejs-overlay mejs-layer">' +
        '<div class="mejs-overlay-error"></div>' +
        "</div>"
    )
      .hide() // start out hidden
      .appendTo(layers),
    // this needs to come last so it's on top
    bigPlay = $(
      '<div class="mejs-overlay mejs-layer mejs-overlay-play mejs-margin-left">' +
        '<div class="mejs-overlay-button"></div>' +
        "</div>"
    )
      .appendTo(layers)
      .bind("click", function () {
        // Removed 'touchstart' due issues on Samsung Android devices where a tap on bigPlay started and immediately stopped the video
        if (t.options.clickToPlayPause) {
          if (media.paused) {
            media.play();
          }
        }
      });

  /*
  if (mejs.MediaFeatures.isiOS || mejs.MediaFeatures.isAndroid) {
    bigPlay.remove();
    loading.remove();
  }
  */

  // show/hide big play button
  media.addEventListener(
    "play",
    function () {
      bigPlay.hide();
      loading.hide();
      controls.find(".mejs-time-buffering").hide();
      error.hide();
    },
    false
  );

  media.addEventListener(
    "playing",
    function () {
      bigPlay.hide();
      loading.hide();
      controls.find(".mejs-time-buffering").hide();
      error.hide();
    },
    false
  );

  media.addEventListener(
    "seeking",
    function () {
      loading.show();
      controls.find(".mejs-time-buffering").show();
    },
    false
  );

  media.addEventListener(
    "seeked",
    function () {
      loading.hide();
      controls.find(".mejs-time-buffering").hide();
    },
    false
  );

  media.addEventListener(
    "pause",
    function () {
      bigPlay.show();
    },
    false
  );

  media.addEventListener(
    "waiting",
    function () {
      loading.show();
      controls.find(".mejs-time-buffering").show();
    },
    false
  );

  // show/hide loading
  media.addEventListener(
    "loadeddata",
    function () {
      // for some reason Chrome is firing this event
      //if (mejs.MediaFeatures.isChrome && media.getAttribute && media.getAttribute('preload') === 'none')
      //	return;

      loading.show();
      controls.find(".mejs-time-buffering").show();
      // Firing the 'canplay' event after a timeout which isn't getting fired on some Android 4.1 devices (https://github.com/johndyer/mediaelement/issues/1305)
      if (mejs.MediaFeatures.isAndroid) {
        media.canplayTimeout = window.setTimeout(function () {
          if (document.createEvent) {
            var evt = document.createEvent("HTMLEvents");
            evt.initEvent("canplay", true, true);
            return media.dispatchEvent(evt);
          }
        }, 300);
      }
    },
    false
  );
  media.addEventListener(
    "canplay",
    function () {
      loading.hide();
      controls.find(".mejs-time-buffering").hide();
      clearTimeout(media.canplayTimeout); // Clear timeout inside 'loadeddata' to prevent 'canplay' to fire twice
    },
    false
  );

  // error handling
  media.addEventListener(
    "error",
    function (e) {
      t.handleError(e);
      loading.hide();
      bigPlay.hide();
      error.show();
      error.find(".mejs-overlay-error").html("Error loading this resource");
    },
    false
  );

  media.addEventListener(
    "keydown",
    function (e) {
      t.onkeydown(player, media, e);
    },
    false
  );
};

/**
 * Overwrite mediaelement-and-player buildoverlays
 */
window.mejs.MediaElementPlayer.prototype.buildtracks = function (
  player,
  controls,
  layers,
  media
) {
  if (player.tracks.length === 0) return;

  var t = this,
    attr = t.options.tracksAriaLive
      ? 'role="log" aria-live="assertive" aria-atomic="false"'
      : "",
    i;

  if (t.domNode.textTracks) {
    // if browser will do native captions, prefer mejs captions, loop through tracks and hide
    for (i = t.domNode.textTracks.length - 1; i >= 0; i--) {
      t.domNode.textTracks[i].mode = "hidden";
    }
  }
  t.cleartracks(player, controls, layers, media);
  player.chapters = $('<div class="mejs-chapters mejs-layer"></div>')
    .prependTo(layers)
    .hide();
  player.captions = $(
    '<div class="mejs-captions-layer mejs-layer mejs-margin-left"><div class="mejs-captions-position mejs-captions-position-hover" ' +
      attr +
      '><span class="mejs-captions-text"></span></div></div>'
  )
    .prependTo(layers)
    .hide();
  player.captionsText = player.captions.find(".mejs-captions-text");
  player.captionsButton = $(
    '<div class="mejs-button mejs-captions-button">' +
      '<button type="button" aria-controls="' +
      t.id +
      '" title="' +
      t.options.tracksText +
      '" aria-label="' +
      t.options.tracksText +
      '"></button>' +
      '<div class="mejs-captions-selector">' +
      "<ul>" +
      "<li>" +
      '<input type="radio" name="' +
      player.id +
      '_captions" id="' +
      player.id +
      '_captions_none" value="none" checked="checked" />' +
      '<label for="' +
      player.id +
      '_captions_none">' +
      mejs.i18n.t("None") +
      "</label>" +
      "</li>" +
      "</ul>" +
      "</div>" +
      "</div>"
  ).appendTo(controls);

  var subtitleCount = 0;
  for (i = 0; i < player.tracks.length; i++) {
    if (player.tracks[i].kind == "subtitles") {
      subtitleCount++;
    }
  }

  // if only one language then just make the button a toggle
  if (t.options.toggleCaptionsButtonWhenOnlyOne && subtitleCount == 1) {
    // click
    player.captionsButton.on("click", function () {
      if (player.selectedTrack === null) {
        lang = player.tracks[0].srclang;
      } else {
        lang = "none";
      }
      player.setTrack(lang);
    });
  } else {
    // hover or keyboard focus
    player.captionsButton
      .on("mouseenter focusin", function () {
        $(this).find(".mejs-captions-selector").removeClass("mejs-offscreen");
      })

      // handle clicks to the language radio buttons
      .on("click", "input[type=radio]", function () {
        lang = this.value;
        player.setTrack(lang);
      });

    player.captionsButton.on("mouseleave focusout", function () {
      $(this).find(".mejs-captions-selector").addClass("mejs-offscreen");
    });
  }

  if (!player.options.alwaysShowControls) {
    // move with controls
    player.container
      .bind("controlsshown", function () {
        // push captions above controls
        player.container
          .find(".mejs-captions-position")
          .addClass("mejs-captions-position-hover");
      })
      .bind("controlshidden", function () {
        if (!media.paused) {
          // move back to normal place
          player.container
            .find(".mejs-captions-position")
            .removeClass("mejs-captions-position-hover");
        }
      });
  } else {
    player.container
      .find(".mejs-captions-position")
      .addClass("mejs-captions-position-hover");
  }

  player.trackToLoad = -1;
  player.selectedTrack = null;
  player.isLoadingTrack = false;

  // add to list
  for (i = 0; i < player.tracks.length; i++) {
    if (player.tracks[i].kind == "subtitles") {
      player.addTrackButton(player.tracks[i].srclang, player.tracks[i].label);
    }
  }

  // start loading tracks
  player.loadNextTrack();

  media.addEventListener(
    "timeupdate",
    function (e) {
      player.displayCaptions();
    },
    false
  );

  if (player.options.slidesSelector !== "") {
    player.slidesContainer = $(player.options.slidesSelector);

    media.addEventListener(
      "timeupdate",
      function (e) {
        player.displaySlides();
      },
      false
    );
  }

  media.addEventListener(
    "loadedmetadata",
    function (e) {
      player.displayChapters();
    },
    false
  );

  player.container.hover(
    function () {
      // chapters
      if (player.hasChapters) {
        player.chapters.removeClass("mejs-offscreen");
        player.chapters
          .fadeIn(200)
          .height(player.chapters.find(".mejs-chapter").outerHeight());
      }
    },
    function () {
      if (player.hasChapters && !media.paused) {
        player.chapters.fadeOut(200, function () {
          $(this).addClass("mejs-offscreen");
          $(this).css("display", "flex");
        });
      }
    }
  );

  t.container.on("controlsresize", function () {
    t.adjustLanguageBox();
  });

  // check for autoplay
  if (player.node.getAttribute("autoplay") !== null) {
    player.chapters.addClass("mejs-offscreen");
  }
};

/**
 * Overwrite mediaelement-and-player buildcurrent
 */
window.mejs.MediaElementPlayer.prototype.buildcurrent = function (
  player,
  controls,
  layers,
  media
) {};

/**
 * Overwrite mediaelement-and-player buildduration
 */
window.mejs.MediaElementPlayer.prototype.buildduration = function (
  player,
  controls,
  layers,
  media
) {};

/**
 * Overwrite mediaelement-and-player buildplaypause
 */
window.mejs.MediaElementPlayer.prototype.buildplaypause = function (
  player,
  controls,
  layers,
  media
) {};

/**
 * Force the default language so that the aria-label can be localised from Adapt
 * Note: Do not change these, their names and values are required for mapping in mejs
 */
window.mejs.i18n.locale.language = "en-US";
window.mejs.i18n.locale.strings["en-US"] = {};
const ariaLabelMappings = {
  playText: "Play",
  pauseText: "Pause",
  stopText: "Stop",
  audioPlayerText: "Audio Player",
  videoPlayerText: "Video Player",
  tracksText: "Captions/Subtitles",
  timeSliderText: "Time Slider",
  muteText: "Mute Toggle",
  unmuteStatusText: "Unmute",
  muteStatusText: "Mute",
  volumeSliderText: "Volume Slider",
  fullscreenText: "Fullscreen",
  goFullscreenText: "Go Fullscreen",
  turnOffFullscreenText: "Turn off Fullscreen",
  noneText: "None",
  skipBackText: "Skip back %1 seconds",
  allyVolumeControlText:
    "Use Up/Down Arrow keys to increase or decrease volume.",
  progessHelpText:
    "Use Left/Right Arrow keys to advance one second, Up/Down arrows to advance ten seconds.",
};

Adapt.on("app:dataReady", () => {
  // Populate the aria labels from the _global._components._media
  const dynamicLabels = window.mejs.i18n.locale.strings["en-US"];
  const fixedDefaults = window.mejs.MepDefaults;
  const globals = Adapt.course.get("_globals")?._components?._media;
  for (const k in ariaLabelMappings) {
    dynamicLabels[ariaLabelMappings[k]] = globals[k] ?? ariaLabelMappings[k];
    fixedDefaults[k] = dynamicLabels[ariaLabelMappings[k]];
  }
});

class MediaView extends ComponentView {
  events() {
    return {
      "click .js-media-inline-transcript-toggle": "onToggleInlineTranscript",
      "click .js-media-external-transcript-click":
        "onExternalTranscriptClicked",
      "click .js-skip-to-transcript": "onSkipToTranscript",
    };
  }

  className() {
    let classes = super.className();
    const playerOptions = this.model.get("_playerOptions");
    if (playerOptions?.toggleCaptionsButtonWhenOnlyOne) {
      classes += " toggle-captions";
    }
    return classes;
  }

  preRender() {
    this.listenTo(Adapt, {
      "device:resize": this.onScreenSizeChanged,
      "device:changed": this.onDeviceChanged,
      "media:stop": this.onMediaStop,
    });

    _.bindAll(
      this,
      "onMediaElementPlay",
      "onMediaElementPause",
      "onMediaElementEnded",
      "onMediaElementTimeUpdate",
      "onMediaElementSeeking",
      "onOverlayClick",
      "onMediaElementClick",
      "onWidgetInview"
    );

    // set initial player state attributes
    this.model.set({
      _isMediaEnded: false,
      _isMediaPlaying: false,
    });

    if (!this.model.get("_media").source) return;
    const media = this.model.get("_media");

    // Avoid loading of Mixed Content (insecure content on a secure page)
    if (
      window.location.protocol === "https:" &&
      media.source.indexOf("http:") === 0
    ) {
      media.source = media.source.replace(/^http:/, "https:");
    }

    this.model.set("_media", media);
  }

  postRender() {
    this.setupPlayer();
    this.addMejsButtonClass();
  }

  addMejsButtonClass() {
    this.$(".mejs-overlay-button").addClass("icon");
  }

  setupPlayer() {
    var options = this.model.get("_playerOptions");

    if (!options) {
      options = {
        poster: this.model.get("_media").poster,
      };
    } else {
      if (!options.poster) {
        options.poster = this.model.get("_media").poster;
      }
    }

    this.model.set("_playerOptions", options);

    const modelOptions = this.model.get("_playerOptions");

    modelOptions.usedVerticalSpace = this._getUsedVerticalSpace();

    if (modelOptions.pluginPath === undefined) {
      // on the off-chance anyone still needs to use the Flash-based player...
      _.extend(modelOptions, {
        pluginPath:
          "https://cdnjs.cloudflare.com/ajax/libs/mediaelement/2.21.2/",
        flashName: "flashmediaelement-cdn.swf",
        flashScriptAccess: "always",
      });
    }

    if (modelOptions.features === undefined) {
      modelOptions.features = ["playpause", "progress", "current", "duration"];
      if (this.model.get("_useClosedCaptions")) {
        modelOptions.features.unshift("tracks");
      }
      if (this.model.get("_allowFullScreen")) {
        modelOptions.features.push("fullscreen");
      }
      if (this.model.get("_showVolumeControl")) {
        modelOptions.features.push("volume");
      }
    }

    /*
    Unless we are on Android/iOS and using native controls, when MediaElementJS initializes the player
    it will invoke the success callback prior to performing one last call to setPlayerSize.
    This call to setPlayerSize is deferred by 50ms so we add a delay of 100ms here to ensure that
    we don't invoke setReadyStatus until the player is definitely finished rendering.
    */
    modelOptions.success = _.debounce(this.onPlayerReady.bind(this), 100);

    if (this.model.get("_useClosedCaptions")) {
      const startLanguage = this.model.get("_startLanguage") || "en";
      if (!offlineStorage.get("captions")) {
        offlineStorage.set("captions", startLanguage);
      }
      modelOptions.startLanguage = this.checkForSupportedCCLanguage(
        offlineStorage.get("captions")
      );
    }

    if (modelOptions.alwaysShowControls === undefined) {
      modelOptions.alwaysShowControls = false;
    }
    if (modelOptions.hideVideoControlsOnLoad === undefined) {
      modelOptions.hideVideoControlsOnLoad = true;
    }

    this.addMediaTypeClass();

    this.addThirdPartyFixes(modelOptions, () => {
      // create the player
      this.$("audio, video").mediaelementplayer(modelOptions);
      this.cleanUpPlayer();

      const _media = this.model.get("_media");
      // if no media is selected - set ready now, as success won't be called
      if (
        !_media.mp3 &&
        !_media.mp4 &&
        !_media.ogv &&
        !_media.webm &&
        !_media.source
      ) {
        logging.warn(
          "ERROR! No media is selected in components.json for component " +
            this.model.get("_id")
        );
        this.setReadyStatus();
        return;
      }
      // Check if we're streaming
      if (!_media.source) return;
      this.$(".media__widget").addClass("external-source");
    });
  }

  _getUsedVerticalSpace() {
    var navPadding = window
      .getComputedStyle(document.documentElement)
      .getPropertyValue("--adapt-navigation-padding");

    var usedVerticalSpace = 88 + 98 + parseInt(navPadding.trim("px")); //top nav + bottom button + navPadding

    //if display name is add this to used space
    if (this.model.get("displayTitle") != "") {
      var displayTitleElement = this.$el.find(".component__title.media__title");
      usedVerticalSpace += parseInt(displayTitleElement.outerHeight(true));
    }

    //if instruction name is add this to used space
    if (this.model.get("instruction") != "") {
      var instructionElement = this.$el.find(
        ".component__instruction.media__instruction"
      );

      usedVerticalSpace += parseInt(instructionElement.outerHeight(true));
    }

    var transcriptMargin = this.$el
      .find(".media__transcript-container")
      .css("margin-top");

    usedVerticalSpace += parseInt(transcriptMargin.trimEnd("px"));

    return usedVerticalSpace;
  }

  addMediaTypeClass() {
    const media = this.model.get("_media");
    if (!media?.type) return;
    const typeClass = media.type.replace(/\//, "-");
    this.$(".media__widget").addClass(typeClass);
  }

  addThirdPartyFixes(modelOptions, callback) {
    const media = this.model.get("_media");
    if (!media) return callback();

    if (media.mp3 || media.ogg) {
      // https://github.com/adaptlearning/adapt_framework/issues/3055
      modelOptions.alwaysShowControls = true;
    }

    switch (media.type) {
      case "video/vimeo":
        modelOptions.alwaysShowControls = false;
        modelOptions.hideVideoControlsOnLoad = true;
        modelOptions.features = [];
        if (MediaView.froogaloopAdded) return callback();
        $.getScript("assets/froogaloop.js")
          .done(() => {
            MediaView.froogaloopAdded = true;
            callback();
          })
          .fail(() => {
            MediaView.froogaloopAdded = false;
            logging.error("Could not load froogaloop.js");
          });
        break;
      default:
        callback();
    }
  }

  cleanUpPlayer() {
    const containerLabel =
      this.model.get("displayTitle") || this.model.get("title");
    this.$(".media__widget").children(".mejs-offscreen").remove();
    this.$("[role=application]").removeAttr("role tabindex");
    this.$(".mejs-container").attr({
      role: "region",
      "aria-label": containerLabel,
    });
    this.$("[aria-controls]").removeAttr("aria-controls");
    this.$(".mejs-overlay-play").attr("aria-hidden", "true");
  }

  setupEventListeners() {
    this.completionEvent = this.model.get("_setCompletionOn") || "play";

    if (this.completionEvent === "inview") {
      this.setupInviewCompletion(".component__widget");
    }

    // wrapper to check if preventForwardScrubbing is turned on.
    if (
      this.model.get("_preventForwardScrubbing") &&
      !this.model.get("_isComplete")
    ) {
      $(this.mediaElement).on({
        seeking: this.onMediaElementSeeking,
        timeupdate: this.onMediaElementTimeUpdate,
      });
    }

    // handle other completion events in the event Listeners
    $(this.mediaElement).on({
      play: this.onMediaElementPlay,
      pause: this.onMediaElementPause,
      ended: this.onMediaElementEnded,
    });

    // occasionally the mejs code triggers a click of the captions language
    // selector during setup, this slight delay ensures we skip that
    _.delay(this.listenForCaptionsChange.bind(this), 250);
  }

  /**
   * Sets up the component to detect when the user has changed the captions so that it can store the user's
   * choice in offlineStorage and notify other media components on the same page of the change
   * Also sets the component up to listen for this event from other media components on the same page
   */
  listenForCaptionsChange() {
    if (!this.model.get("_useClosedCaptions")) return;

    const selector = this.model.get("_playerOptions")
      .toggleCaptionsButtonWhenOnlyOne
      ? ".mejs-captions-button button"
      : ".mejs-captions-selector";

    this.$(selector).on(
      "click.mediaCaptionsChange",
      _.debounce(() => {
        const srclang = this.mediaElement.player.selectedTrack
          ? this.mediaElement.player.selectedTrack.srclang
          : "none";
        offlineStorage.set("captions", srclang);
        Adapt.trigger("media:captionsChange", this, srclang);
      }, 250)
    ); // needs debouncing because the click event fires twice

    this.listenTo(Adapt, "media:captionsChange", this.onCaptionsChanged);
  }

  /**
   * Handles updating the captions in this instance when learner changes captions in another
   * media component on the same page
   * @param {Backbone.View} view The view instance that triggered the event
   * @param {string} lang The captions language the learner chose in the other media component
   */
  onCaptionsChanged(view, lang) {
    if (view?.cid === this.cid) return; // ignore the event if we triggered it

    lang = this.checkForSupportedCCLanguage(lang);

    this.mediaElement.player.setTrack(lang);

    // because calling player.setTrack doesn't update the cc button's languages popup...
    const $inputs = this.$(".mejs-captions-selector input");
    $inputs.filter(":checked").prop("checked", false);
    $inputs.filter(`[value="${lang}"]`).prop("checked", true);
  }

  /**
   * When the learner selects a captions language in another media component, that language may not be available
   * in this instance, in which case default to the `_startLanguage` if that's set - or "none" if it's not
   * @param {string} lang The language we're being asked to switch to e.g. "de"
   * @return {string} The language we're actually going to switch to - or "none" if there's no good match
   */
  checkForSupportedCCLanguage(lang) {
    if (!lang || lang === "none") return "none";

    if (_.findWhere(this.model.get("_media").cc, { srclang: lang }))
      return lang;

    return this.model.get("_startLanguage") || "none";
  }

  onMediaElementPlay(event) {
    this.queueGlobalEvent("play");

    Adapt.trigger("media:stop", this);

    if (this.model.get("_pauseWhenOffScreen")) {
      this.$(".mejs-container").on("inview", this.onWidgetInview);
    }

    this.model.set({
      _isMediaPlaying: true,
      _isMediaEnded: false,
    });

    if (this.completionEvent !== "play") return;
    this.setCompletionStatus();
  }

  onMediaElementPause(event) {
    this.queueGlobalEvent("pause");

    this.$(".mejs-container").off("inview", this.onWidgetInview);

    this.model.set("_isMediaPlaying", false);
  }

  onMediaElementEnded(event) {
    this.queueGlobalEvent("ended");

    this.model.set("_isMediaEnded", true);

    if (this.completionEvent === "ended") {
      this.setCompletionStatus();
    }
  }

  onWidgetInview(event, isInView) {
    if (!isInView && !this.mediaElement.paused)
      this.mediaElement.player.pause();
  }

  onMediaElementSeeking(event) {
    let maxViewed = this.model.get("_maxViewed");
    if (!maxViewed) {
      maxViewed = 0;
    }
    if (event.target.currentTime <= maxViewed) return;
    event.target.currentTime = maxViewed;
  }

  onMediaElementTimeUpdate(event) {
    let maxViewed = this.model.get("_maxViewed");
    if (!maxViewed) {
      maxViewed = 0;
    }
    if (event.target.currentTime <= maxViewed) return;
    this.model.set("_maxViewed", event.target.currentTime);
  }

  // Overrides the default play/pause functionality to stop accidental playing on touch devices
  setupPlayPauseToggle() {
    // bit sneaky, but we don't have a this.mediaElement.player ref on iOS devices
    const player = this.mediaElement.player;

    if (!player) {
      logging.warn(
        "MediaView.setupPlayPauseToggle: OOPS! there is no player reference."
      );
      return;
    }

    // stop the player dealing with this, we'll do it ourselves
    player.options.clickToPlayPause = false;

    // play on 'big button' click
    this.$(".mejs-overlay-play").on("click", this.onOverlayClick);

    // pause on player click
    this.$(".mejs-mediaelement").on("click", this.onMediaElementClick);
  }

  onMediaStop(view) {
    // Make sure this view isn't triggering media:stop
    if (view?.cid === this.cid) return;

    if (!this.mediaElement || !this.mediaElement.player) return;

    this.mediaElement.player.pause();
  }

  onOverlayClick() {
    const player = this.mediaElement.player;
    if (!player) return;

    player.play();
  }

  onMediaElementClick(event) {
    const player = this.mediaElement.player;
    if (!player) return;

    const isPaused = player.media.paused;
    if (!isPaused) player.pause();
  }

  remove() {
    this.$(".mejs-overlay-button").off("click", this.onOverlayClick);
    this.$(".mejs-mediaelement").off("click", this.onMediaElementClick);
    this.$(".mejs-container").off("inview", this.onWidgetInview);

    if (this.model.get("_useClosedCaptions")) {
      const selector = this.model.get("_playerOptions")
        .toggleCaptionsButtonWhenOnlyOne
        ? ".mejs-captions-button button"
        : ".mejs-captions-selector";
      this.$(selector).off("click.mediaCaptionsChange");
    }

    const modelOptions = this.model.get("_playerOptions");
    delete modelOptions.success;

    const media = this.model.get("_media");
    if (media) {
      switch (media.type) {
        case "video/vimeo":
          this.$("iframe")[0].isRemoved = true;
      }
    }

    if (this.mediaElement && this.mediaElement.player) {
      const playerId = this.mediaElement.player.id;

      purge(this.$el[0]);
      this.mediaElement.player.remove();

      if (window.mejs.players[playerId]) {
        delete window.mejs.players[playerId];
      }
    }

    if (this.mediaElement) {
      $(this.mediaElement).off({
        play: this.onMediaElementPlay,
        pause: this.onMediaElementPause,
        ended: this.onMediaElementEnded,
        seeking: this.onMediaElementSeeking,
        timeupdate: this.onMediaElementTimeUpdate,
      });

      this.mediaElement.src = "";
      $(this.mediaElement.pluginElement).remove();
      delete this.mediaElement;
    }

    super.remove();
  }

  onDeviceChanged() {
    if (!this.model.get("_media").source) return;
    this.$(".mejs-container").width(this.$(".component__widget").width());
  }

  onPlayerReady(mediaElement, domObject) {
    this.mediaElement = mediaElement;

    let player = this.mediaElement.player;
    if (!player) {
      player = window.mejs.players[this.$(".mejs-container").attr("id")];
    }

    const hasTouch = window.mejs.MediaFeatures.hasTouch;
    if (hasTouch) {
      this.setupPlayPauseToggle();
    }

    this.addThirdPartyAfterFixes();
    this.cleanUpPlayerAfter();

    if (player && this.model.has("_startVolume")) {
      // Setting the start volume only works with the Flash-based player if you do it here rather than in setupPlayer
      player.setVolume(parseInt(this.model.get("_startVolume")) / 100);
    }

    this.setReadyStatus();
    this.setupEventListeners();
  }

  addThirdPartyAfterFixes() {
    const media = this.model.get("_media");
    switch (media.type) {
      case "video/vimeo":
        this.$(".mejs-container").attr("tabindex", 0);
    }
  }

  cleanUpPlayerAfter() {
    this.$("[aria-valuemax='NaN']").attr("aria-valuemax", 0);
  }

  onScreenSizeChanged() {
    this.$("audio, video").width(this.$(".component__widget").width());
  }

  onSkipToTranscript() {
    // need slight delay before focussing button to make it work when JAWS is running
    // see https://github.com/adaptlearning/adapt_framework/issues/2427
    _.delay(() => {
      a11y.focus(this.$(".media__transcript-btn"));
    }, 250);
  }

  onToggleInlineTranscript(event) {
    if (event) event.preventDefault();
    const $transcriptBodyContainer = this.$(".media__transcript-body-inline");
    const $button = this.$(".media__transcript-btn-inline");
    const $buttonText = this.$(
      ".media__transcript-btn-inline .media__transcript-btn-text"
    );

    if ($transcriptBodyContainer.hasClass("inline-transcript-open")) {
      $transcriptBodyContainer
        .stop(true, true)
        .slideUp(() => {
          $(window).resize();
        })
        .removeClass("inline-transcript-open");
      $button.attr("aria-expanded", false);
      $buttonText.html(this.model.get("_transcript").inlineTranscriptButton);

      return;
    }

    $transcriptBodyContainer
      .stop(true, true)
      .slideDown(() => {
        $(window).resize();
      })
      .addClass("inline-transcript-open");

    $button.attr("aria-expanded", true);
    $buttonText.html(this.model.get("_transcript").inlineTranscriptCloseButton);

    if (this.model.get("_transcript")._setCompletionOnView !== false) {
      Adapt.trigger("media:transcriptComplete", this);
      this.setCompletionStatus();
    }
  }

  onExternalTranscriptClicked(event) {
    if (this.model.get("_transcript")._setCompletionOnView === false) return;
    Adapt.trigger("media:transcriptComplete", this);
    this.setCompletionStatus();
  }

  /**
   * Queue firing a media event to prevent simultaneous events firing, and provide a better indication of how the
   * media  player is behaving
   * @param {string} eventType
   */
  queueGlobalEvent(eventType) {
    const time = Date.now();
    const lastEvent = this.lastEvent || { time: 0 };
    const timeSinceLastEvent = time - lastEvent.time;
    const debounceTime = 500;

    this.lastEvent = {
      time,
      type: eventType,
    };

    // Clear any existing timeouts
    clearTimeout(this.eventTimeout);

    // Always trigger 'ended' events
    if (eventType === "ended") {
      return this.triggerGlobalEvent(eventType);
    }

    // Fire the event after a delay, only if another event has not just been fired
    if (timeSinceLastEvent <= debounceTime) return;
    this.eventTimeout = setTimeout(
      this.triggerGlobalEvent.bind(this, eventType),
      debounceTime
    );
  }

  triggerGlobalEvent(eventType) {
    const player = this.mediaElement.player;

    const eventObj = {
      type: eventType,
      src: this.mediaElement.src,
      platform: this.mediaElement.pluginType,
    };

    if (player) eventObj.isVideo = player.isVideo;

    Adapt.trigger("media", eventObj);
  }
}

MediaView.froogaloopAdded = false;

export default MediaView;
