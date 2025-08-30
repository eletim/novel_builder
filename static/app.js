// static/app.js  ← 丸ごと置き換え
(function () {
  // 小ユーティリティ
  const $  = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  // トースト
  const toast = $("#toast");
  function showToast(msg, ok = true) {
    if (!toast) return;
    toast.textContent = msg;
    toast.style.borderColor = ok ? "var(--ok)" : "var(--err)";
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => (toast.hidden = true), 1600);
  }

  // ─────────────────────────────────────
  // ① indexページ：新規チャプター作成
  // ─────────────────────────────────────
  (function initIndex() {
    const buttons = $$(".vol-create-btn");
    if (!buttons.length) return; // index以外

    buttons.forEach(btn => {
      btn.addEventListener("click", async () => {
        const volume_path = btn.dataset.vol;
        if (!volume_path) return;
        btn.disabled = true;
        try {
          const res = await fetch("/api/create_chapter", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ volume_path })
          });
          if (!res.ok) {
            const text = await res.text();
            alert("作成に失敗しました: " + text);
            btn.disabled = false;
            return;
          }
          const data = await res.json();
          // すぐ編集へ
          location.href = data.single_url;
        } catch (e) {
          alert("作成に失敗しました: " + (e?.message || e));
          btn.disabled = false;
        }
      });
    });

    // ★ アウトライン作成
    const oBtns = $$(".vol-outline-create-btn");
    if (oBtns.length) {
      oBtns.forEach(btn => {
        btn.addEventListener("click", async () => {
          const volume_path = btn.dataset.vol;
          if (!volume_path) return;
          btn.disabled = true;
          try {
            const res = await fetch("/api/create_outline", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ volume_path })
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            location.href = data.single_url; // すぐ編集に入る
          } catch (e) {
            alert("作成に失敗しました: " + (e?.message || e));
            btn.disabled = false;
          }
        });
      });
    }
  })();

  // タイトル編集（シリーズ/巻/章）
  function setupTitleEditing(rootEl) {
    if (!rootEl) return;
    rootEl.addEventListener("click", (e) => {
      const editBtn = e.target.closest(".t-edit");
      if (!editBtn) return;
      e.stopPropagation(); // <summary> の開閉を抑止
      const holder = editBtn.parentElement;             // <summary> or <li>
      const input  = holder.querySelector(".t-input");
      const disp   = holder.querySelector(".t-display") || holder.querySelector(".chapter-link");
      if (!input || !disp) return;
      input.hidden = false;
      input.dataset.orig = input.value.trim(); 
      if (disp.classList.contains("chapter-link")) disp.style.display = "none";
      else disp.hidden = true;
      editBtn.style.visibility = "hidden";
      input.focus(); input.select();
    });

    rootEl.addEventListener("keydown", async (e) => {
      const input = e.target.closest(".t-input");
      if (!input) return;
      if (e.key === "Escape") {
        cancelEdit(input);
      }
      if (e.key === "Enter") {
        e.preventDefault();
        await commitEdit(input);
      }
    });

    rootEl.addEventListener("blur", (e) => {
      const input = e.target.closest(".t-input");
      if (!input) return;
      if (input.hidden) return;
      // blurでも保存（不要なら削除）
      commitEdit(input);
    }, true);

    async function commitEdit(input) {
      if (input.dataset.saving === "1") return;
      const holder = input.parentElement.closest("[data-path]") || input.parentElement;
      const path = holder.dataset.path;
      const kind = holder.dataset.kind; // series/volume/chapter
      const value = input.value.trim();
      // 変更なしなら保存しない（表示だけ戻す）
      if ((input.dataset.orig || "") === value) {
        cancelEdit(input);
        return;
      }
      try {
        input.dataset.saving = "1";
        const res = await fetch("/api/set_title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, title: value })
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        // 表示更新
        const disp = holder.querySelector(".t-display") || holder.querySelector(".chapter-link");
        if (disp.classList.contains("chapter-link")) {
          disp.textContent = data.title || holder.querySelector(".chapter-link").textContent.replace(/\s*\(.*\)$/, "") || holder.dataset.fallback || disp.textContent;
          disp.style.display = ""; // 復帰
        } else {
          disp.textContent = data.title || holder.dataset.fallback || disp.textContent;
          disp.hidden = false;
        }
        input.hidden = true;
        holder.querySelector(".t-edit").style.visibility = "";

        // セレクトボックス側も更新（シリーズ/巻）
        const volSelect = document.getElementById("volumeSelect");
        if (volSelect && kind !== "chapter") {
          if (kind === "series") {
            const og = volSelect.querySelector(`optgroup[data-path="${path}"]`);
            if (og) og.label = data.title || og.getAttribute("data-path").split("/").pop();
          } else if (kind === "volume") {
            const opt = volSelect.querySelector(`option[data-path="${path}"]`);
            if (opt) opt.textContent = data.title || opt.value.split("/").pop();
          }
        }
        showToast && showToast("タイトルを保存しました");
      } catch (err) {
        showToast && showToast("保存に失敗: " + (err.message || err), false);
      } finally {
        delete input.dataset.saving;    // ★ フラグ解除
      }
    }

    function cancelEdit(input) {
      input.hidden = true;
      const holder = input.parentElement.closest("[data-path]") || input.parentElement;
      const disp = holder.querySelector(".t-display") || holder.querySelector(".chapter-link");
      if (disp.classList.contains("chapter-link")) disp.style.display = "";
      else disp.hidden = false;
      holder.querySelector(".t-edit").style.visibility = "";
    }
  }

  // 呼び出し
  setupTitleEditing(document.querySelector(".tree"));


  // ─────────────────────────────────────
  // ② 一覧ページ（chapter.html）：4カラム保存
  // ─────────────────────────────────────
  (function initGridEditors() {
    const grid = $("#editorGrid");
    if (!grid) return; // 一覧ページ以外

    const chapterPath = grid.dataset.chapter;

    // 未保存マーク
    $$(".pane", grid).forEach(pane => {
      const ta    = $(".editor", pane);
      const dirty = $(".dirty",  pane);
      if (!ta || !dirty) return;
      ta.addEventListener("input", () => { dirty.hidden = false; });
    });

    // 個別保存
    async function savePane(pane, quiet = false) {
      const filename = pane.dataset.filename;
      const ta       = $(".editor", pane);
      const dirty    = $(".dirty",  pane);
      if (!filename || !ta) return false;

      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapter_path: chapterPath,
          filename,
          content: ta.value,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        if (!quiet) showToast("保存に失敗: " + text, false);
        return false;
      }
      if (dirty) dirty.hidden = true;
      if (!quiet) showToast(`${filename} を保存しました`);
      return true;
    }

    // ボタン保存
    $$(".btn-save", grid).forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const pane = e.target.closest(".pane");
        if (pane) await savePane(pane);
      });
    });

    // すべて保存
    const saveAllBtn = $("#saveAllBtn");
    saveAllBtn && saveAllBtn.addEventListener("click", async () => {
      for (const pane of $$(".pane", grid)) {
        // notesは後述toggle次第で別枠、でもまとめてOK
        await savePane(pane, true);
      }
      const notesPane = $("#notesWrap .pane");
      if (notesPane && !$("#notesWrap").hidden) {
        await savePane(notesPane, true);
      }
      showToast("すべて保存しました");
    });

    // Ctrl+S ですべて保存
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveAllBtn?.click();
      }
    });

    // notes 表示切替
    const toggleNotes = $("#toggleNotes");
    const notesWrap   = $("#notesWrap");
    if (toggleNotes && notesWrap) {
      toggleNotes.addEventListener("change", () => {
        notesWrap.hidden = !toggleNotes.checked;
      });
    }
  })();

  // ─────────────────────────────────────
  // ③ 個別ページ（single.html）：1カラム保存＆矢印ナビ
  // ─────────────────────────────────────
  (function initSingleEditor() {
    const singlePane = $("#singlePane");
    if (!singlePane) return; // 個別ページ以外

    const chapterPath = singlePane.dataset.chapter;
    const filename    = singlePane.dataset.filename;
    const editor      = $("#singleEditor");
    const dirty       = $(".dirty", singlePane);
    const charEl = document.querySelector("#charCount");
    const lineEl = document.querySelector("#lineCount");

    function updateCounters() {
      if (!editor || !charEl || !lineEl) return;
      const normalized = editor.value.replace(/\r/g, ""); // CR除去
      const chars = Array.from(normalized.replace(/\n/g, "")).length; // 改行除く
      const lines = normalized === "" ? 0 : normalized.split("\n").length; // 行数
      charEl.textContent = String(chars);
      lineEl.textContent = String(lines);
    }

    editor && editor.addEventListener("input", () => {
      if (dirty) dirty.hidden = false;
      updateCounters();
    })

    async function saveSingle(quiet = false) {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapter_path: chapterPath,
          filename,
          content: editor ? editor.value : "",
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        if (!quiet) showToast("保存に失敗: " + text, false);
        return false;
      }
      if (dirty) dirty.hidden = true;
      if (!quiet) showToast(`${filename} を保存しました`);
      return true;
    }

    // ボタン保存
    $("#saveBtn")  && $("#saveBtn").addEventListener("click",  () => saveSingle(false));
    $("#saveBtn2") && $("#saveBtn2").addEventListener("click", () => saveSingle(false));

    updateCounters();

    // Ctrl+S 保存
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault(); saveSingle(false);
      }
    });

    // 矢印キー：←→ステージ / ↑↓章
    const nav = window.__SINGLE__ || {};
    window.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft"  && nav.prevStageUrl)   { e.preventDefault(); location.href = nav.prevStageUrl; }
      if (e.key === "ArrowRight" && nav.nextStageUrl)   { e.preventDefault(); location.href = nav.nextStageUrl; }
      if (e.key === "ArrowUp"    && nav.prevChapterUrl) { e.preventDefault(); location.href = nav.prevChapterUrl; }
      if (e.key === "ArrowDown"  && nav.nextChapterUrl) { e.preventDefault(); location.href = nav.nextChapterUrl; }
    });
  })();

  // ─────────────────────────────────────
  // ④ フルスクリーン編集（fullscreen.html）
  // ─────────────────────────────────────
  (function initFullscreen() {
    function start() {
      const ctx = window.__FULL__;
      const editor = document.getElementById("fsEditor");
      const root = document.querySelector(".fs-root");
      if (!ctx || !editor || !root) return;

      const dirty = root.querySelector(".dirty");
      const charEl = document.getElementById("fsChar");
      const lineEl = document.getElementById("fsLine");

      // 既存データを挿入（HTMLとしてではなく“テキストとして”）
      editor.textContent = (ctx.content || "").replace(/\r/g, "");

      function updateCounters() {
        const normalized = editor.innerText.replace(/\r/g, "");
        const chars = Array.from(normalized.replace(/\n/g, "")).length;
        const lines = normalized === "" ? 0 : normalized.split("\n").length;
        if (charEl) charEl.textContent = String(chars);
        if (lineEl) lineEl.textContent = String(lines);
      }
      updateCounters();

      // デバウンス・オートセーブ
      let t = null;
      editor.addEventListener("input", () => {
        if (dirty) dirty.hidden = false;
        updateCounters();
        clearTimeout(t); t = setTimeout(save, 800);
      });

      async function save() {
        const content = editor.innerText.replace(/\r/g, "");
        const res = await fetch("/api/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapter_path: ctx.chapterPath, filename: ctx.filename, content })
        });
        if (!res.ok) {
          const text = await res.text();
          showToast && showToast("保存に失敗: " + text, false);
          return;
        }
        if (dirty) dirty.hidden = true;
        showToast && showToast(`${ctx.filename} を保存しました`);
      }

      // ボタン/ショートカット
      document.getElementById("fsSaveBtn")?.addEventListener("click", save);
      window.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
      });

      // 章移動（ステージは維持）
      window.addEventListener("keydown", (e) => {
        if (e.key === "ArrowUp" && ctx.prevChapterUrl) {
          e.preventDefault(); location.href = ctx.prevChapterUrl + "?stage=" + encodeURIComponent(ctx.filename);
        }
        if (e.key === "ArrowDown" && ctx.nextChapterUrl) {
          e.preventDefault(); location.href = ctx.nextChapterUrl + "?stage=" + encodeURIComponent(ctx.filename);
        }
      });

      // 離脱ガード
      window.addEventListener("beforeunload", (e) => {
        if (dirty && !dirty.hidden) { e.preventDefault(); e.returnValue = ""; }
      });
    }

    // ★ ここがポイント：DOM 構築完了後に開始（__FULL__ もこの時点で存在）
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start);
    } else {
      start();
    }
  })();
})();
