const { withAppBuildGradle } = require('expo/config-plugins')

// Prompt: Play needs an upload key; Gradle reads it from the properties file named by
// PROMPT_ANDROID_SIGNING_PROPERTIES (storeFile, storePassword, keyAlias, keyPassword). Unset keeps debug signing.
const MARKER = '// prompt-release-signing'

const SIGNING_CONFIG = `
        release { ${MARKER}
            def promptSigningPath = System.getenv('PROMPT_ANDROID_SIGNING_PROPERTIES')
            if (promptSigningPath) {
                def promptSigning = new Properties()
                file(promptSigningPath).withInputStream { promptSigning.load(it) }
                storeFile file(promptSigning['storeFile'])
                storePassword promptSigning['storePassword']
                keyAlias promptSigning['keyAlias']
                keyPassword promptSigning['keyPassword']
            }
        }`

const RELEASE_SIGNING =
  "signingConfig System.getenv('PROMPT_ANDROID_SIGNING_PROPERTIES') ? signingConfigs.release : signingConfigs.debug"

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents
    if (gradle.includes(MARKER)) {
      return cfg
    }
    gradle = gradle.replace(
      /signingConfigs \{\n/,
      (match) => `${match}${SIGNING_CONFIG.slice(1)}\n`
    )
    gradle = gradle.replace(
      /(release \{\n(?:\s*\/\/.*\n)*\s*)signingConfig signingConfigs\.debug/,
      `$1${RELEASE_SIGNING}`
    )
    if (!gradle.includes(MARKER) || !gradle.includes(RELEASE_SIGNING)) {
      throw new Error('android-release-signing: app/build.gradle layout changed; update the plugin')
    }
    cfg.modResults.contents = gradle
    return cfg
  })
}
