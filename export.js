/* Canvas renderer for the final tier list. Layout values are mirrored in CSS. */
(function () {
  "use strict";

  const LAYOUT = Object.freeze({
    leftW: 140,
    rowH: 140,
    img: 96,
    gap: 12,
    pad: 16,
    minRight: 1020,
    maxLabel: 74,
    imgRadius: 12,
    leftSeparator: 4,
    rightSeparator: 2,
    rightSeparatorColor: "#44444a",
    maxCanvasSide: 16384,
  });

  const imageCache = new Map();
  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");

  function labelFontFamily() {
    const value = getComputedStyle(document.documentElement).getPropertyValue("--label-font").trim();
    return value || '"Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif';
  }

  function labelFontSize(text, options = {}) {
    const maxWidth = options.maxWidth ?? LAYOUT.leftW - 24;
    const maxSize = options.maxSize ?? LAYOUT.maxLabel;
    const minSize = options.minSize ?? 9;
    const family = labelFontFamily();
    let size = maxSize;
    measureCtx.font = `900 ${size}px ${family}`;
    const width = measureCtx.measureText(text || " ").width;
    if (width > maxWidth) {
      size = Math.max(minSize, Math.floor(size * (maxWidth / width)));
    }
    return size;
  }

  function rightWidth(rows) {
    let maxItems = 0;
    for (const row of rows) maxItems = Math.max(maxItems, row.items.length);
    const content = LAYOUT.pad * 2 + maxItems * LAYOUT.img + Math.max(0, maxItems - 1) * LAYOUT.gap;
    return Math.max(LAYOUT.minRight, content);
  }

  function tierColor(index, count) {
    const t = count <= 1 ? 0 : index / (count - 1);
    const hue = 120 * t;
    return `hsl(${hue.toFixed(2)}, 74%, 53%)`;
  }

  function loadImage(src) {
    if (imageCache.has(src)) return imageCache.get(src);
    const promise = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`无法加载图片: ${src.slice(0, 80)}`));
      img.src = src;
    });
    imageCache.set(src, promise);
    promise.catch(() => imageCache.delete(src));
    return promise;
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, width, height, r);
      return;
    }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function drawCover(ctx, img, x, y, width, height) {
    const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
    const sourceWidth = width / scale;
    const sourceHeight = height / scale;
    const sourceX = (img.naturalWidth - sourceWidth) / 2;
    const sourceY = (img.naturalHeight - sourceHeight) / 2;
    ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
  }

  function drawPlaceholder(ctx, x, y, size) {
    ctx.fillStyle = "#202024";
    roundedRect(ctx, x, y, size, size, LAYOUT.imgRadius);
    ctx.fill();
    ctx.fillStyle = "#6b6b74";
    ctx.font = `600 34px ${labelFontFamily()}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", x + size / 2, y + size / 2 + 1);
  }

  async function renderPng({ rows, filename }) {
    if (typeof document.fonts?.ready?.then === "function") {
      await document.fonts.ready;
    }

    const rightW = rightWidth(rows);
    const width = LAYOUT.leftW + rightW;
    const height = rows.length * LAYOUT.rowH;
    const scale = Math.min(2, LAYOUT.maxCanvasSide / width, LAYOUT.maxCanvasSide / height);

    const sources = new Set();
    for (const row of rows) {
      for (const item of row.items) {
        if (item.src) sources.add(item.src);
      }
    }
    const loaded = new Map();
    await Promise.all(
      [...sources].map(async (src) => {
        try {
          loaded.set(src, await loadImage(src));
        } catch {
          loaded.set(src, null);
        }
      })
    );

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    rows.forEach((row, index) => {
      const y = index * LAYOUT.rowH;

      ctx.fillStyle = row.color;
      ctx.fillRect(0, y, LAYOUT.leftW, LAYOUT.rowH);

      const label = row.label || "?";
      const fontSize = labelFontSize(label);
      ctx.fillStyle = "#000000";
      ctx.font = `900 ${fontSize}px ${labelFontFamily()}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, LAYOUT.leftW / 2, y + LAYOUT.rowH / 2 + 1);

      row.items.forEach((item, itemIndex) => {
        const x = LAYOUT.leftW + LAYOUT.pad + itemIndex * (LAYOUT.img + LAYOUT.gap);
        const itemY = y + (LAYOUT.rowH - LAYOUT.img) / 2;
        const img = item.src ? loaded.get(item.src) : null;
        ctx.save();
        roundedRect(ctx, x, itemY, LAYOUT.img, LAYOUT.img, LAYOUT.imgRadius);
        ctx.clip();
        if (img) {
          try {
            drawCover(ctx, img, x, itemY, LAYOUT.img, LAYOUT.img);
          } catch {
            drawPlaceholder(ctx, x, itemY, LAYOUT.img);
          }
        } else {
          drawPlaceholder(ctx, x, itemY, LAYOUT.img);
        }
        ctx.restore();
      });

      if (index < rows.length - 1) {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, y + LAYOUT.rowH - LAYOUT.leftSeparator, LAYOUT.leftW, LAYOUT.leftSeparator);
        ctx.fillStyle = LAYOUT.rightSeparatorColor;
        ctx.fillRect(
          LAYOUT.leftW,
          y + LAYOUT.rowH - LAYOUT.rightSeparator,
          rightW,
          LAYOUT.rightSeparator
        );
      }
    });

    let blob;
    try {
      blob = await new Promise((resolve, reject) => {
        canvas.toBlob((value) => {
          if (value) resolve(value);
          else reject(new Error("浏览器未能生成图片数据。"));
        }, "image/png");
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "SecurityError") {
        throw new Error("浏览器禁止从本地文件直接导出。请先运行 npm start，再通过 http://localhost:8000 打开。");
      }
      throw error;
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    return { width: canvas.width, height: canvas.height, logicalWidth: width, logicalHeight: height };
  }

  window.TierExport = { LAYOUT, rightWidth, tierColor, labelFontSize, renderPng };
})();
