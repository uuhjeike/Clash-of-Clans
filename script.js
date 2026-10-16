(function(){
  "use strict";

  /* ============================================================
     1. EXTERNAL POST SOURCE
     Edit Post.txt in the repository to add, remove, or update posts.
     Each post is enclosed by standalone lines containing only "$".
     Images, text, YouTube URLs, and "Link - (URL)" lines are supported.
  ============================================================ */
  const POSTS_URL = "https://raw.githubusercontent.com/uuhjeike/Clash-of-Clans/main/Post.txt";

  const PROFILE_PHOTO = "https://github.com/uuhjeike/Clash-of-Clans/blob/main/profile%20photo.png";

  /* ============================================================
     2. HELPERS
  ============================================================ */
  function toRawGithub(url){
    try{
      const u = new URL(url);
      if(u.hostname === "github.com" && u.pathname.includes("/blob/")){
        const rawPath = u.pathname.replace("/blob/", "/");
        return "https://raw.githubusercontent.com" + rawPath;
      }
    }catch(e){ /* not a valid absolute URL, leave as-is */ }
    return url;
  }

  const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i;
  const LINK_LINE = /^Link\s*-\s*\((https?:\/\/[^\s)]+)\)\s*$/i;
  const BARE_URL = /^https?:\/\/\S+$/i;
  const YOUTUBE_RE = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)([\w-]{11})|youtu\.be\/([\w-]{11}))/i;

  function getYouTubeId(url){
    const m = url.match(YOUTUBE_RE);
    if(!m) return null;
    return m[1] || m[2] || null;
  }

  function classifyLine(raw){
    const line = raw.trim();
    if(!line) return null;

    const linkMatch = line.match(LINK_LINE);
    if(linkMatch){
      const url = linkMatch[1];
      const ytId = getYouTubeId(url);
      if(ytId) return { type:"youtube", id:ytId, url };
      return { type:"link", url };
    }
    if(BARE_URL.test(line)){
      const ytId = getYouTubeId(line);
      if(ytId) return { type:"youtube", id:ytId, url:line };
      if(IMAGE_EXT.test(line.split("?")[0])){
        return { type:"image", url:toRawGithub(line) };
      }
      return { type:"link", url:line };
    }
    return { type:"text", value:line };
  }

  function parsePosts(raw){
    // Every standalone "$" line is a shared boundary between posts.
    // Example: $\nPost one\n$\nPost two\n$
    // Empty segments are ignored, so a single delimiter separates adjacent posts.
    const segments = raw.split(/^\s*\$\s*$/m);
    return segments
      .map(segment => segment.split("\n").map(classifyLine).filter(Boolean))
      .filter(items => items.length > 0)
      .map(items => {
        const images = items.filter(i => i.type === "image").map(i => i.url);
        const links = items.filter(i => i.type === "link");
        const videos = items.filter(i => i.type === "youtube");
        const textLines = items.filter(i => i.type === "text").map(i => i.value);
        return { images, links, videos, text: textLines.join("\n") };
      });
  }

  function isArmyLink(url){
    return /clashofclans\.com/i.test(url);
  }

  /* ============================================================
     3. PROGRESSIVE IMAGE LOADING
  ============================================================ */
  function fallbackSVG(){
    return '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">'+
      '<path d="M21 15l-5-5L5 21"/><circle cx="8" cy="8" r="2"/>'+
      '<rect x="3" y="3" width="18" height="18" rx="2"/></svg>';
  }

  function mountImage(box, img, url){
    img.addEventListener("load", () => {
      if(img.naturalWidth && img.naturalHeight){
        box.style.aspectRatio = img.naturalWidth + " / " + img.naturalHeight;
      }
      img.classList.add("loaded");
      box.classList.add("done");
    });
    img.addEventListener("error", () => {
      box.classList.add("error");
    });
    img.src = url;
  }

  function buildLazyImage(url, alt, eager){
    const box = document.createElement("div");
    box.className = "media-box";

    const shimmer = document.createElement("div");
    shimmer.className = "ph-shimmer";
    box.appendChild(shimmer);

    const img = document.createElement("img");
    img.alt = alt || "Post image";
    img.loading = eager ? "eager" : "lazy";
    img.decoding = "async";
    box.appendChild(img);

    const fb = document.createElement("div");
    fb.className = "media-fallback";
    fb.innerHTML = fallbackSVG() + "<span>Image unavailable</span>";
    box.appendChild(fb);

    if(eager){
      mountImage(box, img, url);
    } else if("IntersectionObserver" in window){
      const io = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
          if(entry.isIntersecting){
            mountImage(box, img, url);
            obs.unobserve(entry.target);
          }
        });
      }, { rootMargin: "200px 0px" });
      io.observe(box);
    } else {
      mountImage(box, img, url);
    }

    return box;
  }

  /* ============================================================
     4. RENDER
  ============================================================ */
  function renderPost(post, index){
    const el = document.createElement("article");
    el.className = "post";
    el.style.animationDelay = Math.min(index * 60, 300) + "ms";

    if(post.text){
      const p = document.createElement("p");
      p.className = "post-text";
      p.textContent = post.text;
      el.appendChild(p);
    }

    if(post.videos && post.videos.length){
      post.videos.forEach(v => {
        const wrap = document.createElement("div");
        wrap.className = "yt-embed";
        const iframe = document.createElement("iframe");
        iframe.src = "https://www.youtube.com/embed/" + v.id;
        iframe.title = "YouTube video player";
        iframe.frameBorder = "0";
        iframe.loading = "lazy";
        iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
        iframe.referrerPolicy = "strict-origin-when-cross-origin";
        iframe.allowFullscreen = true;
        wrap.appendChild(iframe);
        el.appendChild(wrap);
      });
    }

    if(post.images.length){
      const grid = document.createElement("div");
      grid.className = "post-media count-" + Math.min(post.images.length, 4);
      post.images.forEach((url, i) => {
        // first post's first image loads eagerly for a fast first paint;
        // everything else loads progressively as it scrolls into view
        const eager = index === 0 && i === 0;
        grid.appendChild(buildLazyImage(url, "Post image", eager));
      });
      el.appendChild(grid);
    }

    post.links.forEach(link => {
      const a = document.createElement("a");
      a.href = link.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "post-link" + (isArmyLink(link.url) ? " army" : "");
      a.innerHTML = isArmyLink(link.url)
        ? "⚔️ Open Army"
        : "🔗 Open Link";
      el.appendChild(a);
    });

    return el;
  }

  async function init(){
    // profile photo — eager, highest priority
    const avatarImg = document.getElementById("avatarImg");
    const avatarBox = avatarImg.closest(".avatar-inner");
    avatarImg.addEventListener("load", () => {
      avatarImg.classList.add("loaded");
      avatarBox.classList.add("done");
    });
    avatarImg.addEventListener("error", () => {
      avatarBox.style.background = "linear-gradient(160deg, var(--wood-light), var(--wood))";
      avatarBox.classList.add("done");
    });
    avatarImg.src = toRawGithub(PROFILE_PHOTO);

    // Feed content is loaded from the editable repository text file.
    const feed = document.getElementById("feed");
    try{
      const response = await fetch(POSTS_URL, { cache: "no-cache" });
      if(!response.ok) throw new Error("Post.txt request failed: " + response.status);
      const posts = parsePosts(await response.text());
      const frag = document.createDocumentFragment();
      posts.forEach((post, i) => frag.appendChild(renderPost(post, i)));
      feed.appendChild(frag);
    }catch(error){
      console.error("Unable to load Post.txt:", error);
      const notice = document.createElement("p");
      notice.className = "feed-end";
      notice.textContent = "Posts could not be loaded. Please check that Post.txt exists in the repository.";
      feed.appendChild(notice);
    }
  }

  /* ============================================================
     5. AMBIENT EMBERS (lightweight, capped particle count)
  ============================================================ */
  function spawnEmbers(){
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const host = document.getElementById("embers");
    const count = window.innerWidth < 600 ? 10 : 16;
    for(let i = 0; i < count; i++){
      const e = document.createElement("div");
      e.className = "ember";
      const left = Math.random() * 100;
      const duration = 9 + Math.random() * 8;
      const delay = Math.random() * 14;
      const drift = (Math.random() * 60 - 30) + "px";
      e.style.left = left + "vw";
      e.style.setProperty("--drift", drift);
      e.style.animationDuration = duration + "s";
      e.style.animationDelay = "-" + delay + "s";
      host.appendChild(e);
    }
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", () => { init(); spawnEmbers(); });
  } else {
    init();
    spawnEmbers();
  }
})();
