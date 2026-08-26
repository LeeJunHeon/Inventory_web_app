-- ============================================================
-- 타겟 측정 사진 (target_photo) 신규 테이블
--   실행: DBeaver 등에서 직접 실행 (prisma migrate 금지)
--   반영: 실행 후 schema.prisma 확인 → `npx prisma generate`
-- ============================================================

-- ── 1. 테이블 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS target_photo (
  id             SERIAL       PRIMARY KEY,

  -- 연결 (측정 기준). 신규 업로드는 둘 다 채움.
  target_log_id  INTEGER      REFERENCES target_log(id)  ON DELETE SET NULL,
  target_unit_id INTEGER      REFERENCES target_unit(id) ON DELETE SET NULL,

  -- 이미지 본체 (사내 표준: base64 TEXT — equipment_photos 와 동일 패턴)
  file_name      VARCHAR(255) NOT NULL,
  mime_type      VARCHAR(50)  NOT NULL,
  file_data      TEXT         NOT NULL,   -- 긴 변 1600px, JPEG q80
  thumb_data     TEXT,                    -- 긴 변  320px, JPEG q70 (갤러리 그리드용)
  file_size      INTEGER,                 -- file_data 디코딩 후 바이트
  width          INTEGER,
  height         INTEGER,

  -- 촬영 메타 (레거시는 파일명에서 파싱, 신규는 측정값에서 채움)
  taken_date     DATE,
  material_code  VARCHAR(30),
  diameter_inch  INTEGER,
  maker          VARCHAR(50),
  tag            VARCHAR(30),             -- before_sanding | after_sanding | OM | SnO2-ZnO ...

  -- 출처/판정
  source         VARCHAR(10)  NOT NULL DEFAULT 'upload',    -- upload | legacy
  match_status   VARCHAR(15)  NOT NULL DEFAULT 'confirmed', -- confirmed | candidate | unmatched
  source_path    TEXT,                    -- 레거시 원본 NAS 상대경로 (재실행 멱등성 보장)

  uploaded_by    INTEGER      REFERENCES "user"(id),
  created_at     TIMESTAMP(3) NOT NULL DEFAULT now()
);

-- ── 2. 인덱스 ────────────────────────────────────────────
-- 측정 이력 행별 사진 조회
CREATE INDEX IF NOT EXISTS idx_target_photo_log
  ON target_photo(target_log_id);

-- 타겟별 사진 타임라인 (촬영일 순)
CREATE INDEX IF NOT EXISTS idx_target_photo_unit
  ON target_photo(target_unit_id, taken_date);

-- 갤러리 필터 (물질/사이즈/기간)
CREATE INDEX IF NOT EXISTS idx_target_photo_gallery
  ON target_photo(material_code, diameter_inch, taken_date DESC);

-- 레거시 임포트 재실행 시 중복 삽입 차단 (같은 파일 두 번 안 들어감)
CREATE UNIQUE INDEX IF NOT EXISTS uq_target_photo_source_path
  ON target_photo(source_path) WHERE source_path IS NOT NULL;

-- ── 3. 코멘트 ────────────────────────────────────────────
COMMENT ON TABLE  target_photo               IS '타겟 측정 시 촬영 사진. 입고가 아니라 측정(target_log) 기준으로 연결한다.';
COMMENT ON COLUMN target_photo.file_data     IS 'base64. 목록 조회 쿼리에서 절대 SELECT 하지 말 것 (응답 폭증).';
COMMENT ON COLUMN target_photo.thumb_data    IS 'base64 썸네일. 갤러리 그리드는 이것만 사용.';
COMMENT ON COLUMN target_photo.source_path   IS '레거시 전용. NAS "Target images" 기준 상대경로.';
COMMENT ON COLUMN target_photo.match_status  IS 'confirmed=타겟 확정 / candidate=후보 복수 / unmatched=연결 대상 없음';

-- ── 4. 리더 계정 컬럼 단위 GRANT (해당 계정이 있을 때만) ──
-- equipment_photos 와 동일하게 이미지 본문 컬럼을 리더에게서 차단한다.
-- 먼저 아래로 대상 계정 존재 여부 확인:
--    SELECT rolname FROM pg_roles WHERE rolname LIKE '%reader%';
-- 존재하면 <READER> 를 바꿔서 실행:
--
-- REVOKE ALL ON target_photo FROM <READER>;
-- GRANT SELECT (id, target_log_id, target_unit_id, file_name, mime_type,
--               file_size, width, height, taken_date, material_code,
--               diameter_inch, maker, tag, source, match_status,
--               source_path, uploaded_by, created_at)
--   ON target_photo TO <READER>;
-- -- 검증: false 가 나와야 정상
-- SELECT has_column_privilege('<READER>', 'target_photo', 'file_data',  'SELECT'),
--        has_column_privilege('<READER>', 'target_photo', 'thumb_data', 'SELECT');

-- ── 5. 결과 확인 ─────────────────────────────────────────
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'target_photo'
ORDER BY ordinal_position;

SELECT indexname FROM pg_indexes WHERE tablename = 'target_photo';
