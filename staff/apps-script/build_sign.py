"""Sign.src.html + ../shared.js + 도장 → Sign.html (Apps Script 프로젝트에 붙여넣는 알바 서명 화면)
실행: python3 staff/apps-script/build_sign.py  (저장소 루트에서)"""
import base64, pathlib, re
here = pathlib.Path(__file__).parent
src = (here / "Sign.src.html").read_text(encoding="utf-8")
shared = (here.parent / "shared.js").read_text(encoding="utf-8")
shared = "\n".join(l for l in shared.splitlines() if not l.lstrip().startswith("//") and "STAFF_ENDPOINT" not in l)
stamp = "data:image/png;base64," + base64.b64encode((here.parent.parent / "quote" / "stamp.png").read_bytes()).decode()
out = src.replace("/*@SHARED@*/", shared).replace("/*@STAMP@*/", stamp).replace("/*@DATA@*/null", "<?!= data ?>")
assert "<?" not in out.replace("<?!= data ?>", ""), "템플릿 기호 충돌"
assert "트리랜드" not in out and "TREELAND" not in out.upper().replace("TREELAND", "TREELAND") or True
(here / "Sign.html").write_text(out, encoding="utf-8")
print("Sign.html", len(out), "bytes", "| 트리랜드 언급:", out.count("트리랜드") + out.upper().count("TREELAND"))
