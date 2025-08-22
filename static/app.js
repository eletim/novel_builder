// static/app.js
(function () {
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  const toast = $("#toast");
  function showToast(msg, ok = true) {
    if (!toast) return;
    toast.textContent = msg;
    toast.style.borderColor = ok ? "var(--ok)" : "var(--err)";
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => (toast.hidden = true), 1600);
  }

  // 既存：一覧（4カラム）
  const grid = $("#editorGrid");
  if (grid) {
    const chapterPath = grid.dataset.chapter;

    $$(".pane").forEach(pane => {
      const ta = $(".editor", pane);
      const dirty = $(".dirty", pane);
      if (!ta || !dirty) return;
      ta.addEventListener("input", () => { dirty.hidden = false; });
    });

    $$(".btn-save", grid).forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const pane = e.target.closest(".pane");
        await savePane(pane);
      });
    });

    const saveAllBtn = $("#saveAllBtn");
    saveAllBtn && saveAllBtn.addEventListener("click", async () => {
      for (const pane of $$(".pane", grid)) {
        await savePane(pane, true);
      }
      const notesPane = document.querySelector(`#notesWrap .pane`);
      if (notesPane && !notesPane.closest("#notesWrap").hidden) {
        await savePane(notesPane, true);
      }
      showToast("すべて保存しました");
    });

    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveAllBtn?.click();
      }
    });

    async function savePane(pane, quiet = false) {
      const filename = pane.dataset.filename;
      const ta = $(".editor", pane);
      const dirty = $(".dirty", pane);
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
      dirty.hidden = true;
      if (!quiet) showToast(`${filename} を保存しました`);
      return true;
    }

    const toggleNotes = $("#toggleNotes");
    const notesWrap = $("#notesWrap");
    if (toggleNotes && notesWrap) {
      toggleNotes.addEventListener("change", () => {
        notesWrap.hidden = !toggleNotes.checked;
      });
    }
  }

  const singlePane = document.querySelector("#singlePane");
  if (singlePane) {
    const chapterPath = singlePane.dataset.chapter;
    const filename = singlePane.dataset.filename;
    const editor = document.querySelector("#singleEditor");
    const dirty = singlePane.querySelector(".dirty");

    editor.addEventListener("input", () => { dirty.hidden = false; });

    const saveBtn = document.querySelector("#saveBtn");
    const saveBtn2 = document.querySelector("#saveBtn2");
    async function saveSingle(quiet = false) {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapter_path: chapterPath, filename, content: editor.value }),
      });
      if (!res.ok) {
        const text = await res.text();
        if (!quiet) showToast("保存に失敗: " + text, false);
        return false;
      }
      dirty.hidden = true;
      if (!quiet) showToast(`${filename} を保存しました`);
      return true;
    }
    saveBtn  && saveBtn.addEventListener("click", () => saveSingle(false));
    saveBtn2 && saveBtn2.addEventListener("click", () => saveSingle(false));

    // キーボード：左右=ステージ、上下=章
    const nav = window.__SINGLE__ || {};
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault(); saveSingle(false); return;
      }
      if (e.key === "ArrowLeft"  && nav.prevStageUrl)   { e.preventDefault(); location.href = nav.prevStageUrl; }
      if (e.key === "ArrowRight" && nav.nextStageUrl)   { e.preventDefault(); location.href = nav.nextStageUrl; }
      if (e.key === "ArrowUp"    && nav.prevChapterUrl) { e.preventDefault(); location.href = nav.prevChapterUrl; }
      if (e.key === "ArrowDown"  && nav.nextChapterUrl) { e.preventDefault(); location.href = nav.nextChapterUrl; }
    });
  }
})();
