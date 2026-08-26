import sharp from "sharp";

/**
 * 타겟 측정 사진 이미지 처리.
 *
 * 사내 표준(equipment_photos / attendance_reason_files)은 원본을 그대로 base64로
 * 저장하지만, 타겟 사진은 레거시 일괄 임포트가 있어 그대로 두면 DB가 GB 단위로
 * 커진다. 따라서 저장 전 서버에서 반드시 리사이즈하고 썸네일을 함께 만든다.
 *   원본 8MB → 본문 약 350KB + 썸네일 약 20KB (약 1/21)
 */

/** 확장자 화이트리스트 (MIME은 브라우저별로 제각각이라 확장자로 검증) */
export const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp", "heic", "heif"] as const;

/** 업로드 허용 크기. 클라이언트에서 2048px로 줄여 올리므로 실제로는 1MB 내외 */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** 측정 기록 1건당 사진 장수 상한 */
export const MAX_PHOTOS_PER_LOG = 10;

/** 본문/썸네일 규격 — 변경 시 기존 데이터와 화질이 섞이므로 신중히 */
export const MAIN_MAX_PX = 1600;
export const MAIN_QUALITY = 80;
export const THUMB_MAX_PX = 320;
export const THUMB_QUALITY = 70;

export type ProcessedImage = {
  fileData: string;  // base64 (JPEG)
  thumbData: string; // base64 (JPEG)
  mimeType: string;  // 항상 image/jpeg — 입력이 png/heic여도 jpeg로 정규화
  fileSize: number;  // 본문 디코딩 후 바이트
  width: number;
  height: number;
};

export function extOf(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i < 0 ? "" : fileName.slice(i + 1).toLowerCase();
}

export function isAllowedExt(fileName: string): boolean {
  return (ALLOWED_EXT as readonly string[]).includes(extOf(fileName));
}

/** 저장용 파일명 — 확장자를 jpg로 통일 (본문을 항상 JPEG로 변환하므로) */
export function normalizeFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "") || "photo";
  return `${base.slice(0, 200)}.jpg`;
}

/**
 * 리사이즈 + 썸네일 생성.
 * - `.rotate()` 무인자 호출은 EXIF orientation을 적용한다. 빼면 세로 사진이 눕는다.
 * - `withoutEnlargement`로 작은 사진을 억지로 키우지 않는다.
 * - HEIC는 sharp 사전빌드 바이너리가 디코딩하지 못할 수 있다. 이 경우 throw 되며
 *   호출부에서 사용자에게 안내한다(클라이언트 canvas 변환으로 대부분 예방됨).
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const pipeline = sharp(input, { failOn: "none" }).rotate();

  const main = await pipeline
    .clone()
    .resize({ width: MAIN_MAX_PX, height: MAIN_MAX_PX, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: MAIN_QUALITY, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  const thumb = await pipeline
    .clone()
    .resize({ width: THUMB_MAX_PX, height: THUMB_MAX_PX, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
    .toBuffer();

  return {
    fileData: main.data.toString("base64"),
    thumbData: thumb.toString("base64"),
    mimeType: "image/jpeg",
    fileSize: main.data.length,
    width: main.info.width,
    height: main.info.height,
  };
}

/** sharp 디코딩 실패를 사용자용 메시지로 변환 */
export function decodeErrorMessage(fileName: string): string {
  const ext = extOf(fileName);
  if (ext === "heic" || ext === "heif") {
    return "HEIC 형식은 서버에서 변환하지 못했습니다. 아이폰 [설정 > 카메라 > 포맷]을 '높은 호환성'으로 바꾸거나, JPG로 저장해서 올려주세요.";
  }
  return "이미지를 읽을 수 없습니다. 파일이 손상되었거나 지원하지 않는 형식입니다.";
}
