(function () {
  const App = window.Aerolog;

  // Ordered migration steps. Each step upgrades an imported config object from
  // `fromVersion` up to `toVersion`. Append new entries here, lowest `fromVersion`
  // first, whenever `App.SETTINGS_VERSION` bumps and the config shape changes.
  //
  // Keep each step narrow — only touch the fields that actually changed in that
  // version, and mutate the passed-in config in place. Validators in core.js
  // still run afterward, so migrations only need to reshape keys, not re-validate
  // values.
  //
  // Shape:
  //   {
  //     fromVersion: 100,
  //     toVersion:   200,
  //     migrate(config) { /* mutate config in place */ },
  //   }
  const STEPS = [];

  function migrate(config, importVersion) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) return importVersion;
    let version = Number(importVersion);
    if (!Number.isFinite(version)) return importVersion;
    for (const step of STEPS) {
      if (version >= step.fromVersion && version < step.toVersion) {
        step.migrate(config);
        version = step.toVersion;
      }
    }
    return version;
  }

  App.settingsMigration = {
    STEPS,
    migrate,
  };
})();
