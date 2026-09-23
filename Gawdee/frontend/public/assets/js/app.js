(() => {
  "use strict";

  const qs = (selector, scope = document) => scope.querySelector(selector);
  const qsa = (selector, scope = document) => [
    ...scope.querySelectorAll(selector),
  ];
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const header = qs("[data-header]");
  const menuToggles = qsa("[data-menu-toggle]");
  const mobileMenu = qs("[data-mobile-menu]");
  const mobileBackdrop = qs("[data-mobile-backdrop]");
  const mobileSearchTrigger = qs("[data-mobile-search-trigger]");
  const mobileSearchInput = qs("[data-mobile-search-input]");
  const mobileSearchClear = qs("[data-mobile-search-clear]");
  const searchToggle = qs("[data-search-toggle]");
  const searchClose = qs("[data-search-close]");
  const searchPanel = qs("[data-search-panel]");
  const searchInput = qs("[data-site-search]");

  const setHeaderState = () => {
    if (!header) return;
    const isScrolled = window.scrollY > 40;
    header.classList.toggle("is-scrolled", isScrolled);
    header.classList.toggle("is-top", !isScrolled);
  };
  setHeaderState();
  window.addEventListener("scroll", setHeaderState, { passive: true });

  const setMobileMenu = (open) => {
    mobileMenu?.classList.toggle("is-open", open);
    if (mobileBackdrop) {
      mobileBackdrop.style.display = open ? "block" : "none";
    }
    menuToggles.forEach((toggle) => {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
    const icon = document.querySelector("[data-menu-toggle] i");
    if (icon) {
      icon.classList.toggle("ph-x", open);
      icon.classList.toggle("ph-list", !open);
    }
    document.body.classList.toggle("is-locked", open);
  };

  // Delegated on document so the toggle works regardless of when the
  // header markup renders; replaces per-button listeners (double-toggle).
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest("[data-mobile-backdrop]")) {
      setMobileMenu(false);
      return;
    }
    if (target.closest("[data-mobile-search-trigger]")) {
      setMobileMenu(true);
      window.setTimeout(() => mobileSearchInput?.focus(), 150);
      return;
    }
    if (target.closest("[data-mobile-search-clear]")) {
      if (mobileSearchInput) {
        mobileSearchInput.value = "";
        mobileSearchInput.focus();
      }
      if (mobileSearchClear) mobileSearchClear.style.display = "none";
      return;
    }
    if (target.closest("[data-menu-toggle]")) {
      const menu = qs("[data-mobile-menu]");
      setMobileMenu(menu ? !menu.classList.contains("is-open") : false);
      return;
    }
    if (target.closest("[data-menu-close]")) {
      setMobileMenu(false);
      return;
    }
    if (target.closest("[data-mobile-menu] a")) {
      setMobileMenu(false);
    }
  });

  if (mobileSearchInput && mobileSearchClear) {
    mobileSearchInput.addEventListener("input", () => {
      mobileSearchClear.style.display = mobileSearchInput.value.trim()
        ? "flex"
        : "none";
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMobileMenu(false);
  });

  const closeNavDrops = () => {
    qsa(".sf-nav-dropdown").forEach((panel) => {
      panel.hidden = true;
    });
    qsa("[data-nav-disclosure]").forEach((btn) =>
      btn.setAttribute("aria-expanded", "false"),
    );
  };
  qsa("[data-nav-disclosure]").forEach((disclosure) =>
    disclosure.addEventListener("click", (event) => {
      event.stopPropagation();
      const group = disclosure.closest(".sf-nav-group");
      const panel = group ? qs(".sf-nav-dropdown", group) : null;
      if (!panel) return;
      const willOpen = panel.hidden;
      closeNavDrops();
      panel.hidden = !willOpen;
      disclosure.setAttribute("aria-expanded", String(willOpen));
    }),
  );
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".sf-nav-group")) closeNavDrops();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeNavDrops();
  });

  qsa(".gx-brand-video").forEach((brandVideo) => {
    const brandScope = brandVideo.closest("a, span, div") || document;
    const brandFallback = qs(
      ".gx-brand__fallback, .header-logo-img[hidden]",
      brandScope,
    );
    const showBrandFallback = () => {
      brandVideo.hidden = true;
      if (brandFallback) brandFallback.hidden = false;
    };
    brandVideo.addEventListener("error", showBrandFallback, true);
    qs("source", brandVideo)?.addEventListener("error", showBrandFallback);
    if (reduceMotion) {
      brandVideo.pause();
    } else {
      brandVideo.play?.().catch(() => {});
    }
  });

  const openSearch = () => {
    searchPanel?.classList.add("is-open");
    window.setTimeout(() => searchInput?.focus(), 100);
  };

  const closeSearch = () => searchPanel?.classList.remove("is-open");
  searchToggle?.addEventListener("click", openSearch);
  searchClose?.addEventListener("click", closeSearch);

  qsa("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = button.closest("div")?.querySelector("input");
      if (!input) return;
      const reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      button.setAttribute(
        "aria-label",
        reveal ? "Hide password" : "Show password",
      );
      const icon = qs("i", button);
      icon?.classList.toggle("ph-eye", !reveal);
      icon?.classList.toggle("ph-eye-slash", reveal);
    });
  });

  const productGrid = qs("[data-product-grid]");
  const productCards = qsa("[data-category]", productGrid || document);
  const emptyState = qs("[data-product-empty]");
  const catalogCount = qs("[data-catalog-count]");
  const catalogSearch = qs("[data-catalog-search]");
  let activeFilter = productGrid?.dataset.initialCategory || "all";
  let activeSearch = "";

  const filterProducts = () => {
    if (!productGrid) return;
    let visibleCount = 0;

    productCards.forEach((card) => {
      const matchesCategory =
        activeFilter === "all" || card.dataset.category === activeFilter;
      const matchesSearch =
        !activeSearch || (card.dataset.searchName || "").includes(activeSearch);
      const visible = matchesCategory && matchesSearch;
      card.hidden = !visible;
      if (visible) visibleCount += 1;
    });

    if (emptyState) emptyState.hidden = visibleCount !== 0;
    if (catalogCount) catalogCount.textContent = String(visibleCount);
  };

  qsa("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter || "all";
      qsa("[data-filter]").forEach((item) =>
        item.classList.toggle("is-active", item === button),
      );
      filterProducts();
    });
  });

  qsa("[data-nav-filter], [data-category-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (!productGrid) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.pathname !== window.location.pathname) return;
      event.preventDefault();
      activeFilter =
        link.dataset.navFilter || link.dataset.categoryLink || "all";
      activeSearch = "";
      if (searchInput) searchInput.value = "";
      filterProducts();
      document
        .getElementById("shop")
        ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    });
  });

  searchInput?.addEventListener("input", (event) => {
    activeSearch = event.target.value.trim().toLowerCase();
    if (productGrid) {
      filterProducts();
      document
        .getElementById("shop")
        ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
    }
  });

  catalogSearch?.addEventListener("input", (event) => {
    activeSearch = event.target.value.trim().toLowerCase();
    filterProducts();
  });

  searchInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    if (!productGrid) {
      window.location.href = `products?search=${encodeURIComponent(searchInput.value.trim())}`;
    } else {
      closeSearch();
    }
  });

  const initialSearch =
    new URLSearchParams(window.location.search).get("search") ||
    productGrid?.dataset.initialSearch ||
    "";
  if (initialSearch && productGrid) {
    activeSearch = initialSearch.toLowerCase().trim();
    if (searchInput) searchInput.value = initialSearch;
    if (catalogSearch && !catalogSearch.value)
      catalogSearch.value = initialSearch;
    filterProducts();
  }
  if (productGrid) filterProducts();

  // Video hero experience & 8-phrase headline rotation loop changing every 2 seconds
  const scrubSection = qs("[data-hero-scrub-section]");
  const scrubVideo = qs("[data-hero-scrub-video]", scrubSection || document);
  const scrubPoster = qs("[data-hero-scrub-poster]", scrubSection || document);
  const scrubEyebrow =
    qs(".hero-scrub-eyebrow", scrubSection || document) ||
    qs('[data-scrub-step="1"]', scrubSection || document);
  const scrubTitle = qs("[data-scrub-title]", scrubSection || document);
  const scrubSubtitle =
    qs(".hero-scrub-subtitle", scrubSection || document) ||
    qs('[data-scrub-step="3"]', scrubSection || document);
  const scrubSteps = qsa("[data-scrub-step]", scrubSection || document);
  const scrubIndicator = qs("[data-scrub-indicator]", scrubSection || document);

  // Hero banner 2 dynamic video slides & headlines player
  if (scrubSection) {
    let heroSlides = [];
    try {
      if (scrubSection.dataset.heroSlides) {
        heroSlides = JSON.parse(scrubSection.dataset.heroSlides);
      }
    } catch (e) {
      heroSlides = [];
    }

    if (Array.isArray(heroSlides) && heroSlides.length > 0) {
      let activeSlideIndex = 0;
      let slideTimer = null;
      let fadeTimer = null;

      const scrubSticky = qs(".hero-scrub-sticky", scrubSection);
      let videoA = qs("[data-hero-scrub-video]", scrubSection);
      let videoB = qs("[data-hero-scrub-video-next]", scrubSection);

      if (!videoB && scrubSticky) {
        videoB = document.createElement("video");
        videoB.className = "hero-scrub-video hero-scrub-video--next";
        videoB.setAttribute("data-hero-scrub-video-next", "");
        videoB.muted = true;
        videoB.playsInline = true;
        videoB.preload = "auto";
        scrubSticky.insertBefore(
          videoB,
          scrubSection.querySelector(".hero-scrub-overlay"),
        );
      }

      let activeVideoEl = videoA;
      let nextVideoEl = videoB;

      const playSlideIndex = (index) => {
        activeSlideIndex = index % heroSlides.length;
        const slide = heroSlides[activeSlideIndex];
        const nextSlide =
          heroSlides[(activeSlideIndex + 1) % heroSlides.length];
        const isMobile = window.innerWidth <= 700;

        const currentVideoUrl =
          isMobile && slide.mobile_video
            ? slide.mobile_video
            : slide.desktop_video || slide.mobile_video;
        const nextVideoUrl =
          isMobile && nextSlide.mobile_video
            ? nextSlide.mobile_video
            : nextSlide.desktop_video || nextSlide.mobile_video;

        if (scrubEyebrow) {
          scrubEyebrow.style.opacity = "0";
          scrubEyebrow.style.transform = "translateY(10px)";
          setTimeout(() => {
            const eb = slide.eyebrow || "";
            scrubEyebrow.innerHTML = `<i class="ph ph-sparkle"></i> ${eb}`;
            scrubEyebrow.style.opacity = "1";
            scrubEyebrow.style.transform = "translateY(0)";
          }, 150);
        }

        if (scrubTitle) {
          scrubTitle.style.opacity = "0";
          scrubTitle.style.transform = "translateY(10px)";
          setTimeout(() => {
            scrubTitle.textContent =
              slide.headline || slide.title || "Nourishment, Rooted in Nature";
            scrubTitle.style.opacity = "1";
            scrubTitle.style.transform = "translateY(0)";
          }, 150);
        }

        if (scrubSubtitle) {
          scrubSubtitle.style.opacity = "0";
          scrubSubtitle.style.transform = "translateY(10px)";
          setTimeout(() => {
            scrubSubtitle.textContent =
              slide.subtitle ||
              "Thoughtfully sourced natural goodness for everyday wellness.";
            scrubSubtitle.style.opacity = "1";
            scrubSubtitle.style.transform = "translateY(0)";
          }, 150);
        }

        if (scrubPoster) scrubPoster.style.opacity = "0";
        if (scrubIndicator) scrubIndicator.style.opacity = "0";

        // Play current video slide on active video element
        if (activeVideoEl && currentVideoUrl) {
          const src =
            activeVideoEl.getAttribute("src") ||
            activeVideoEl.querySelector("source")?.getAttribute("src");
          if (src !== currentVideoUrl) {
            activeVideoEl.src = currentVideoUrl;
            activeVideoEl.load();
          }
          activeVideoEl.style.transition = "opacity 200ms ease-in-out";
          activeVideoEl.style.opacity = "1";
          activeVideoEl.style.zIndex = "2";
          try {
            activeVideoEl.currentTime = 0;
          } catch (e) {}
          activeVideoEl.play().catch(() => {});
        }

        const durationMs = Math.max(1, Number(slide.duration || 1)) * 1000;
        const fadeOffsetMs = Math.min(200, Math.floor(durationMs / 2));
        const fadeStartTimeMs = Math.max(0, durationMs - fadeOffsetMs);

        clearTimeout(slideTimer);
        clearTimeout(fadeTimer);

        // 200ms before end of current video: reduce opacity of first video & start next video with reduced opacity
        fadeTimer = setTimeout(() => {
          if (activeVideoEl) {
            activeVideoEl.style.transition = `opacity ${fadeOffsetMs}ms ease-in-out`;
            activeVideoEl.style.opacity = "0.25"; // Reduce opacity at end of first video
          }

          if (nextVideoEl && nextVideoUrl) {
            const src =
              nextVideoEl.getAttribute("src") ||
              nextVideoEl.querySelector("source")?.getAttribute("src");
            if (src !== nextVideoUrl) {
              nextVideoEl.src = nextVideoUrl;
              nextVideoEl.load();
            }
            nextVideoEl.style.zIndex = "1";
            nextVideoEl.style.transition = "none";
            nextVideoEl.style.opacity = "0.25"; // Start next video with reduced opacity
            try {
              nextVideoEl.currentTime = 0;
            } catch (e) {}

            const playPromise = nextVideoEl.play();
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  requestAnimationFrame(() => {
                    nextVideoEl.style.transition = `opacity ${fadeOffsetMs}ms ease-in-out`;
                    nextVideoEl.style.opacity = "1"; // Fade up to full opacity
                  });
                })
                .catch(() => {});
            }
          }
        }, fadeStartTimeMs);

        // At end of duration: swap video elements and continue loop
        slideTimer = setTimeout(() => {
          if (activeVideoEl) {
            activeVideoEl.style.zIndex = "0";
            activeVideoEl.style.opacity = "0";
          }
          if (nextVideoEl) {
            nextVideoEl.style.zIndex = "2";
            nextVideoEl.style.opacity = "1";
          }

          // Swap active and next elements for continuous loop
          const temp = activeVideoEl;
          activeVideoEl = nextVideoEl;
          nextVideoEl = temp;

          playSlideIndex(activeSlideIndex + 1);
        }, durationMs);
      };

      if (reduceMotion) {
        scrubSteps.forEach((step) => step.classList.add("is-active"));
        if (scrubPoster) scrubPoster.style.opacity = "1";
      } else {
        playSlideIndex(0);
      }
    }
  }

  // Full-image hero carousel with autoplay, keyboard controls and touch swiping.
  const heroSlider = qs("[data-hero-slider]");
  const heroTrack = qs("[data-hero-track]", heroSlider || document);
  const heroSlides = qsa("[data-hero-slide]", heroSlider || document);
  const heroDots = qsa("[data-hero-dot]", heroSlider || document);
  const heroProgress = qs("[data-hero-progress]", heroSlider || document);

  if (heroSlider && heroTrack && heroSlides.length > 1) {
    let heroIndex = 0;
    let heroTimer;
    let pointerStartX = null;

    const restartHeroProgress = () => {
      if (!heroProgress || reduceMotion) return;
      heroProgress.classList.remove("is-running");
      void heroProgress.offsetWidth;
      heroProgress.classList.add("is-running");
    };

    const showHeroSlide = (index) => {
      heroIndex = (index + heroSlides.length) % heroSlides.length;
      heroTrack.style.transform = `translate3d(-${heroIndex * 100}%, 0, 0)`;

      heroSlides.forEach((slide, slideIndex) => {
        const isActive = slideIndex === heroIndex;
        slide.classList.toggle("is-active", isActive);
        slide.setAttribute("aria-hidden", String(!isActive));
        slide.tabIndex = isActive ? 0 : -1;
      });

      heroDots.forEach((dot, dotIndex) => {
        const isActive = dotIndex === heroIndex;
        dot.classList.toggle("is-active", isActive);
        dot.setAttribute("aria-selected", String(isActive));
      });
    };

    const pauseHero = () => {
      window.clearTimeout(heroTimer);
      heroProgress?.classList.remove("is-running");
    };
    const scheduleHero = () => {
      pauseHero();
      if (
        reduceMotion ||
        document.hidden ||
        heroSlider.matches(":hover") ||
        heroSlider.contains(document.activeElement)
      )
        return;
      restartHeroProgress();
      heroTimer = window.setTimeout(() => {
        showHeroSlide(heroIndex + 1);
        scheduleHero();
      }, 5500);
    };

    const selectHeroSlide = (index) => {
      showHeroSlide(index);
      scheduleHero();
    };

    qs("[data-hero-prev]", heroSlider)?.addEventListener("click", () =>
      selectHeroSlide(heroIndex - 1),
    );
    qs("[data-hero-next]", heroSlider)?.addEventListener("click", () =>
      selectHeroSlide(heroIndex + 1),
    );
    heroDots.forEach((dot) =>
      dot.addEventListener("click", () =>
        selectHeroSlide(Number(dot.dataset.heroDot || 0)),
      ),
    );

    heroSlider.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") selectHeroSlide(heroIndex - 1);
      if (event.key === "ArrowRight") selectHeroSlide(heroIndex + 1);
    });
    heroSlider.addEventListener("mouseenter", pauseHero);
    heroSlider.addEventListener("mouseleave", scheduleHero);
    heroSlider.addEventListener("focusin", pauseHero);
    heroSlider.addEventListener("focusout", () =>
      window.setTimeout(() => {
        if (!heroSlider.contains(document.activeElement)) scheduleHero();
      }, 0),
    );

    heroSlider.addEventListener(
      "pointerdown",
      (event) => {
        if (event.pointerType === "touch") pointerStartX = event.clientX;
      },
      { passive: true },
    );
    heroSlider.addEventListener("pointerup", (event) => {
      if (pointerStartX === null) return;
      const movement = event.clientX - pointerStartX;
      pointerStartX = null;
      if (Math.abs(movement) < 45) return;
      event.preventDefault();
      selectHeroSlide(heroIndex + (movement < 0 ? 1 : -1));
    });

    document.addEventListener("visibilitychange", () =>
      document.hidden ? pauseHero() : scheduleHero(),
    );
    showHeroSlide(0);
    scheduleHero();
  }

  // Scroll reveal with a no-motion fallback.
  qsa(".reveal").forEach((element) => {
    const delay = Number(element.dataset.delay || 0);
    element.style.setProperty("--delay", `${delay}ms`);
  });

  if (reduceMotion || !("IntersectionObserver" in window)) {
    qsa(".reveal").forEach((element) => element.classList.add("is-visible"));
  } else {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -3% 0px", threshold: 0.04 },
    );

    qsa(".reveal").forEach((element) => revealObserver.observe(element));
  }

  // Multi-layer hero depth, kept on the compositor and disabled for reduced motion.
  const heroShowcase = qs("[data-hero-showcase]");
  const parallaxItems = qsa("[data-parallax-item]");
  if (
    heroShowcase &&
    !reduceMotion &&
    window.matchMedia("(min-width: 821px)").matches
  ) {
    heroShowcase.addEventListener("pointermove", (event) => {
      const rect = heroShowcase.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      heroShowcase.style.setProperty(
        "--hero-rx",
        `${(-y * 2.4).toFixed(2)}deg`,
      );
      heroShowcase.style.setProperty("--hero-ry", `${(x * 2.8).toFixed(2)}deg`);
    });
    heroShowcase.addEventListener("pointerleave", () => {
      heroShowcase.style.setProperty("--hero-rx", "0deg");
      heroShowcase.style.setProperty("--hero-ry", "0deg");
    });

    let ticking = false;
    window.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          const heroProgress = Math.min(
            window.scrollY,
            window.innerHeight * 1.25,
          );
          parallaxItems.forEach((item) => {
            const speed = Number(item.dataset.parallaxItem || 0.05);
            item.style.transform = `translate3d(0, ${(heroProgress * speed).toFixed(2)}px, 0)`;
          });
          ticking = false;
        });
      },
      { passive: true },
    );
  }

  // Local cart demonstration.
  const storageKey = "gawdee-modern-cart";
  const cartDrawer = qs("[data-cart-drawer]");
  const backdrop = qs("[data-drawer-backdrop]");
  const cartItems = qs("[data-cart-items]");
  const cartEmpty = qs("[data-cart-empty]");
  const cartSummary = qs("[data-cart-summary]");
  const cartTotal = qs("[data-cart-total]");
  const cartCount = qs("[data-cart-count]");
  const toast = qs("[data-toast]");
  let toastTimer;
  let cart = [];
  let newCartItemsAdded = false;

  try {
    const savedCart = JSON.parse(localStorage.getItem(storageKey) || "[]");
    cart = Array.isArray(savedCart)
      ? savedCart
          .filter((item) => item && item.id && Number(item.price) >= 0)
          .map((item) => ({
            id: String(item.id),
            name: String(item.name || "Gawdee product"),
            price: Math.max(0, Number(item.price || 0)),
            image: String(item.image || "assets/images/logo.png"),
            quantity: Math.max(1, Math.min(20, Number(item.quantity || 1))),
          }))
      : [];
  } catch {
    cart = [];
  }

  const formatMoney = (amount) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);

  const saveCart = () => localStorage.setItem(storageKey, JSON.stringify(cart));

  const showToast = (message) => {
    // Toast functionality removed per request
  };

  qsa("[data-newsletter-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = qs('input[type="email"]', form)?.value.trim();
      if (!email) return;
      try {
        const response = await fetch("api/subscribe.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            csrf_token: qs('meta[name="gawdee-csrf"]')?.content || "",
          }),
        });
        const result = await response.json();
        if (!response.ok || !result.ok)
          throw new Error(result.message || "Unable to subscribe.");
        form.reset();
        showToast(result.message);
      } catch (error) {
        showToast(error.message || "Unable to subscribe right now.");
      }
    });
  });

  qsa("[data-copy-offer], [data-copy-coupon]").forEach((button) => {
    button.addEventListener("click", async (e) => {
      const code = button.dataset.copyCoupon || button.dataset.copyOffer || "";
      if (!code) return;

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(code);
        } else {
          const temporaryInput = document.createElement("textarea");
          temporaryInput.value = code;
          temporaryInput.setAttribute("readonly", "");
          temporaryInput.style.position = "fixed";
          temporaryInput.style.opacity = "0";
          document.body.appendChild(temporaryInput);
          temporaryInput.select();
          document.execCommand("copy");
          temporaryInput.remove();
        }

        button.classList.add("is-copied");
        const label = qs("span", button);
        if (label) label.innerHTML = '<i class="ph ph-check"></i> Copied';
        showToast(`Coupon ${code} copied to clipboard!`);
        window.setTimeout(() => {
          button.classList.remove("is-copied");
          if (label) label.innerHTML = '<i class="ph ph-copy"></i> Copy code';
        }, 2200);
      } catch {
        showToast(`Use coupon code ${code} at checkout`);
      }
    });
  });

  // Homepage Independence Day offer: accessible, dismissible and shown once per session.
  const offerPopup = qs("[data-offer-popup]");
  if (offerPopup) {
    const popupKey = `gawdee-offer-popup:${offerPopup.dataset.popupKey || "current"}`;
    const popupDialog = qs(".offer-popup__dialog", offerPopup);
    const popupClose = qs("[data-offer-popup-close]", offerPopup);
    const popupDelay = Math.max(
      0,
      Math.min(10000, Number(offerPopup.dataset.popupDelay || 850)),
    );
    let returnFocus = null;

    const sessionRead = () => {
      try {
        return window.sessionStorage.getItem(popupKey);
      } catch {
        return null;
      }
    };
    const sessionDismiss = () => {
      try {
        window.sessionStorage.setItem(popupKey, "dismissed");
      } catch {
        /* Storage can be unavailable in private contexts. */
      }
    };
    const closeOfferPopup = () => {
      if (offerPopup.hidden) return;
      sessionDismiss();
      offerPopup.classList.remove("is-visible");
      document.body.classList.remove("has-offer-popup");
      window.setTimeout(
        () => {
          offerPopup.hidden = true;
          returnFocus?.focus?.();
        },
        reduceMotion ? 0 : 280,
      );
    };
    const openOfferPopup = () => {
      if (sessionRead()) return;
      returnFocus = document.activeElement;
      offerPopup.hidden = false;
      document.body.classList.add("has-offer-popup");
      window.requestAnimationFrame(() => {
        offerPopup.classList.add("is-visible");
        window.setTimeout(() => popupClose?.focus(), reduceMotion ? 0 : 220);
      });
    };

    window.setTimeout(openOfferPopup, popupDelay);
    qsa(
      "[data-offer-popup-close], [data-offer-popup-shop]",
      offerPopup,
    ).forEach((control) => control.addEventListener("click", closeOfferPopup));
    offerPopup.addEventListener("click", (event) => {
      if (event.target === offerPopup) closeOfferPopup();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !offerPopup.hidden) closeOfferPopup();
      if (event.key !== "Tab" || offerPopup.hidden || !popupDialog) return;
      const focusable = qsa("a[href], button:not([disabled])", popupDialog);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  qsa("[data-scroll-rail]").forEach((button) => {
    button.addEventListener("click", () => {
      const rail = qs(button.dataset.scrollRail || "");
      if (!rail) return;
      const direction = Number(button.dataset.scrollDirection || 1);
      rail.scrollBy({
        left: direction * Math.min(rail.clientWidth * 0.86, 460),
        behavior: reduceMotion ? "auto" : "smooth",
      });
      rail.dispatchEvent(new CustomEvent("railinteraction"));
    });
  });

  qsa("[data-sliding-rail]").forEach((rail) => {
    let pointerId = null;
    let startX = 0;
    let startScroll = 0;
    let hasDragged = false;

    rail.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startScroll = rail.scrollLeft;
      hasDragged = false;
      rail.classList.add("is-grabbing");
      rail.setPointerCapture?.(pointerId);
    });

    rail.addEventListener("pointermove", (event) => {
      if (pointerId !== event.pointerId) return;
      const movement = event.clientX - startX;
      if (Math.abs(movement) > 5) hasDragged = true;
      if (!hasDragged) return;
      event.preventDefault();
      rail.scrollLeft = startScroll - movement;
    });

    const releaseRail = (event) => {
      if (pointerId !== event.pointerId) return;
      rail.releasePointerCapture?.(pointerId);
      pointerId = null;
      rail.classList.remove("is-grabbing");
    };

    rail.addEventListener("pointerup", releaseRail);
    rail.addEventListener("pointercancel", releaseRail);
    rail.addEventListener(
      "click",
      (event) => {
        if (!hasDragged) return;
        event.preventDefault();
        event.stopPropagation();
        hasDragged = false;
      },
      true,
    );

    rail.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      rail.scrollBy({
        left:
          (event.key === "ArrowLeft" ? -1 : 1) *
          Math.min(rail.clientWidth * 0.86, 460),
        behavior: reduceMotion ? "auto" : "smooth",
      });
      rail.dispatchEvent(new CustomEvent("railinteraction"));
    });
  });

  qsa("[data-auto-slide]").forEach((rail) => {
    const interval = Math.max(2800, Number(rail.dataset.autoSlide || 4200));
    let autoplayTimer = null;

    const stopAutoplay = () => {
      window.clearInterval(autoplayTimer);
      autoplayTimer = null;
    };

    const advanceRail = () => {
      if (
        document.hidden ||
        rail.matches(":hover") ||
        rail.contains(document.activeElement) ||
        rail.classList.contains("is-grabbing")
      )
        return;
      if (rail.scrollWidth <= rail.clientWidth + 4) return;

      const maximumScroll = rail.scrollWidth - rail.clientWidth;
      const isAtEnd = rail.scrollLeft >= maximumScroll - 12;
      rail.scrollTo({
        left: isAtEnd
          ? 0
          : Math.min(
              rail.scrollLeft + Math.min(rail.clientWidth * 0.86, 460),
              maximumScroll,
            ),
        behavior: "smooth",
      });
    };

    const startAutoplay = () => {
      stopAutoplay();
      if (reduceMotion) return;
      autoplayTimer = window.setInterval(advanceRail, interval);
    };

    rail.addEventListener("mouseenter", stopAutoplay);
    rail.addEventListener("mouseleave", startAutoplay);
    rail.addEventListener("focusin", stopAutoplay);
    rail.addEventListener("focusout", startAutoplay);
    rail.addEventListener("pointerdown", stopAutoplay);
    rail.addEventListener("pointerup", startAutoplay);
    rail.addEventListener("pointercancel", startAutoplay);
    rail.addEventListener("railinteraction", startAutoplay);
    document.addEventListener("visibilitychange", () =>
      document.hidden ? stopAutoplay() : startAutoplay(),
    );
    startAutoplay();
  });

  // Product-details variant switcher (delegated: works for dynamic chips, single-variant safe).
  document.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-variant-switch]");
    if (!chip) return;
    // Allow new-tab / modifier clicks to follow the link.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    // Only handle chips inside the PDP buybox; card pills use data-card-variant-switch.
    if (!chip.closest(".ref-buybox")) return;
    e.preventDefault();

    const slug = chip.dataset.slug || "";
    const id = chip.dataset.id || "";
    const name = chip.dataset.name || "";
    const weight = chip.dataset.weight || "";
    const price = chip.dataset.price || "0";
    const priceFormatted = chip.dataset.priceFormatted || "";
    const originalPriceFormatted = chip.dataset.originalPriceFormatted || "";
    const discount = chip.dataset.discount || "0";
    const stock = parseInt(chip.dataset.stock || "0", 10);
    const image = chip.dataset.image || "";
    const sku = chip.dataset.sku || "";
    const taxInclusive = chip.dataset.taxInclusive !== "0";

    chip
      .closest(".ref-variants")
      ?.querySelectorAll("[data-variant-switch]")
      .forEach((c) => {
        const active = c === chip;
        c.classList.toggle("is-active", active);
        if (active) c.setAttribute("aria-current", "true");
        else c.removeAttribute("aria-current");
      });

    const priceEl = qs("[data-variant-price]");
    const origPriceEl = qs("[data-variant-original-price]");
    const discountEl = qs("[data-variant-discount]");
    if (priceEl && priceFormatted) priceEl.textContent = priceFormatted;
    if (origPriceEl && originalPriceFormatted)
      origPriceEl.textContent = originalPriceFormatted;
    if (discountEl) {
      const d = parseInt(discount || "0", 10);
      if (d > 0) {
        discountEl.hidden = false;
        discountEl.textContent = `${d}% OFF`;
      } else {
        discountEl.hidden = true;
        discountEl.textContent = "";
      }
    }

    const titleEl = qs("[data-variant-title]");
    if (titleEl && name) {
      titleEl.childNodes[0].textContent = name + " ";
    }
    const stickyNameEl = qs("[data-sticky-name]");
    if (stickyNameEl && name) stickyNameEl.textContent = name;
    const stickyPriceEl = qs("[data-sticky-price]");
    if (stickyPriceEl && price)
      stickyPriceEl.textContent = money(parseInt(price, 10));

    // Swap the whole gallery to the selected variant's images so no
    // previous-variant frames remain. Falls back to the single image
    // when gallery data is unavailable.
    if (
      typeof rebuildGallery === "function" &&
      !rebuildGallery(id, name) &&
      image
    ) {
      const mainImg = qs("[data-product-main-image]");
      if (mainImg) {
        mainImg.src = image;
        mainImg.alt = name || mainImg.alt;
        const expand = qs(".ref-gallery__expand");
        if (expand) expand.href = image;
      }
    }

    const stockEl = qs("[data-variant-stock]");
    if (stockEl) {
      const inStock = stock > 0;
      stockEl.innerHTML = `<i></i>${inStock ? "In stock" : "Out of stock"}`;
      stockEl.classList.toggle("is-out", !inStock);
    }

    const skuEl = qs("[data-variant-sku]");
    if (skuEl) skuEl.textContent = sku || "—";

    const taxEl = qs("[data-variant-tax]");
    if (taxEl)
      taxEl.textContent = taxInclusive
        ? "Inclusive of all taxes"
        : "Exclusive of taxes";

    // Reset quantity to 1 whenever the pack changes.
    const qtyEls = qsa("[data-product-qty]");
    qtyEls.forEach(el => el.textContent = "1");
    if (typeof productQuantity !== "undefined") {
      try {
        productQuantity = 1;
      } catch (_) {}
    }

    qsa("[data-add-to-cart], [data-buy-now]").forEach((btn) => {
      // Only retarget PDP-level buttons, not related-product card buttons.
      if (btn.closest(".product-card, .compact-product-card")) return;
      if (id) btn.dataset.id = id;
      if (name) btn.dataset.name = name;
      if (price) btn.dataset.price = price;
      if (image) btn.dataset.image = image;
      if (stock <= 0) btn.setAttribute("disabled", "");
      else btn.removeAttribute("disabled");
    });

    // Keep the review form pinned to the selected variant.
    qsa("[data-review-form]").forEach((form) => {
      if (id) form.dataset.productId = id;
    });

    if (window.history && window.history.replaceState && slug) {
      const url = new URL(window.location.href);
      url.searchParams.set("slug", slug);
      window.history.replaceState({}, "", url.pathname + url.search);
    }

    showToast(`Selected ${weight} pack`);
  });

  // Card-level variant switcher (delegated, stock/SKU aware, link-safe).
  document.addEventListener("click", (e) => {
    const pill = e.target.closest("[data-card-variant-switch]");
    if (!pill) return;
    e.preventDefault();
    e.stopPropagation();

    const card = pill.closest(".product-card, .compact-product-card");
    if (!card) return;

    const slug = pill.dataset.slug || "";
    const id = pill.dataset.id || "";
    const name = pill.dataset.name || "";
    const weight = pill.dataset.weight || "";
    const price = pill.dataset.price || "0";
    const priceFormatted = pill.dataset.priceFormatted || "";
    const originalPriceFormatted = pill.dataset.originalPriceFormatted || "";
    const discount = pill.dataset.discount || "0";
    const stock = parseInt(pill.dataset.stock || "1", 10);
    const image = pill.dataset.image || "";

    card.querySelectorAll("[data-card-variant-switch]").forEach((p) => {
      const active = p === pill;
      p.classList.toggle("is-active", active);
      p.setAttribute("aria-pressed", String(active));
    });

    card
      .querySelectorAll(
        ".product-card__media, .compact-product-card__media, .product-card__body h3 a, .compact-product-card__body h3 a",
      )
      .forEach((link) => {
        const href = link.getAttribute("href");
        if (!href || !href.includes("product")) return;
        try {
          const url = new URL(href, window.location.href);
          url.searchParams.set("slug", slug);
          const clean =
            url.pathname.substring(url.pathname.lastIndexOf("/") + 1) +
            url.search;
          link.setAttribute("href", clean);
        } catch (_) {
          link.setAttribute("href", `product?slug=${encodeURIComponent(slug)}`);
        }
      });

    const img =
      card.querySelector("[data-card-main-image]") ||
      card.querySelector(
        ".product-card__media img, .compact-product-card__media img",
      );
    if (img && image) {
      img.src = image;
      img.alt = name || img.alt;
    }

    const weightEl = card.querySelector(
      "[data-card-weight], .compact-product-card__weight, .product-card__meta span:last-child",
    );
    if (weightEl && weight) {
      weightEl.textContent = weight;
    }

    const priceStrong =
      card.querySelector("[data-card-price]") ||
      card.querySelector(
        ".product-card__price strong, .compact-product-card__price strong, .product-card__buy strong",
      );
    if (priceStrong && priceFormatted) {
      priceStrong.textContent = priceFormatted;
    }
    const priceS =
      card.querySelector("[data-card-original-price]") ||
      card.querySelector(
        ".product-card__price s, .compact-product-card__price s, .product-card__buy s",
      );
    if (priceS && originalPriceFormatted) {
      priceS.textContent = originalPriceFormatted;
    }

    const discountEl = card.querySelector(
      "[data-card-discount], .product-card__discount",
    );
    if (discountEl) {
      const d = parseInt(discount || "0", 10);
      if (d > 0) {
        discountEl.hidden = false;
        discountEl.textContent = `${d}% OFF`;
      } else {
        discountEl.hidden = true;
      }
    }

    const addBtn = card.querySelector("[data-add-to-cart]");
    if (addBtn) {
      if (id) addBtn.dataset.id = id;
      if (name) addBtn.dataset.name = name;
      if (price) addBtn.dataset.price = price;
      if (image) addBtn.dataset.image = image;
      if (stock <= 0) {
        addBtn.setAttribute("disabled", "");
        const label = addBtn.querySelector("span");
        if (label) label.textContent = "Out of stock";
        else if (!addBtn.querySelector("i"))
          addBtn.textContent = "Out of stock";
      } else {
        addBtn.removeAttribute("disabled");
        const label = addBtn.querySelector("span");
        if (label && label.textContent === "Out of stock")
          label.textContent = "Add to cart";
        else if (addBtn.textContent === "Out of stock")
          addBtn.textContent = "Add to cart";
      }
    }

    showToast(`Selected ${weight} pack`);
  });

  const openCart = () => {
    cartDrawer?.classList.add("is-open");
    backdrop?.classList.add("is-open");
    cartDrawer?.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-locked");
    qs("[data-cart-close]", cartDrawer || document)?.focus();

    const bar = qs("[data-checkout-sticky]");
    if (bar) bar.style.display = "none";

    if (newCartItemsAdded && typeof confetti === "function") {
      const duration = 3000;
      const end = Date.now() + duration;
      (function frame() {
        confetti({
          particleCount: 5,
          angle: 90,
          spread: 12,
          startVelocity: 20,
          origin: { x: Math.random(), y: -0.1 },
          colors: [
            "#ffffffff",
            "#854700ff",
            "#c8a45d",
            "#E6D0BA",
            "#FFD700",
            "#FF8C00",
            "#E91E63",
            "#9CCEB4",
          ],
          zIndex: 10005,
          ticks: 400,
          gravity: 1.5,
          scalar: 1,
          shapes: ["square", "circle", "star"],
          disableForReducedMotion: true,
        });
        if (Date.now() < end) requestAnimationFrame(frame);
      })();
      newCartItemsAdded = false;
    }
  };

  const closeCart = () => {
    cartDrawer?.classList.remove("is-open");
    backdrop?.classList.remove("is-open");
    cartDrawer?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-locked");
    if (typeof updateStickyBar === "function") updateStickyBar();
  };

  const renderCart = () => {
    const count = cart.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0,
    );
    const total = cart.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0,
    );
    if (cartCount) cartCount.textContent = String(count);
    if (cartTotal) cartTotal.textContent = formatMoney(total);
    if (cartEmpty) cartEmpty.hidden = cart.length > 0;
    if (cartSummary) cartSummary.hidden = cart.length === 0;

    if (!cartItems) return;
    const esc = (v) =>
      String(v ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
    let html = "";
    html += cart
      .map(
        (item) => `
            <article class="cart-item">
                <div class="item-product">
                    <img src="${esc(item.image)}" alt="">
                    <div class="item-details">
                        <h3>${esc(item.name)}</h3>
                        <p class="item-price">${formatMoney(Number(item.price || 0))}</p>
                    </div>
                </div>
                <div class="item-qty">
                    <div class="cart-item__qty" aria-label="Quantity for ${esc(item.name)}">
                        <button type="button" data-cart-decrease="${esc(item.id)}" aria-label="Decrease quantity">−</button>
                        <span>${Number(item.quantity || 0)}</span>
                        <button type="button" data-cart-increase="${esc(item.id)}" aria-label="Increase quantity">+</button>
                    </div>
                </div>
                <div class="item-action">
                    <button class="cart-item__remove" type="button" data-cart-remove="${esc(item.id)}" aria-label="Remove ${esc(item.name)}"><i class="ph ph-trash"></i></button>
                </div>
            </article>
        `,
      )
      .join("");
    cartItems.innerHTML = html;
    if (typeof updateStickyBar === "function") updateStickyBar();
  };

  const addToCart = (button, quantity = 1) => {
    if (button.disabled || button.hasAttribute("disabled")) {
      showToast("This variant is currently out of stock");
      return;
    }
    quantity = Math.max(1, Math.min(20, Number(quantity) || 1));
    const item = {
      id: String(button.dataset.id || ""),
      name: String(button.dataset.name || "Gawdee product"),
      price: Math.max(0, Number(button.dataset.price || 0)),
      image: String(button.dataset.image || "assets/images/logo.png"),
      quantity,
    };
    if (!item.id || !(item.price >= 0)) {
      showToast("This product is unavailable right now");
      return;
    }
    const existing = cart.find((product) => product.id === item.id);
    if (existing)
      existing.quantity = Math.min(20, existing.quantity + quantity);
    else cart.push(item);
    saveCart();
    renderCart();
    updateStickyBar();
    button.classList.add("is-added");

    if (window.lottie) {
      let lottieContainer = button.querySelector(".lottie-btn-anim");
      if (!lottieContainer) {
        lottieContainer = document.createElement("div");
        lottieContainer.className = "lottie-btn-anim";
        lottieContainer.style.position = "absolute";
        lottieContainer.style.top = "50%";
        lottieContainer.style.left = "50%";
        lottieContainer.style.transform = "translate(-50%, -50%)";
        lottieContainer.style.width = "40px";
        lottieContainer.style.height = "40px";
        lottieContainer.style.pointerEvents = "none";
        button.style.position = "relative";

        // Hide button text/icons temporarily by wrapping them if they aren't already
        if (!button.querySelector(".btn-content-wrap")) {
          const wrap = document.createElement("span");
          wrap.className = "btn-content-wrap";
          while (button.firstChild && button.firstChild !== lottieContainer) {
            wrap.appendChild(button.firstChild);
          }
          button.appendChild(wrap);
        }
        button.appendChild(lottieContainer);
      }

      const wrap = button.querySelector(".btn-content-wrap");
      if (wrap) wrap.style.opacity = "0"; // Hide text during animation

      lottieContainer.innerHTML = "";
      const anim = lottie.loadAnimation({
        container: lottieContainer,
        renderer: "svg",
        loop: false,
        autoplay: true,
        path: "assets/images/animation/AddToCartSuccess.json",
      });

      anim.addEventListener("complete", () => {
        if (wrap) wrap.style.opacity = "1";
        button.classList.remove("is-added");
        lottieContainer.innerHTML = "";
      });
    } else {
      window.setTimeout(() => button.classList.remove("is-added"), 1500);
    }

    newCartItemsAdded = true;

    showToast(`${item.name} added to your bag`);
  };

  const stickyBar = qs("[data-checkout-sticky]");
  const stickyImg = qs("[data-sticky-img]");
  const stickyCount = qs("[data-sticky-count]");
  const stickyPrice = qs("[data-sticky-price]");

  const updateStickyBar = () => {
    if (!stickyBar) return;
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalPrice = cart.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    if (
      totalItems > 0 &&
      !variantsDrawer?.style.transform.includes("translateY(0)")
    ) {
      stickyBar.style.display = "flex";
      // Show image of last added item, or first item in cart
      const lastItem = cart[cart.length - 1] || cart[0];
      if (stickyImg && lastItem) stickyImg.src = lastItem.image;
      if (stickyCount)
        stickyCount.textContent = `${totalItems} item${totalItems !== 1 ? "s" : ""}`;
      if (stickyPrice) stickyPrice.textContent = formatMoney(totalPrice);
    } else {
      stickyBar.style.display = "none";
    }
  };

  qsa("[data-cart-toggle]").forEach((button) =>
    button.addEventListener("click", openCart),
  );
  qsa("[data-cart-close]").forEach((button) =>
    button.addEventListener("click", closeCart),
  );
  backdrop?.addEventListener("click", closeCart);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeCart();
      closeSearch();
      if (typeof closeVariants === "function") closeVariants();
    }
  });

  const variantsDrawer = qs("[data-variants-drawer]");
  const variantsBackdrop = qs("[data-variants-backdrop]");
  const variantsList = qs("[data-variants-list]");
  const variantsTitle = qs("[data-variants-title] span");

  const closeVariants = () => {
    if (variantsDrawer) variantsDrawer.style.transform = "translateY(100%)";
    if (variantsBackdrop) {
      variantsBackdrop.style.opacity = "0";
      setTimeout(() => (variantsBackdrop.style.visibility = "hidden"), 300);
    }
    updateStickyBar();
  };

  qs("[data-variants-close]")?.addEventListener("click", closeVariants);
  variantsBackdrop?.addEventListener("click", closeVariants);

  const openVariants = (button) => {
    const variantsData = button.dataset.variants;
    if (!variantsData || !variantsDrawer) {
      const quantity = button.classList.contains("product-add")
        ? Number(qs("[data-product-qty]")?.textContent || 1)
        : 1;
      addToCart(button, quantity);
      return;
    }

    try {
      const variants = JSON.parse(variantsData);
      variantsTitle.textContent =
        button.dataset.name.split(" -")[0] || button.dataset.name;

      variantsList.innerHTML = variants
        .map((v) => {
          const inCart = cart.find((item) => item.id === v.id);
          const qty = inCart ? inCart.quantity : 0;

          let actionHtml = "";
          if (v.stock <= 0) {
            actionHtml = `<button type="button" disabled style="background: #e0e0e0; color: #888; border: none; padding: 0.5rem 1rem; border-radius: 6px; font-weight: 600;">OUT OF STOCK</button>`;
          } else if (qty > 0) {
            actionHtml = `
                        <div class="variant-qty-ctrl" style="display: flex; align-items: center; border: 1px solid var(--gawdee-primary); border-radius: 6px; overflow: hidden; height: 36px;">
                            <button type="button" data-v-decrease="${v.id}" style="background: var(--gawdee-primary); color: white; border: none; width: 32px; height: 100%; display: flex; align-items: center; justify-content: center; cursor: pointer;"><i class="ph ph-minus"></i></button>
                            <span style="width: 32px; text-align: center; font-weight: 600; color: var(--gawdee-primary-dark);">${qty}</span>
                            <button type="button" data-v-increase="${v.id}" style="background: var(--gawdee-primary); color: white; border: none; width: 32px; height: 100%; display: flex; align-items: center; justify-content: center; cursor: pointer;"><i class="ph ph-plus"></i></button>
                        </div>
                    `;
          } else {
            actionHtml = `<button type="button" data-v-add="${v.id}" style="background: var(--gawdee-primary); color: white; border: none; padding: 0 1.2rem; height: 36px; border-radius: 6px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 0.4rem;">ADD <i class="ph ph-shopping-cart"></i></button>`;
          }

          return `
                    <div class="variant-drawer-item" style="display: flex; align-items: center; gap: 1rem; padding: 1rem; border: 1px solid var(--border-color, #eee); border-radius: 12px; background: #fff;">
                        <img src="${v.image}" alt="${v.weight}" style="width: 60px; height: 60px; object-fit: contain; flex-shrink: 0; background: #f8f8f8; border-radius: 8px;">
                        <div style="flex: 1;">
                            <div style="font-weight: 600; color: var(--text-color); font-size: 1rem; margin-bottom: 0.2rem;">${v.weight}</div>
                            <div style="display: flex; align-items: baseline; gap: 0.5rem;">
                                <strong style="color: var(--gawdee-primary-dark); font-size: 1.1rem;">${v.price_formatted}</strong>
                                ${v.original_price > v.price ? `<s style="color: #999; font-size: 0.85rem;">${v.original_price_formatted}</s>` : ""}
                            </div>
                            ${v.discount > 0 ? `<div style="color: var(--gawdee-primary); font-size: 0.8rem; font-weight: 600; margin-top: 0.2rem;">Best Price ${v.price_formatted} with PURE15</div>` : ""}
                        </div>
                        <div>
                            ${actionHtml}
                        </div>
                    </div>
                `;
        })
        .join("");

      variantsList.querySelectorAll("[data-v-add]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const id = btn.dataset.vAdd;
          const v = variants.find((x) => x.id === id);
          if (v) {
            const mockBtn = document.createElement("button");
            mockBtn.dataset.id = v.id;
            mockBtn.dataset.name = v.name;
            mockBtn.dataset.price = v.price;
            mockBtn.dataset.image = v.image;
            addToCart(mockBtn, 1);
            closeVariants();
          }
        });
      });
      variantsList.querySelectorAll("[data-v-increase]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.vIncrease;
          const item = cart.find((x) => x.id === id);
          if (item) {
            item.quantity += 1;
            saveCart();
            renderCart();
            openVariants(button);
          }
        });
      });
      variantsList.querySelectorAll("[data-v-decrease]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.dataset.vDecrease;
          const item = cart.find((x) => x.id === id);
          if (item) {
            item.quantity -= 1;
            if (item.quantity <= 0) cart = cart.filter((x) => x.id !== id);
            saveCart();
            renderCart();
            openVariants(button);
          }
        });
      });

      if (variantsBackdrop) {
        variantsBackdrop.style.visibility = "visible";
        variantsBackdrop.style.opacity = "1";
        variantsBackdrop.style.pointerEvents = "auto";
      }
      variantsDrawer.style.transform = "translateY(0)";
      if (stickyBar) stickyBar.style.display = "none"; // hide when drawer opens
    } catch (e) {
      console.error("Failed to parse variants", e);
      const quantity = button.classList.contains("product-add")
        ? Number(qs("[data-product-qty]")?.textContent || 1)
        : 1;
      addToCart(button, quantity);
    }
  };

  qsa("[data-add-to-cart]").forEach((button) => {
    button.addEventListener("click", () => {
      openVariants(button);
    });
  });

  cartItems?.addEventListener("click", (event) => {
    const increase = event.target.closest("[data-cart-increase]");
    const decrease = event.target.closest("[data-cart-decrease]");
    const remove = event.target.closest("[data-cart-remove]");
    const id =
      increase?.dataset.cartIncrease ||
      decrease?.dataset.cartDecrease ||
      remove?.dataset.cartRemove;
    if (!id) return;
    const item = cart.find((product) => product.id === id);
    if (!item) return;

    if (increase) item.quantity += 1;
    if (decrease) item.quantity -= 1;
    if (remove || item.quantity <= 0)
      cart = cart.filter((product) => product.id !== id);
    saveCart();
    renderCart();
    updateStickyBar();
  });

  const qtyDisplays = qsa("[data-product-qty]");
  let productQuantity = 1;
  qsa("[data-product-qty-minus]").forEach(btn => {
    btn.addEventListener("click", () => {
      productQuantity = Math.max(1, productQuantity - 1);
      qtyDisplays.forEach(el => el.textContent = String(productQuantity));
    });
  });
  qsa("[data-product-qty-plus]").forEach(btn => {
    btn.addEventListener("click", () => {
      productQuantity = productQuantity + 1;
      qtyDisplays.forEach(el => el.textContent = String(productQuantity));
    });
  });

  // Product gallery: delegated thumb switching (survives gallery rebuilds
  // when the variant changes) with keyboard support.
  const galleryRoot = qs("[data-variant-galleries]");
  const galleryThumbs = qs("[data-gallery-thumbs]");
  const productMainImage = qs("[data-product-main-image]");
  const productExpandLink = qs(".ref-gallery__expand");

  const setStageImage = (src, alt) => {
    if (!productMainImage || !src) return;
    productMainImage.classList.add("is-changing");
    window.setTimeout(
      () => {
        productMainImage.src = src;
        if (alt) productMainImage.alt = alt;
        if (productExpandLink) productExpandLink.href = src;
        productMainImage.classList.remove("is-changing");
      },
      reduceMotion ? 0 : 150,
    );
  };

  const activateThumb = (thumbnail) => {
    if (!thumbnail) return;
    qsa("[data-gallery-thumb]").forEach((item) => {
      const active = item === thumbnail;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
      item.tabIndex = active ? 0 : -1;
    });
    setStageImage(thumbnail.dataset.image, thumbnail.dataset.alt);
  };

  const thumbContainer = galleryThumbs || document;
  thumbContainer.addEventListener("click", (event) => {
    const thumbnail = event.target.closest("[data-gallery-thumb]");
    if (!thumbnail || (galleryThumbs && !galleryThumbs.contains(thumbnail)))
      return;
    activateThumb(thumbnail);
  });
  (galleryThumbs || document).addEventListener("keydown", (event) => {
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    const current = event.target.closest("[data-gallery-thumb]");
    if (!current) return;
    event.preventDefault();
    const thumbs = qsa("[data-gallery-thumb]", galleryThumbs || document);
    const at = thumbs.indexOf(current);
    if (at < 0) return;
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const next =
      thumbs[(at + (forward ? 1 : -1) + thumbs.length) % thumbs.length];
    next?.focus();
    activateThumb(next);
  });

  // Broken-image safety net: swap to the fallback instead of showing a broken icon.
  document.addEventListener(
    "error",
    (event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement)) return;
      if (img.dataset.imgFallbackApplied) return;
      const inGallery = img.closest(
        "[data-gallery-thumbs], [data-gallery-stage]",
      );
      if (!inGallery) return;
      const fallback =
        galleryRoot?.dataset.galleryFallback || "assets/images/logo.png";
      img.dataset.imgFallbackApplied = "1";
      img.src = fallback;
    },
    true,
  );

  // Rebuild the whole gallery for a newly selected variant.
  // Returns true when gallery data existed for the variant.
  const rebuildGallery = (variantId, variantName) => {
    if (!galleryRoot || !galleryThumbs || !variantId) return false;
    let galleries = {};
    try {
      galleries = JSON.parse(galleryRoot.dataset.variantGalleries || "{}");
    } catch {
      galleries = {};
    }
    const frames = galleries[String(variantId)];
    if (!Array.isArray(frames) || !frames.length) return false;
    const productName =
      galleryRoot.dataset.galleryProductName || variantName || "";
    galleryThumbs.innerHTML = frames
      .map((frame, frameIndex) => {
        const src = String(frame?.src || "");
        if (!src) return "";
        const label = String(frame?.label || `Product view ${frameIndex + 1}`);
        const alt = `${productName} — ${label}`;
        const esc = (v) =>
          String(v)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
        return `<button type="button" class="ref-gallery__thumb${frameIndex === 0 ? " is-active" : ""}" data-gallery-thumb data-image="${esc(src)}" data-alt="${esc(alt)}" aria-label="Show ${esc(label)}" aria-pressed="${frameIndex === 0 ? "true" : "false"}" tabindex="${frameIndex === 0 ? "0" : "-1"}"><img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async" data-thumb-image></button>`;
      })
      .join("");
    const first = frames[0];
    if (first?.src)
      setStageImage(
        String(first.src),
        `${productName} — ${String(first.label || "Product view 1")}`,
      );
    return true;
  };

  qsa("[data-ref-product-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.refProductTab;
      qsa("[data-ref-product-tab]").forEach((item) => {
        const active = item === tab;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-selected", String(active));
      });
      qsa("[data-ref-product-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.refProductPanel !== target;
      });
    });
  });

  qsa("[data-buy-now]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      const quantity = Number(qtyDisplay?.textContent || 1);
      addToCart(button, quantity);
      window.setTimeout(
        () => {
          window.location.href = "checkout";
        },
        reduceMotion ? 0 : 220,
      );
    });
  });

  // PDP Mobile Sticky "Add to Bag" bar
  const pdpStickyBar = qs("[data-pdp-sticky-bar]");
  const pdpMainCta =
    qs(".ref-purchase-actions") ||
    qs(".product-commerce-hero__buy") ||
    qs("[data-main-cta]");
  if (pdpStickyBar && pdpMainCta && "IntersectionObserver" in window) {
    const pdpObserver = new IntersectionObserver(
      ([entry]) => {
        const isScrolledPast =
          !entry.isIntersecting && entry.boundingClientRect.top < 0;
        pdpStickyBar.classList.toggle("is-visible", isScrolledPast);
        pdpStickyBar.setAttribute("aria-hidden", String(!isScrolledPast));
      },
      { threshold: 0.1 },
    );
    pdpObserver.observe(pdpMainCta);

    const stickyAddBtn = qs("[data-sticky-add-btn]", pdpStickyBar);
    if (stickyAddBtn) {
      stickyAddBtn.addEventListener("click", () => {
        const mainAddBtn =
          qs(".ref-purchase-actions [data-add-to-cart]") ||
          qs("[data-add-to-cart]");
        if (mainAddBtn) {
          mainAddBtn.click();
        }
      });
    }
  }

  qsa("[data-delivery-check]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = qs('input[name="pincode"]', form);
      const result = qs("[data-delivery-result]", form);
      const pincode = input?.value.trim() || "";
      if (!/^[1-9][0-9]{5}$/.test(pincode)) {
        if (result)
          result.textContent = "Enter a valid 6-digit Indian pincode.";
        input?.focus();
        return;
      }
      if (result)
        result.textContent = `Pincode ${pincode} saved. Final serviceability and delivery estimate are confirmed at checkout.`;
    });
  });

  const appendPublishedReview = (review) => {
    const reviewList = qs("[data-review-list]");
    if (!reviewList) return;
    const card = document.createElement("article");
    card.className = "ref-review-card";

    const header = document.createElement("div");
    header.className = "ref-review-card__header";

    const avatar = document.createElement("span");
    avatar.className = "ref-review-avatar";
    avatar.textContent = (review.name || "C").slice(0, 1).toUpperCase();

    const meta = document.createElement("div");
    meta.className = "ref-review-meta";
    meta.innerHTML = `<strong>${safeText(review.name)}</strong><small><i class="ph-fill ph-seal-check"></i> Verified Buyer</small>`;

    header.append(avatar, meta);

    const stars = document.createElement("div");
    stars.className = "ref-review-stars";
    stars.textContent = "★".repeat(Number(review.rating || 5));

    const quote = document.createElement("blockquote");
    quote.className = "ref-review-text";
    quote.textContent = `“${review.review}”`;

    const date = document.createElement("time");
    date.className = "ref-review-date";
    date.textContent = review.date || "Just now";

    card.append(header, stars, quote, date);
    reviewList.prepend(card);
  };

  qsa("[data-review-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const status = qs("[data-review-status]", form);
      const submit = qs('button[type="submit"]', form);
      const formData = new FormData(form);
      const payload = {
        product_id: form.dataset.productId,
        name: String(formData.get("name") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        review: String(formData.get("review") || "").trim(),
        rating: Number(formData.get("rating") || 0),
        csrf_token: qs('meta[name="gawdee-csrf"]')?.content || "",
      };
      if (submit) submit.disabled = true;
      if (status) status.textContent = "Publishing your review…";
      try {
        const response = await fetch("api/product-review.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok || !result.ok)
          throw new Error(result.message || "Unable to publish your review.");
        appendPublishedReview(result.review);
        form.reset();
        if (status) status.textContent = result.message;
        showToast(result.message);
      } catch (error) {
        if (status)
          status.textContent =
            error.message || "Unable to publish your review right now.";
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  });

  // Floating AI shopping assistant.
  const aiChat = qs("[data-ai-chat]");
  const aiToggle = qs("[data-ai-toggle]");
  const aiForm = qs("[data-ai-form]");
  const aiInput = qs("#ai-question");
  const aiMessages = qs("[data-ai-messages]");
  const csrfToken = qs('meta[name="gawdee-csrf"]')?.content || "";
  const addAiMessage = (message, role = "assistant") => {
    if (!aiMessages) return;
    const node = document.createElement("div");
    node.className = `ai-message ai-message--${role}`;
    node.textContent = message;
    aiMessages.appendChild(node);
    aiMessages.scrollTop = aiMessages.scrollHeight;
    return node;
  };
  const openAi = () => {
    aiChat?.classList.add("is-open");
    aiToggle?.classList.add("is-active");
    aiChat?.setAttribute("aria-hidden", "false");
    aiToggle?.setAttribute("aria-expanded", "true");
    window.setTimeout(() => aiInput?.focus(), 120);
  };
  const closeAi = () => {
    aiChat?.classList.remove("is-open");
    aiToggle?.classList.remove("is-active");
    aiChat?.setAttribute("aria-hidden", "true");
    aiToggle?.setAttribute("aria-expanded", "false");
  };
  const askAi = async (message) => {
    if (!message || !aiForm) return;
    addAiMessage(message, "user");
    const waiting = addAiMessage("Thinking with care…", "assistant");
    aiForm.classList.add("is-loading");
    try {
      const response = await fetch("api/ai-chat.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, csrf_token: csrfToken }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok)
        throw new Error(result.message || "The assistant is unavailable.");
      if (waiting) waiting.textContent = result.reply;
    } catch (error) {
      if (waiting)
        waiting.textContent =
          error.message || "The assistant is unavailable right now.";
    } finally {
      aiForm.classList.remove("is-loading");
      aiInput?.focus();
      if (aiMessages) aiMessages.scrollTop = aiMessages.scrollHeight;
    }
  };
  aiToggle?.addEventListener("click", () =>
    aiChat?.classList.contains("is-open") ? closeAi() : openAi(),
  );
  qs("[data-ai-close]")?.addEventListener("click", closeAi);
  aiForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = aiInput?.value.trim() || "";
    if (!message) return;
    if (aiInput) aiInput.value = "";
    askAi(message);
  });
  qsa("[data-ai-suggestion]").forEach((button) =>
    button.addEventListener("click", () => {
      openAi();
      askAi(button.dataset.aiSuggestion || button.textContent.trim());
    }),
  );

  /* --------------------------------------------------------------------------
       Gawdee Reel Video Modal Player Initialization
       -------------------------------------------------------------------------- */
  const initReelPlayer = () => {
    let backdrop = qs(".reel-modal-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "reel-modal-backdrop";
      backdrop.setAttribute("aria-hidden", "true");
      backdrop.innerHTML = `
                <div class="reel-modal-container">
                    <div class="reel-modal-controls-top">
                        <span class="reel-modal-brand-badge"><i class="ph-fill ph-play-circle"></i> Gawdee Reel</span>
                        <div class="reel-modal-actions-top">
                            <button type="button" class="reel-modal-btn" data-reel-mute aria-label="Toggle mute"><i class="ph ph-speaker-high"></i></button>
                            <button type="button" class="reel-modal-btn" data-reel-close aria-label="Close reel"><i class="ph ph-x"></i></button>
                        </div>
                    </div>
                    <div class="reel-modal-video-wrap">
                        <!-- Video element inserted dynamically -->
                    </div>
                    <div class="reel-modal-info-bottom">
                        <div class="reel-modal-info-text">
                            <h4 data-reel-title></h4>
                            <p data-reel-subtitle></p>
                        </div>
                        <a href="#" class="reel-modal-product-card" data-reel-product-card style="display:none;" aria-label="View product details">
                            <img data-reel-prod-img src="" alt="">
                            <div class="reel-modal-product-details">
                                <strong data-reel-prod-name></strong>
                                <span data-reel-prod-price></span>
                            </div>
                            <span class="reel-modal-view-btn">
                                View Item <i class="ph ph-arrow-right"></i>
                            </span>
                        </a>
                    </div>
                </div>
            `;
      document.body.appendChild(backdrop);
    }

    const videoWrap = backdrop.querySelector(".reel-modal-video-wrap");
    const titleEl = backdrop.querySelector("[data-reel-title]");
    const subtitleEl = backdrop.querySelector("[data-reel-subtitle]");
    const productCard = backdrop.querySelector("[data-reel-product-card]");
    const prodImg = backdrop.querySelector("[data-reel-prod-img]");
    const prodName = backdrop.querySelector("[data-reel-prod-name]");
    const prodPrice = backdrop.querySelector("[data-reel-prod-price]");
    const closeBtn = backdrop.querySelector("[data-reel-close]");
    const muteBtn = backdrop.querySelector("[data-reel-mute]");

    let currentVideo = null;

    const closeReel = () => {
      backdrop.classList.remove("is-active");
      backdrop.setAttribute("aria-hidden", "true");
      if (currentVideo) {
        currentVideo.pause();
        currentVideo.src = "";
      }
      if (videoWrap) videoWrap.innerHTML = "";
    };

    const openReel = (triggerEl) => {
      const videoSrc = triggerEl.dataset.videoSrc || "";
      const videoType = triggerEl.dataset.videoType || "video";
      const title = triggerEl.dataset.videoTitle || "Gawdee Story";
      const subtitle = triggerEl.dataset.videoSubtitle || "";
      const poster = triggerEl.dataset.videoPoster || "";

      const prodId = triggerEl.dataset.productId || "";
      const prodNameText = triggerEl.dataset.productName || "";
      const prodPriceText = triggerEl.dataset.productPrice || "";
      const prodImageSrc = triggerEl.dataset.productImage || "";
      const prodUrl = triggerEl.dataset.productUrl || "";

      if (titleEl) titleEl.textContent = title;
      if (subtitleEl) subtitleEl.textContent = subtitle;

      if (prodId && productCard) {
        productCard.style.display = "flex";
        if (prodUrl) productCard.href = prodUrl;
        if (prodImg) prodImg.src = prodImageSrc;
        if (prodName) prodName.textContent = prodNameText;
        if (prodPrice) prodPrice.textContent = "₹" + prodPriceText;
      } else if (productCard) {
        productCard.style.display = "none";
      }

      if (videoWrap) {
        videoWrap.innerHTML = "";
        if (videoType === "external_video" && videoSrc.includes("youtube")) {
          const embedUrl = videoSrc.replace("watch?v=", "embed/");
          videoWrap.innerHTML = `<iframe src="${embedUrl}?autoplay=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen style="width:100%;height:100%;"></iframe>`;
        } else {
          const vid = document.createElement("video");
          vid.src = videoSrc;
          if (poster) vid.poster = poster;
          vid.autoplay = true;
          vid.playsInline = true;
          vid.loop = true;
          vid.controls = true;
          videoWrap.appendChild(vid);
          currentVideo = vid;

          vid.play().catch(() => {
            vid.muted = true;
            vid.play();
          });
        }
      }

      backdrop.classList.add("is-active");
      backdrop.setAttribute("aria-hidden", "false");
    };

    document.addEventListener("click", (e) => {
      const trigger = e.target.closest("[data-reel-trigger]");
      if (trigger) {
        e.preventDefault();
        openReel(trigger);
      }
    });

    closeBtn?.addEventListener("click", closeReel);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeReel();
    });

    muteBtn?.addEventListener("click", () => {
      if (currentVideo) {
        currentVideo.muted = !currentVideo.muted;
        muteBtn.innerHTML = currentVideo.muted
          ? '<i class="ph ph-speaker-slash"></i>'
          : '<i class="ph ph-speaker-high"></i>';
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && backdrop.classList.contains("is-active")) {
        closeReel();
      }
    });
  };

  initReelPlayer();
  renderCart();
})();
