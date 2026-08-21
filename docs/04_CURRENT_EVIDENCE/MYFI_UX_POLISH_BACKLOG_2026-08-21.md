# MYFI — UX polish backlog (non-urgent), 2026-08-21

Source: user feedback (some relayed from friends who tried the app). Not
blocking, not financial-logic risk — good scope for a fresh contributor
(e.g. Codex) once current urgent bugs (see
`MYFI_USER_REPORTED_BUGS_2026-08-21.md`) are resolved.

## 1. Income/expense direction: use +/- instead of arrows

Replace arrows that indicate income/expense direction with `+` (income) and
`-` (expense) app-wide. Scope carefully: only arrows meaning financial
direction (income vs expense), not arrows used for navigation or other
unrelated purposes elsewhere in the UI.

## 2. Reinforce income/expense color coding

Green for income, red for expense — confirm this is applied consistently
everywhere amounts/directions are shown.

## 3. Password visibility toggle everywhere

Every password input field in the app (login, signup, any other password
entry — audit for all locations, don't assume just login/signup) needs a
show/hide toggle button. Currently missing.

## Not yet scoped for implementation

This file is a backlog capture, not an approved patch. Before work starts:
confirm exact arrow locations (grep the codebase for direction-indicator
icons used for income/expense specifically), confirm all password-field
locations, and get a quick user sign-off on the specific screens affected
if there's any ambiguity.
