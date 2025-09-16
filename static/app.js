// static/app.js
(function () {
  // 小ユーティリティ
  const $  = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  // 追加：現在のURLが /novel 配下なら、APIプレフィックスとして /novel を付ける
  function api(path, init={}) {
    const prefix = location.pathname.startsWith('/novel') ? '/novel' : '';
    const p = path.startsWith('/') ? path : `/${path}`;
    return fetch(prefix + p, init);
  }

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
          const res = await api("/api/create_chapter", {
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
            const res = await api("/api/create_outline", {
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
        const res = await api("/api/set_title", {
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

      const res = await api("/api/save", {
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
    const singlePane = document.getElementById("singlePane");
    if (!singlePane) return;

    const chapterPath = singlePane.dataset.chapter;
    const filename    = singlePane.dataset.filename;
    const editor      = document.getElementById("singleEditor");
    const dirty       = singlePane.querySelector(".dirty");
    const charEl      = document.getElementById("charCount");
    const lineEl      = document.getElementById("lineCount");
    const splitToggle = document.getElementById("splitToggle");
    const sectionsWrap= document.getElementById("sectionsWrap");

    function updateCounters() {
      if (!editor || !charEl || !lineEl) return;
      const normalized = editor.value.replace(/\r/g, "");
      const chars = Array.from(normalized.replace(/\n/g, "")).length;
      const lines = normalized === "" ? 0 : normalized.split("\n").length;
      charEl.textContent = String(chars);
      lineEl.textContent = String(lines);
    }

    // 既存：未保存マーク & カウンタ
    editor && editor.addEventListener("input", () => {
      if (dirty) dirty.hidden = false;
      updateCounters();
    });
    updateCounters();

    // ---- ここから分割表示ロジック ---------------------------------

    // Markdown見出しで区切る（# のみ対象）
    function parseSections(text) {
      const lines = text.replace(/\r/g, "").split("\n");
      const sections = [];
      let cur = { heading: null, level: 0, bodyLines: [] };

      const headingRe = /^#\s+(.*)$/;   // #1限定

      for (const line of lines) {
        const m = line.match(headingRe);
        if (m) {
          // 直前のセクションを確定
          if (cur.heading !== null || cur.bodyLines.length > 0) {
            sections.push(cur);
          }
          cur = { heading: m[1], level: 1, bodyLines: [] }; // levelは常に1
        } else {
          cur.bodyLines.push(line);
        }
      }
      // 最後のセクション
      if (cur.heading !== null || cur.bodyLines.length > 0) {
        sections.push(cur);
      }
      return sections;
    }

    // セクション配列 → 一つのテキストへ（未使用だが残置）
    function composeText(sections) {
      const parts = [];
      sections.forEach((sec, idx) => {
        if (sec.heading !== null) {
          parts.push(`${"#".repeat(sec.level)} ${sec.heading}`);
        }
        if (sec.bodyLines.length) {
          parts.push(sec.bodyLines.join("\n"));
        }
        if (idx !== sections.length - 1) parts.push("");
      });
      return parts.join("\n");
    }

    // 現在のDOM（sec-item群）からテキストを合成
    function collectFromDOM() {
      const items = Array.from(sectionsWrap.querySelectorAll(".sec-item"));
      const out = [];
      items.forEach((el, i) => {
        const heading = (el.dataset.heading ?? null);
        const level   = Number(el.dataset.level || 1);
        const bodyTa  = el.querySelector(".sec-body");

        if (heading !== null) out.push(`${"#".repeat(level)} ${heading}`);
        if (bodyTa && bodyTa.value !== "") out.push(bodyTa.value.replace(/\r/g, ""));
        if (i !== items.length - 1) out.push("");
      });
      return out.join("\n");
    }

    // OPEN/CLOSE を1つに保つ
    let openIndex = -1;

    function setClosedState(el, closed = true) {
      const body  = el.querySelector(".sec-body");
      el.classList.toggle("open", !closed);
      el.classList.toggle("closed", closed);
      if (body)  { body.disabled  = closed; }
    }

    function setOpen(idx) {
      const items = Array.from(sectionsWrap.querySelectorAll(".sec-item"));
      items.forEach((el, i) => {
        setClosedState(el, i !== idx);
      });
      openIndex = idx;
      editor.value = collectFromDOM();
      updateCounters();
    }

    function closeAll() {
      const items = Array.from(sectionsWrap.querySelectorAll(".sec-item"));
      items.forEach(el => setClosedState(el, true));
      openIndex = -1;
      // DOM状態→テキストにも反映（念のため）
      editor.value = collectFromDOM();
      updateCounters();
    }

    // DOMへ描画（Accordion 構造を用意）
    function renderSections(text) {
      sectionsWrap.innerHTML = "";
      const sections = parseSections(text);

      // 見出しが1つも無い場合は、単一本文として扱う（heading=null）
      if (sections.length === 0) {
        sections.push({ heading: null, level: 0, bodyLines: text.replace(/\r/g, "").split("\n") });
      }

      sections.forEach((sec, idx) => {
        const block = document.createElement("section");
        block.className = "sec-item" + (sec.heading !== null ? " has-heading" : " no-heading");

        const head = document.createElement("div");
        head.className = "sec-headline";

        if (sec.heading !== null) {
          // ▼ タイトルボタン（開閉用・常時同一）
          const headTextBtn = document.createElement("button");
          headTextBtn.type = "button";
          headTextBtn.className = "sec-head-text";
          headTextBtn.textContent = sec.heading; // # 抜き
          head.appendChild(headTextBtn);

          // メタ情報を block に保持（合成時に使う）
          block.dataset.heading = sec.heading;
          block.dataset.level = String(sec.level || 1);

          // クリックでトグル：閉→開、開→閉
          headTextBtn.addEventListener("click", () => {
            if (openIndex === idx) {
              // 今開いている自分を閉じる
              setClosedState(block, true);
              openIndex = -1;
              editor.value = collectFromDOM();
              updateCounters();
            } else {
              setOpen(idx);
            }
          });

          headTextBtn.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); headTextBtn.click(); }
          });
        } else {
          // （冒頭）もボタン化して同じ挙動
          const headTextBtn = document.createElement("button");
          headTextBtn.type = "button";
          headTextBtn.className = "sec-head-text";
          headTextBtn.textContent = "（冒頭）";
          head.appendChild(headTextBtn);

          headTextBtn.addEventListener("click", () => {
            if (openIndex === idx) {
              setClosedState(block, true);
              openIndex = -1;
              editor.value = collectFromDOM();
              updateCounters();
            } else {
              setOpen(idx);
            }
          });
          headTextBtn.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); headTextBtn.click(); }
          });
        }

        const ta = document.createElement("textarea");
        ta.className = "sec-body";
        ta.spellcheck = false;
        ta.value = sec.bodyLines.join("\n");

        ta.addEventListener("input", () => {
          editor.value = collectFromDOM();
          if (dirty) dirty.hidden = false;
          updateCounters();
        });

        block.appendChild(head);
        block.appendChild(ta);
        sectionsWrap.appendChild(block);
      });
      // 初期状態は「すべて閉じる」
      closeAll();
    }

    // トグル動作
    if (splitToggle && sectionsWrap && editor) {
      splitToggle.addEventListener("change", () => {
        if (splitToggle.checked) {
          renderSections(editor.value);
          closeAll();
          singlePane.classList.add("mode-split");
          sectionsWrap.hidden = false; // hidden が付いていた場合の念押し
        } else {
          // DOM から合成して反映（セクション側の修正を確実に取り込む）
          if (!sectionsWrap.hidden) {
            editor.value = collectFromDOM();
            updateCounters();
          }
          singlePane.classList.remove("mode-split");
          sectionsWrap.hidden = true; // 念のため隠す（どちらでもOK）
        }
      });
      
      // 初期状態の反映
      const headingCount = (editor.value.match(/^#\s+.+$/gm) || []).length;
      if (headingCount >= 2) {
        splitToggle.checked = true;
        // 既存のハンドラをそのまま使って初期反映
        splitToggle.dispatchEvent(new Event("change"));
      }
    }

    // ---- 既存：保存/ショートカット/ナビはそのまま ----
    async function saveSingle(quiet = false) {
      // 分割表示中は DOM → テキストへ合成してから保存
      if (splitToggle && splitToggle.checked) {
        editor.value = collectFromDOM();
        updateCounters();
      }
      const res = await api("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapter_path: chapterPath, filename, content: editor ? editor.value : "" }),
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

    document.getElementById("saveBtn")  && document.getElementById("saveBtn").addEventListener("click",  () => saveSingle(false));
    document.getElementById("saveBtn2") && document.getElementById("saveBtn2").addEventListener("click", () => saveSingle(false));

    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveSingle(false); }
    });

    // const nav = window.__SINGLE__ || {};
    // window.addEventListener("keydown", (e) => {
    //   if (e.key === "ArrowLeft"  && nav.prevStageUrl)   { e.preventDefault(); location.href = nav.prevStageUrl; }
    //   if (e.key === "ArrowRight" && nav.nextStageUrl)   { e.preventDefault(); location.href = nav.nextStageUrl; }
    //   if (e.key === "ArrowUp"    && nav.prevChapterUrl) { e.preventDefault(); location.href = nav.prevChapterUrl; }
    //   if (e.key === "ArrowDown"  && nav.nextChapterUrl) { e.preventDefault(); location.href = nav.nextChapterUrl; }
    // });
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
        const res = await api("/api/save", {
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

      // // 章移動（ステージは維持）
      // window.addEventListener("keydown", (e) => {
      //   if (e.key === "ArrowUp" && ctx.prevChapterUrl) {
      //     e.preventDefault(); location.href = ctx.prevChapterUrl + "?stage=" + encodeURIComponent(ctx.filename);
      //   }
      //   if (e.key === "ArrowDown" && ctx.nextChapterUrl) {
      //     e.preventDefault(); location.href = ctx.nextChapterUrl + "?stage=" + encodeURIComponent(ctx.filename);
      //   }
      // });

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
