const { withSettingsGradle } = require("expo/config-plugins");

module.exports = function withoutAndroidExpoObserve(config) {
  return withSettingsGradle(config, (config) => {
    const autolink = "expoAutolinking.useExpoModules()";
    const exclusion =
      'expoAutolinking.exclude = (expoAutolinking.exclude ?: []) + ["expo-observe"]';
    const { contents } = config.modResults;
    if (!contents.includes(autolink)) {
      throw new Error("Could not find Expo autolinking in Android settings.gradle.");
    }
    // Expo runs OnCreate for registered modules, and expo-image also looks up ExpoObserve on import.
    if (!contents.includes(exclusion)) {
      config.modResults.contents = contents.replace(autolink, `${exclusion}\n${autolink}`);
    }
    return config;
  });
};
