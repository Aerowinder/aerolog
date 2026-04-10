# Changelog

## 2026.04.10a
- Added site icon support.
- Expanded the friendly query rewrite system so common field names are easier to search.
- Changed facility searching so `facility:` means the displayed facility name, while `facility_num:` targets the numeric backend field.
- Fixed query parsing bugs around `=` and wildcard handling.
- Set default polling to Off.

## 2026.04.09b
- Changed server handling so bare host entries assume HTTPS without rewriting the saved/displayed value.
- Reworked the server status pill behavior and polling state handling.
- Fixed tab and alias wildcard matching so exact means exact and `*` enables fuzzy matching.
- Removed old debug code.
- Did a general optimization and cleanup pass.

## 2026.04.09a
- Added saved queries.

## 2026.04.08a
- Initial release.
