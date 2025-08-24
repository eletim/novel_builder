// static/app.js
(function () {
  const $ = (sel, el = document) => el.querySelector(sel);

  // ── indexページ：新規チャプター作成
  const volSelect = $("#volumeSelect");
  const nextChLabel = $("#nextChLabel");
  const createBtn = $("#createChBtn");

  function updateNextLabel() {
    if (!volSelect || !nextChLabel) return;
    const opt = volSelect.selectedOptions[0];
    const next = opt?.dataset?.next || "";
    nextChLabel.textContent = next || "—";
    createBtn.disabled = !next; // 満杯(None)なら作成不可
    createBtn.title = next ? "" : "この巻はCH99まで埋まっています";
  }

  if (volSelect) {
    updateNextLabel();
    volSelect.addEventListener("change", updateNextLabel);
  }

  if (createBtn) {
    createBtn.addEventListener("click", async () => {
      const volume_path = volSelect.value;
      createBtn.disabled = true;
      try {
        const res = await fetch("/api/create_chapter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ volume_path })
        });
        if (!res.ok) {
          const text = await res.text();
          alert("作成に失敗しました: " + text);
          createBtn.disabled = false;
          return;
        }
        const data = await res.json();
        // すぐ編集に入れるよう、個別表示へ遷移
        location.href = data.single_url;
      } catch (e) {
        alert("作成に失敗しました: " + (e?.message || e));
        createBtn.disabled = false;
      }
    });
  }
})();
