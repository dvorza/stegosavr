export interface GalleryImage {
  path: string;
  filename: string;
}

const base = import.meta.env.BASE_URL;

export const GALLERY_IMAGES: GalleryImage[] = [
  "048348d157ac1073c62e7a3773555349.jpg",
  "04b4f5b8dc4e0c2aeb0d1c71349fd7cb.jpg",
  "074f8475e269faf259ad8810869f59e2.jpg",
  "twodogs.jpg",
  "dicaprio.jpg",
  "33789c6301b728497fd3a7c41f82076d.jpg",
  "5099b0d394555b794d2e867bdf38b456.jpg",
  "5bb55195876f21513b07b89ac3ad1c59.jpg",
  "5f4f1151eefc4cd34f3bb7d60bd98ab8.jpg",
  "6e3229cf035041a13c2b9ff4ae512289.jpg",
  "7a68c5b90784cbb1fdb5531a7ea67885.jpg",
  "8261a90ae5f1cf7b4420c6626eac1632.jpg",
  "918405998dda322fb86024be9e85460d.jpg",
  "9e59681758e3a60814e85f402c60b6ef.jpg",
  "9f308f7e7ee217409a2cdc50c3cb437f.jpg",
  "a06376f4b5c17034366bc16e2eee617c.jpg",
  "a9888bce0833c9cfc898ce49448f9bd9.jpg",
  "c2d9074c1a448f3be2dd2dbf260b5a4c.jpg",
  "cd87a9a60736623f8890fed57a33d3e4.jpg",
  "download.png",
  "fa5623ef108591c12fc5c37dacfe4c34.jpg",
].map((filename) => ({
  filename,
  path: `${base}assets/carriers/${filename}`,
}));
