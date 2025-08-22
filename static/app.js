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

  // 章画面のみ動かす
  const grid = $("#editorGrid");
  if (grid) {
    const chapterPath = grid.dataset.chapter;

    // 入力監視（未保存印）
    $$(".pane").forEach(pane => {
      const ta = $(".editor", pane);
      const dirty = $(".dirty", pane);
      if (!ta || !dirty) return;
      ta.addEventListener("input", () => {
        dirty.hidden = false;
      });
    });

    // 保存（個別）
    $$(".btn-save", grid).forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const pane = e.target.closest(".pane");
        await savePane(pane);
      });
    });

    // すべて保存
    const saveAllBtn = $("#saveAllBtn");
    saveAllBtn && saveAllBtn.addEventListener("click", async () => {
      for (const pane of $$(".pane", grid)) {
        await savePane(pane, /*quiet*/ true);
      }
      // notes が開いていればそれも
      const notesPane = $(`#notesWrap .pane`);
      if (notesPane && !notesPane.closest("#notesWrap").hidden) {
        await savePane(notesPane, true);
      }
      showToast("すべて保存しました");
    });

    // Ctrl+S = すべて保存
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

    // notes 表示切替
    const toggleNotes = $("#toggleNotes");
    const notesWrap = $("#notesWrap");
    if (toggleNotes && notesWrap) {
      toggleNotes.addEventListener("change", () => {
        notesWrap.hidden = !toggleNotes.checked;
      });
    }
  }
})();
