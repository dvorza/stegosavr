export async function renderCaptions(
  imageBytes: ArrayBuffer,
  topText: string,
  bottomText: string,
): Promise<Blob | null> {
  const top = topText.trim().toUpperCase();
  const bottom = bottomText.trim().toUpperCase();

  if (!top && !bottom) {
    return null;
  }

  const sourceBlob = new Blob([imageBytes]);
  const url = URL.createObjectURL(sourceBlob);

  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get canvas context");

    ctx.drawImage(img, 0, 0);

    if (top) drawCaption(ctx, top, canvas.width, canvas.height, "top");
    if (bottom) drawCaption(ctx, bottom, canvas.width, canvas.height, "bottom");

    return await canvasToBlob(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for caption rendering"));
    img.src = url;
  });
}

function drawCaption(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
  position: "top" | "bottom",
): void {
  const fontSize = calcFontSize(ctx, text, width);
  const maxWidth = width * 0.9;

  ctx.font = `bold ${fontSize}px Impact, "Arial Black", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const zoneHeight = height * 0.15;
  const y = position === "top" ? zoneHeight / 2 : height - zoneHeight / 2;

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = Math.max(2, fontSize * 0.08);
  ctx.lineJoin = "round";
  ctx.strokeText(text, width / 2, y, maxWidth);

  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, width / 2, y, maxWidth);
}

function calcFontSize(ctx: CanvasRenderingContext2D, text: string, imageWidth: number): number {
  const maxWidth = imageWidth * 0.9;
  let size = Math.floor(imageWidth * 0.1);
  const minSize = 20;

  while (size > minSize) {
    ctx.font = `bold ${size}px Impact, "Arial Black", sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }

  return Math.max(size, minSize);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("canvas.toBlob returned null"));
      },
      "image/jpeg",
      0.92,
    );
  });
}
