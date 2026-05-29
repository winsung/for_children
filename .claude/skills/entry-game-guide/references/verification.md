# 검증 체크리스트 (커밋 전)

콘텐츠 프로젝트라 단위 테스트가 없다. 대신 grep/태그 검증으로 갈음한다.

## 1. 학생용 정답 누출 = 0 (가장 중요)
게임의 핵심 정답 블록 라인들을 골라 학생용 파일에서 0인지 확인한다. 예(별 받기):
```
grep -c "복제본이 처음 생성\|x좌표를 -10\|점수 에 1 만큼\|y좌표 < -130\|자신의 복제본 만들기" 학생용.html
# 기대값: 0
```
> 새 게임이면 그 게임의 STEP 블록에서 특징적인 라인 5~8개를 골라 패턴을 만든다. 0이 아니면 해당 부분을 힌트로 순화한다.

## 2. 강사용 정답 블록 존재 = >0
같은 게임의 핵심 블록이 강사용엔 있어야 한다:
```
grep -c "<게임 핵심 블록 라인>" 강사용.html
# 기대값: >0
```

## 3. 디자인 토큰
```
# 강사용: 다크
grep -c "0f1117" 강사용.html        # >=1
grep -c "Noto Sans KR" 강사용.html  # >=1
# 학생용: 라이트 + iPad
grep -c "f0f4ff" 학생용.html         # >=1
grep -c "user-scalable=no" 학생용.html  # >=1
grep -c "showPage" 학생용.html       # >=1
```

## 4. 외부 JS 라이브러리 없음
```
grep -i 'script src="http' *.html   # 출력 없어야 함 (구글 폰트는 <link>라 무관)
```

## 5. 참조 스크린샷 존재
```
grep -oE 'assets/screenshots/[^"]+\.png' 강사용.html | sort -u | while read f; do
  test -f "$f" && echo "OK $f" || echo "MISSING $f"
done
# 모두 OK. MISSING이면 경로 수정하거나 img 빼고 캡션만.
```

## 6. 태그 균형 (well-formed)
```
for f in 강사용.html 학생용.html; do
  echo "$f div: $(grep -o '<div' "$f" | wc -l)/$(grep -o '</div>' "$f" | wc -l)"
done
# open == close
```

## 7. 학생용 동기화
탭 수 == `#page-N` 수 == `#check-N` 수 == `TOTAL_PAGES` 값.

## 8. index.html 연결
```
grep -c "강사용파일명\|학생용파일명" index.html   # 2 (두 카드 모두)
```
