# MYFI — Agent Conversations (READY TO OPEN)

Coordinator = main chat (this conversation). User approval required for: migrations (incl P10-012), production wiring, src/lib changes, push/CI/APK, plan changes.

For each conversation below: open a new chat, paste the FIRST MESSAGE, then the skill loads the role.

---

## 1. MYFI Planner (المخطّط)
Skill: `myfi-planner`
Goal: scoped plan within frozen sequence; no execution code.
First message:
> اقرأ skill: myfi-planner وتبع ما فيه. ننتظر مهمة تخطيط من المنسّق. اقرأ docs/00_MYFI_CANONICAL_AUTHORITY.md و docs/01_CORE_AUTHORITY/MYFI_MASTER_PLAN_FROZEN.md أولاً.

## 2. MYFI Implementer (المنفّذ)
Skill: `myfi-implementer`
Goal: apply plan, run tests + real-device ADB acceptance, classify failures.
First message:
> اقرأ skill: myfi-implementer وتبع ما فيه. ننتظر باتش من المخطّط. ADB موجود بـ C:/Users/husse/AppData/Local/Android/Sdk/platform-tools/adb.exe، الجهاز R5CYA2T9C0M.

## 3. MYFI Reviewer + Release Gate (المراجع)
Skill: `myfi-reviewer`
Goal: pre-push code review + release-gate check (CI/SHA/docs); owns REJECT/STOP.
First message:
> اقرأ skill: myfi-reviewer وتبع ما فيه. ننتظر باتش + نتائج اختبار من المنفّذ للمراجعة.

## 4. MYFI Research / Change Intake (الباحث)
Skill: `myfi-research-intake`
Goal: research, studies, intake new user requests → place in frozen plan or flag urgent/conflicting.
First message:
> اقرأ skill: myfi-research-intake وتبع ما فيه. جاهز تستقبل تحديثات/تطويرات جديدة وتبحث وتصنع دراسات.

---

## Charter (reference, not a conversation)
Skill: `myfi-network-constitution` — roles, comms, user-approval hard-stop, frozen sequence.
