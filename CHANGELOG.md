# Changelog

## 2026.04.10c
- Blocked duplicate friendly alias names so one friendly name cannot map to multiple systems.
- Rearranged the Settings window.
- Added a GitHub link in the Settings window header.
- Fixed the poll selector so pagination/runtime pause shows `Poll: Off` without overwriting the saved polling preference.
- Changed the mobile-layout breakpoint to 800px and stopped forcing the connection pill to full width in mobile layout.
- Fixed row copy button not copying severity and facility columns.
- Fixed mouse highlight copy inserting a newline between App and Message.

## 2026.04.10b
- Reworked the app into a cleaner modular structure for ongoing development.
- Hardened query rewriting so friendly fields, wildcard handling, and alias-aware host matching behave more consistently.
- Rebuilt polling, refresh arbitration, and progress-bar timing to reduce race conditions and keep the poll countdown aligned with actual request timing.
- Cleaned up event wiring, state handling, and config validation to make the UI less fragile.
- Added defensive work around mobile message-text inflation and other UI rough edges.

## 2026.04.10a
- Added site icon support.
- Expanded the friendly query rewrite system so common field names are easier to search.
- Changed facility searching so `facility:` means the displayed facility name, while `facility_num:` targets the numeric backend field.
- Fixed query parsing bugs around `=` and wildcard handling.
- Set default polling to Off.

## 2026.04.09b
- Changed server handling so bare host entries assume HTTPS without rewriting the saved or displayed value.
- Reworked the server status pill behavior and polling state handling.
- Fixed tab and alias wildcard matching so exact means exact and `*` enables fuzzy matching.
- Removed old debug code.
- Did a general optimization and cleanup pass.

## 2026.04.09a
- Added saved queries.

## 2026.04.08a
- Initial release.
