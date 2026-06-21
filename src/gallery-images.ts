export interface GalleryImage {
  path: string;
  filename: string;
}

const base = import.meta.env.BASE_URL;

export const GALLERY_IMAGES: GalleryImage[] = [
  "10565_otkrytki-v-whatsapp-stali-opasn.jpg",
  "462effc74ab82d3258120105ba1b7edc.jpg",
  "bb1e2f70.jpg",
  "bcfb3a569d6a22639c12349ba8400ff0.jpg",
  "doener.png",
  "encrypted_mytischtschi.jpg",
  "mytischtschi.png",
  "photo_2024-01-19_12-53-33.jpg",
  "photo_2024-03-21_21-43-32.jpg",
  "photo_2024-12-16_17-37-30.jpg",
  "photo_2024-12-21_16-32-11.jpg",
  "photo_2025-01-14_15-09-34.jpg",
  "photo_2026-02-04_01-17-16.jpg",
  "photo_2026-02-10_04-12-56.jpg",
  "photo_2026-02-20_17-47-00.jpg",
  "photo_2026-03-24_19-24-44.jpg",
  "photo_2026-03-26_18-47-01.jpg",
  "photo_2026-04-16_12-27-39.jpg",
  "photo_2026-04-16_19-03-42.jpg",
  "photo_2026-04-19_17-52-06.jpg",
  "photo_2026-04-30_17-06-06.jpg",
  "photo_2026-05-14_14-35-32.jpg",
  "photo_2026-06-20_09-18-09.jpg",
  "photo_2026-06-20_15-25-41.jpg",
  "photo_2026-06-20_15-35-07.jpg",
  "photo_2026-06-20_15-36-54.jpg",
  "png-klev-club-gpdb-p-rassada-png-7.png",
  "png-klev-club-gyqa-p-rassada-png-17.png",
  "telegram.jpeg",
  "хуесосить.png",
  "чурчхела.png",
].map((filename) => ({
  filename,
  path: `${base}assets/carriers/${filename}`,
}));
