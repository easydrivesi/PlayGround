(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const grid = $("grid"), search = $("search"), tagFilter = $("tagFilter"),
    sortSel = $("sort"), hideBroken = $("hideBroken"), statusEl = $("status"),
    countEl = $("stationCount"), favToggle = $("favToggle");
  const audio = $("audio"), pName = $("pName"), pTags = $("pTags"),
    pPlay = $("pPlay"), pVol = $("pVol"), pMute = $("pMute"),
    pArt = $("pArt"), pHome = $("pHome"), pFav = $("pFav"),
    pSpinner = $("pSpinner"), player = $("player");

  const API = "https://de1.api.radio-browser.info/json/stations/bycountry/Slovenia";
  const FALLBACK_ART = pArt.src;
  window.__FALLBACK_ART = FALLBACK_ART;
  let all = [], current = null, favOnly = false;
  let favs = new Set(JSON.parse(localStorage.getItem("si-radio-favs") || "[]"));

  const saveFavs = () => localStorage.setItem("si-radio-favs", JSON.stringify([...favs]));
  const norm = (s) => (s || "").toLowerCase();
  const uuid = (s) => s.stationuuid || s.name + s.url;

  function setStatus(msg, isErr = false) {
    statusEl.textContent = msg;
    statusEl.classList.toggle("err", isErr);
  }

  async function load() {
    // 1) show curated list instantly
    all = (window.FALLBACK_STATIONS || []).map((s, i) => ({
      stationuuid: "fallback-" + i, name: s.name, url_resolved: s.url,
      homepage: s.homepage, favicon: "", tags: s.tags, codec: s.codec,
      bitrate: s.bitrate, votes: 1000 - i, lastcheckok: 1,
    }));
    render();
    setStatus("Nalaganje celotnega imenika postaj… / Loading full directory…");
    // 2) fetch full directory (all Slovenian stations)
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const r = await fetch(`${API}?order=votes&reverse=true&hidebroken=${hideBroken.checked ? "true" : "false"}`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      if (Array.isArray(data) && data.length) {
        all = data;
        setStatus(`Naloženih ${data.length} postaj iz Slovenije. / Loaded ${data.length} Slovenian stations.`);
      } else {
        throw new Error("empty");
      }
    } catch (e) {
      setStatus("Imenik ni dosegljiv — prikazan je preverjen izbor postaj. / Directory offline — showing curated list.", true);
    }
    buildTags();
    render();
  }

  function buildTags() {
    const counts = {};
    all.forEach((s) => (s.tags || "").split(",").map((t) => t.trim()).filter(Boolean)
      .forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 40);
    tagFilter.innerHTML = `<option value="">Vse zvrsti / All genres (${all.length})</option>` +
      top.map(([t, c]) => `<option value="${t}">${t} (${c})</option>`).join("");
  }

  function filtered() {
    const q = norm(search.value), tag = tagFilter.value;
    let list = all.filter((s) => {
      if (favOnly && !favs.has(uuid(s))) return false;
      if (tag && !norm(s.tags).includes(norm(tag))) return false;
      if (q && !(norm(s.name).includes(q) || norm(s.tags).includes(q) || norm(s.country).includes(q) || norm(s.state).includes(q))) return false;
      return true;
    });
    if (sortSel.value === "name") list.sort((a, b) => a.name.localeCompare(b.name, "sl"));
    else if (sortSel.value === "bitrate") list.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    else list.sort((a, b) => (b.votes || 0) - (a.votes || 0));
    return list;
  }

  function render() {
    const list = filtered();
    countEl.textContent = `${all.length} postaj / stations · prikazanih ${list.length}`;
    if (!list.length) {
      grid.innerHTML = `<p style="color:var(--muted)">Ni zadetkov. / No matches.</p>`;
      return;
    }
    grid.innerHTML = list.map((s) => {
      const id = uuid(s);
      const playing = current && uuid(current) === id && !audio.paused;
      const tags = (s.tags || "").split(",").slice(0, 3).join(" · ") || "Slovenija";
      const q = (s.codec || "") + (s.bitrate ? ` · ${s.bitrate}k` : "");
      const fav = favs.has(id) ? "★" : "☆";
      return `<article class="card ${playing ? "playing" : ""}" data-id="${id}" title="${escapeHtml(s.name)}">
        <button class="fav" data-fav="${id}" title="Priljubljena">${fav}</button>
        <img loading="lazy" src="${s.favicon || FALLBACK_ART}" alt="" onerror="this.onerror=null;this.src=window.__FALLBACK_ART" />
        <div class="info"><strong title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</strong><small>${escapeHtml(tags)}</small><div class="meta">${escapeHtml(q)} · ★ ${s.votes || 0}</div></div>
        <button class="playbtn" data-play="${id}" aria-label="Predvajaj ${escapeHtml(s.name)}">${playing ? "⏸" : "▶"}</button>
      </article>`;
    }).join("");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function findById(id) { return all.find((s) => uuid(s) === id); }

  async function play(station, retryAlt = true) {
    current = station;
    pName.textContent = station.name;
    pTags.textContent = station.tags || "Slovenija";
    pArt.src = station.favicon || FALLBACK_ART;
    pArt.onerror = () => { pArt.onerror = null; pArt.src = FALLBACK_ART; };
    pHome.classList.toggle("hidden", !station.homepage);
    if (station.homepage) pHome.href = station.homepage;
    pFav.textContent = favs.has(uuid(station)) ? "★" : "☆";
    pSpinner.classList.remove("hidden");
    player.classList.add("on");
    try {
      // count a click (Radio Browser convention, best-effort)
      if (station.stationuuid && !String(station.stationuuid).startsWith("fallback-"))
        fetch(`https://de1.api.radio-browser.info/json/url/${station.stationuuid}`, { mode: "no-cors" }).catch(() => {});
      let url = station.url_resolved || station.url;
      // HTTPS pages block HTTP audio: prefer an HTTPS variant of the same stream.
      if (location.protocol === "https:" && /^http:\/\//i.test(url) && retryAlt) {
        station._httpsUrl = url.replace(/^http:\/\//i, "https://");
        url = station._httpsUrl;
      } else if (station._httpUrl && !retryAlt) {
        url = station._httpUrl;
      }
      station._httpUrl = station.url_resolved || station.url;
      audio.src = url;
      await audio.play();
    } catch (e) {
      // If the HTTPS variant failed, retry plain HTTP (works over HTTP pages / some servers).
      if (retryAlt && station._httpUrl && audio.src !== station._httpUrl) {
        try { audio.src = station._httpUrl; await audio.play(); render(); return; }
        catch (_) { /* fall through to error message */ }
      }
      setStatus(`Napaka pri predvajanju “${station.name}”: ${e.message}. Poskusi drugo postajo.`, true);
    }
    render();
  }

  function toggle() {
    if (!current) {
      const first = filtered()[0];
      if (first) play(first);
      return;
    }
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
    render();
  }

  // events
  grid.addEventListener("click", (e) => {
    const p = e.target.closest("[data-play]");
    const f = e.target.closest("[data-fav]");
    if (p) {
      const st = findById(p.dataset.play);
      if (current && uuid(current) === p.dataset.play && !audio.paused) { audio.pause(); render(); }
      else if (st) play(st);
    } else if (f) {
      const id = f.dataset.fav;
      favs.has(id) ? favs.delete(id) : favs.add(id);
      saveFavs();
      if (current && uuid(current) === id) pFav.textContent = favs.has(id) ? "★" : "☆";
      render();
    }
  });
  pPlay.onclick = toggle;
  pFav.onclick = () => {
    if (!current) return;
    const id = uuid(current);
    favs.has(id) ? favs.delete(id) : favs.add(id);
    saveFavs(); pFav.textContent = favs.has(id) ? "★" : "☆"; render();
  };
  audio.addEventListener("playing", () => { pSpinner.classList.add("hidden"); pPlay.textContent = "⏸"; render(); });
  audio.addEventListener("pause", () => { pPlay.textContent = "▶"; player.classList.remove("on"); render(); });
  audio.addEventListener("waiting", () => pSpinner.classList.remove("hidden"));
  audio.addEventListener("error", () => {
    pSpinner.classList.add("hidden");
    if (current) setStatus(`Tok postaje “${current.name}” se ni odprl (mešana vsebina HTTP/HTTPS ali nedosegljiv strežnik). / Stream failed to open.`, true);
  });
  audio.volume = 0.9;
  pVol.oninput = () => { audio.volume = pVol.value / 100; audio.muted = false; pMute.textContent = "🔊"; };
  pMute.onclick = () => { audio.muted = !audio.muted; pMute.textContent = audio.muted ? "🔇" : "🔊"; };

  let deb; search.oninput = () => { clearTimeout(deb); deb = setTimeout(render, 150); };
  tagFilter.onchange = render; sortSel.onchange = render;
  hideBroken.onchange = load;
  favToggle.onclick = () => {
    favOnly = !favOnly;
    favToggle.setAttribute("aria-pressed", String(favOnly));
    render();
  };
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) {
      e.preventDefault(); toggle();
    }
  });

  // PWA install prompt
  let deferred;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); deferred = e;
    const b = document.getElementById("installBtn");
    b.classList.remove("hidden");
    b.onclick = () => { deferred.prompt(); deferred = null; b.classList.add("hidden"); };
  });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

  // MediaSession (lock-screen controls)
  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", () => audio.play().catch(() => {}));
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
  }

  load();
})();
