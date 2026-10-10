(() => {
  const DATA_URL = "./data/lessons.json";
  const MANIFEST_URL = "./audio/manifest.json";
  const STORAGE_KEY = "elder-read-unknown";

  const state = {
    data: null,
    audioManifest: {},
    view: "home",
    lessonId: null,
    sentenceIndex: 0,
    selectedCharIndex: -1,
    playing: false,
    currentAudio: null,
  };

  const $ = (id) => document.getElementById(id);

  function isPunct(c) {
    return !c || /[。，、？！；：…—·\s]/.test(c);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadUnknown() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveUnknown(map) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  }

  function markUnknown(char, py, lessonId, text) {
    if (isPunct(char)) return;
    const map = loadUnknown();
    map[char] = {
      c: char,
      py: py || "",
      lessonId: lessonId || "",
      sample: text || "",
      at: Date.now(),
    };
    saveUnknown(map);
  }

  function clearUnknownChar(char) {
    const map = loadUnknown();
    delete map[char];
    saveUnknown(map);
  }

  function getLesson(id) {
    return state.data.lessons.find((l) => l.id === id);
  }

  function currentSentence() {
    const lesson = getLesson(state.lessonId);
    if (!lesson) return null;
    return lesson.sentences[state.sentenceIndex] || null;
  }

  function stopAudio() {
    if (state.currentAudio) {
      try {
        state.currentAudio.onended = null;
        state.currentAudio.onerror = null;
        state.currentAudio.pause();
        state.currentAudio.removeAttribute("src");
        state.currentAudio.load();
      } catch {
        /* ignore */
      }
      state.currentAudio = null;
    }
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  function waitMs(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function playAudioUrl(url) {
    return new Promise((resolve) => {
      const audio = new Audio();
      state.currentAudio = audio;
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        if (state.currentAudio === audio) state.currentAudio = null;
        resolve(ok);
      };
      audio.preload = "auto";
      audio.onended = () => done(true);
      audio.onerror = () => done(false);
      audio.src = url;
      const p = audio.play();
      if (p && typeof p.then === "function") p.catch(() => done(false));
    });
  }

  function onlineTtsUrl(text) {
    return `https://fanyi.baidu.com/gettts?lan=zh&text=${encodeURIComponent(text)}&spd=3&source=web`;
  }

  function speakViaSynthesis(text) {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) {
        resolve(false);
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN";
      u.rate = 0.75;
      const voices = window.speechSynthesis.getVoices();
      const hit = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith("zh"));
      if (hit) u.voice = hit;
      u.onend = () => resolve(true);
      u.onerror = () => resolve(false);
      window.speechSynthesis.speak(u);
    });
  }

  async function speak(text) {
    const t = String(text || "").trim();
    if (!t || isPunct(t)) return;
    const local = state.audioManifest[`zh|${t}`];
    if (local) {
      const ok = await playAudioUrl(local);
      if (ok) return;
    }
    const okOnline = await playAudioUrl(onlineTtsUrl(t));
    if (okOnline) return;
    await speakViaSynthesis(t);
  }

  function setView(view) {
    state.view = view;
    $("view-home").hidden = view !== "home";
    $("view-play").hidden = view !== "play";
    $("view-review").hidden = view !== "review";
    document.querySelectorAll(".nav-tabs button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === view);
    });
    if (view === "review") renderReview();
  }

  function renderHome() {
    const list = $("card-list");
    list.innerHTML = "";
    for (const lesson of state.data.lessons) {
      const a = document.createElement("a");
      a.className = "card";
      a.href = `#/lesson/${encodeURIComponent(lesson.id)}`;
      a.innerHTML = `
        <h2>${escapeHtml(lesson.title)}</h2>
        <div class="meta">${escapeHtml(lesson.note || "")} · ${lesson.sentences.length} 句</div>
      `;
      list.appendChild(a);
    }
  }

  function highlightChar(index) {
    document.querySelectorAll(".char-tile").forEach((el) => {
      el.classList.toggle("active", Number(el.dataset.index) === index);
    });
  }

  function selectChar(index) {
    const sent = currentSentence();
    if (!sent) return;
    const ch = sent.chars[index];
    if (!ch) return;
    state.selectedCharIndex = index;
    highlightChar(index);
    const tip = $("selectedTip");
    if (isPunct(ch.c)) {
      tip.hidden = true;
      $("btnUnknown").disabled = true;
      return;
    }
    tip.hidden = false;
    tip.textContent = ch.py ? `这个字读：${ch.py}` : "点下面听一听";
    $("btnUnknown").disabled = false;
  }

  function renderSentence() {
    const lesson = getLesson(state.lessonId);
    const sent = currentSentence();
    if (!lesson || !sent) return;

    $("play-title").textContent = lesson.title;
    $("progressText").textContent = `第 ${state.sentenceIndex + 1} 句 / 共 ${lesson.sentences.length} 句`;
    $("guide").textContent = "点一个字，听一听读音";
    $("selectedTip").hidden = true;
    $("btnUnknown").disabled = true;
    state.selectedCharIndex = -1;

    const row = $("charRow");
    row.innerHTML = "";
    sent.chars.forEach((ch, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "char-tile" + (isPunct(ch.c) ? " punct" : "");
      btn.dataset.index = String(i);
      btn.innerHTML = `
        <span class="py">${escapeHtml(ch.py || " ")}</span>
        <span class="han">${escapeHtml(ch.c)}</span>
      `;
      btn.addEventListener("click", async () => {
        if (state.playing) return;
        selectChar(i);
        if (!isPunct(ch.c)) await speak(ch.c);
      });
      row.appendChild(btn);
    });

    $("btnNext").textContent =
      state.sentenceIndex >= lesson.sentences.length - 1 ? "学完了 · 回课表" : "下一句";
  }

  async function playSentence() {
    const sent = currentSentence();
    if (!sent || state.playing) return;
    state.playing = true;
    setBusy(true);
    $("guide").textContent = "听整句，眼睛跟着黄格走";
    try {
      for (let i = 0; i < sent.chars.length; i++) {
        const ch = sent.chars[i];
        selectChar(i);
        if (!isPunct(ch.c)) {
          await speak(ch.c);
          await waitMs(220);
        } else {
          await waitMs(120);
        }
      }
      await waitMs(280);
      await speak(sent.text);
    } finally {
      state.playing = false;
      setBusy(false);
      $("guide").textContent = "点一个字，听一听读音";
    }
  }

  async function playOneByOne() {
    const sent = currentSentence();
    if (!sent || state.playing) return;
    state.playing = true;
    setBusy(true);
    $("guide").textContent = "一个一个读，慢慢跟";
    try {
      for (let i = 0; i < sent.chars.length; i++) {
        const ch = sent.chars[i];
        selectChar(i);
        if (!isPunct(ch.c)) {
          await speak(ch.c);
          await waitMs(480);
        } else {
          await waitMs(160);
        }
      }
    } finally {
      state.playing = false;
      setBusy(false);
      $("guide").textContent = "点一个字，听一听读音";
    }
  }

  function setBusy(busy) {
    $("btnSentence").disabled = busy;
    $("btnOneByOne").disabled = busy;
    $("btnNext").disabled = busy;
    if (busy) $("btnUnknown").disabled = true;
  }

  function nextSentence() {
    const lesson = getLesson(state.lessonId);
    if (!lesson) return;
    stopAudio();
    state.playing = false;
    if (state.sentenceIndex >= lesson.sentences.length - 1) {
      location.hash = "#/";
      return;
    }
    state.sentenceIndex += 1;
    renderSentence();
  }

  function renderReview() {
    const map = loadUnknown();
    const items = Object.values(map).sort((a, b) => (b.at || 0) - (a.at || 0));
    $("reviewStats").textContent = items.length
      ? `生字本里有 ${items.length} 个字，点字听音，会了就点「会了」`
      : "还没有记下生字。学句子时点「不认识这个字」就会收进来。";

    const box = $("unknownList");
    box.innerHTML = "";
    if (!items.length) {
      box.innerHTML = `<div class="empty">生字本是空的</div>`;
      return;
    }
    for (const item of items) {
      const card = document.createElement("div");
      card.className = "unknown-card";
      card.innerHTML = `
        <div class="han">${escapeHtml(item.c)}</div>
        <div class="py">${escapeHtml(item.py || "")}</div>
        <div class="actions">
          <button type="button" class="hear">听一听</button>
          <button type="button" class="got">会了</button>
        </div>
      `;
      card.querySelector(".hear").addEventListener("click", () => speak(item.c));
      card.querySelector(".got").addEventListener("click", () => {
        clearUnknownChar(item.c);
        renderReview();
      });
      box.appendChild(card);
    }
  }

  function route() {
    const hash = location.hash || "#/";
    const m = hash.match(/^#\/lesson\/([^/?#]+)/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (!getLesson(id)) {
        location.hash = "#/";
        return;
      }
      if (state.lessonId !== id) {
        state.lessonId = id;
        state.sentenceIndex = 0;
      }
      stopAudio();
      state.playing = false;
      setView("play");
      renderSentence();
      return;
    }
    // 非课文页：保持当前 tab（学句子 / 生字本）
    if (state.view === "review") {
      setView("review");
      return;
    }
    state.view = "home";
    setView("home");
    renderHome();
  }

  function bind() {
    document.querySelectorAll(".nav-tabs button").forEach((btn) => {
      btn.addEventListener("click", () => {
        stopAudio();
        state.playing = false;
        if (btn.dataset.view === "home") {
          location.hash = "#/";
          state.view = "home";
          setView("home");
          renderHome();
        } else {
          location.hash = "#/";
          state.view = "review";
          setView("review");
        }
      });
    });

    $("btnBack").addEventListener("click", () => {
      stopAudio();
      location.hash = "#/";
    });
    $("btnSentence").addEventListener("click", () => playSentence());
    $("btnOneByOne").addEventListener("click", () => playOneByOne());
    $("btnNext").addEventListener("click", () => nextSentence());
    $("btnUnknown").addEventListener("click", () => {
      const sent = currentSentence();
      if (!sent || state.selectedCharIndex < 0) return;
      const ch = sent.chars[state.selectedCharIndex];
      if (!ch || isPunct(ch.c)) return;
      markUnknown(ch.c, ch.py, state.lessonId, sent.text);
      $("selectedTip").hidden = false;
      $("selectedTip").textContent = `已记下「${ch.c}」，可在生字本复习`;
    });
    $("btnClearUnknown").addEventListener("click", () => {
      if (confirm("确定清空生字本？")) {
        saveUnknown({});
        renderReview();
      }
    });

    window.addEventListener("hashchange", route);
  }

  async function boot() {
    const [dataRes, manRes] = await Promise.all([
      fetch(DATA_URL),
      fetch(MANIFEST_URL).catch(() => null),
    ]);
    state.data = await dataRes.json();
    if (manRes && manRes.ok) {
      state.audioManifest = await manRes.json();
    }
    $("site-title").textContent = state.data.siteTitle || "老人识字";
    $("site-sub").textContent = state.data.siteSubtitle || "";
    bind();
    route();
  }

  boot().catch((err) => {
    console.error(err);
    $("card-list").innerHTML = `<div class="empty">加载失败，请刷新重试</div>`;
  });
})();
