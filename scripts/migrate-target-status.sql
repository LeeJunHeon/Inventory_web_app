-- target_unit status 영어 → 한국어 전환
UPDATE target_unit SET status = '미사용' WHERE status = 'available';
UPDATE target_unit SET status = '사용중' WHERE status = 'using';
UPDATE target_unit SET status = '폐기' WHERE status = 'disposed';

-- 미사용 상태이면서 출고 트랜잭션이 연결된 타겟 → 판매완료
UPDATE target_unit
SET status = '판매완료'
WHERE status = '미사용'
  AND EXISTS (
    SELECT 1 FROM inventory_tx
    WHERE inventory_tx.target_unit_id = target_unit.id
      AND inventory_tx.tx_type = '출고'
  );

-- 결과 확인
SELECT status, COUNT(*) FROM target_unit GROUP BY status ORDER BY status;
